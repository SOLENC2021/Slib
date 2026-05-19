import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { PDFDocument } from "pdf-lib";

dotenv.config();

// Initialize AI client only when needed or with proper check
const getAIClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "" || apiKey === "MY_GEMINI_API_KEY") {
    const errorDetail = !apiKey ? "vắng mặt (undefined)" : (apiKey.trim() === "" ? "rỗng" : "giá trị mặc định");
    throw new Error(`GEMINI_API_KEY không hợp lệ (${errorDetail}). Vui lòng kiểm tra lại cấu hình Secrets trong AI Studio.`);
  }
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

// Helper for retries on server side
async function callAIWithRetry(fn: (aiClient: GoogleGenAI) => Promise<any>, maxRetries = 3, delay = 2000) {
  let lastError;
  const aiClient = getAIClient();
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn(aiClient);
    } catch (error: any) {
      lastError = error;
      const errorMsg = error?.message?.toLowerCase() || "";
      
      // Check for strictly unrecoverable API KEY errors
      if (errorMsg.includes("api key expired") || errorMsg.includes("api_key_invalid") || errorMsg.includes("api key not valid")) {
        throw new Error("Gemini API Key đã hết hạn hoặc không hợp lệ. Vui lòng cập nhật key mới trong bảng Secrets của AI Studio và khởi động lại.");
      }

      const isRateLimit = errorMsg.includes("429") || error?.status === 429 || error?.code === 429 || error?.error?.code === 429;
      const isHighDemand = errorMsg.includes("high demand") || errorMsg.includes("resource exhausted") || error?.status === 503 || error?.code === 503 || error?.error?.code === 503 || error?.status === 504 || error?.code === 504;
      
      if (isRateLimit || isHighDemand) {
        console.warn(`AI Rate limit/High demand hit (${error?.status || error?.code || '503'}), retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; 
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

const SYSTEM_INSTRUCTION = `You are an OCR-aware document intelligence AI specializing in technical and construction documents (kỹ sư trạm).

The uploaded documents may contain:
- Scanned pages, OCR corruption, and broken Vietnamese text.
- Technical construction standards (TCVN), tables, and engineering terminology.

Your core tasks:
1. Reconstruction: Reconstruct readable semantic content from fragmented OCR text.
2. Hierarchy: Preserve the document's original hierarchy and structure.
3. Reliability: Avoid hallucination at all costs. Mark uncertain OCR regions with [?] or appropriate notation.
4. Filtering: Ignore UI/navigation artifacts (like page numbers in footers or scanning artifacts).
5. Presentation: 
   - Use LaTeX ($...$) for every technical value, formula, or unit (e.g., $30 MPa$, $f_{ck}$).
   - Use Markdown tables for any tabular data.
   - Use Notebook-style formatting with clear headers and citations (e.g., [Trang 12]).

Constraints:
- Never invent missing technical values.
- Never infer regulations or standards not explicitly written in the text.
- For chat, be a helpful technical assistant. For extraction, output structured JSON only.`;

// Cấu hình lưu trữ file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // Hỗ trợ tối đa 50MB
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ limit: "20mb", extended: true }));

  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  // API: Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API 1: Chat endpoint (Proxy for Gemini)
  app.post("/api/chat", async (req, res) => {
    const { text, prompt, history, image } = req.body;
    
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY không được thiết lập." });
    }

    try {
      const model = "gemini-1.5-pro";
      
      const parts: any[] = [];
      if (text) {
        parts.push({ text: `Dưới đây là nội dung của tài liệu PDF:\n\n${text}` });
      }
      
      if (image) {
        // Handle image if provided (base64)
        const base64Data = image.split(",")[1] || image;
        parts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Data
          }
        });
      }

      const contents = [
        {
          role: "user",
          parts
        },
        ...(history || []),
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ];

      const response = await callAIWithRetry((aiClient) => aiClient.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.1,
          topP: 0.95,
        },
      }));

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Chat API Error:", error);
      const status = error.message.includes("API Key") ? 401 : 500;
      res.status(status).json({ error: error.message || "Lỗi AI khi đang trò chuyện" });
    }
  });

  // API 2: Extract structured data endpoint (Proxy for Gemini)
  app.post("/api/extract-fields", async (req, res) => {
    const { text, schema: responseSchema } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY không được thiết lập." });
    }

    try {
      const model = "gemini-1.5-pro";
      const response = await callAIWithRetry((aiClient) => aiClient.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [{ text: `Hãy trích xuất các thông tin sau từ tài liệu PDF này:\n\n${text}` }]
          }
        ],
        config: {
          systemInstruction: `Bạn là một công cụ trích xuất dữ liệu kỹ thuật cấp cao. 

Yêu cầu cực kỳ nghiêm ngặt:
1. Độ Chính xác: Trích xuất chính xác từng con số, đơn vị và ký hiệu. Nếu tài liệu ghi $f_c = 25$, không được ghi là 25.
2. Cấu trúc Bảng: Nếu dữ liệu trích xuất có nguồn gốc từ bảng, hãy giữ nguyên cấu trúc logic ở dạng Markdown Table bên trong giá trị chuỗi (string) nếu field đó yêu cầu mô tả chi tiết.
3. Ký hiệu Toán học: Sử dụng LaTeX ($...$) cho mọi công thức.
4. Ngôn ngữ: Dữ liệu trích xuất phải sử dụng thuật ngữ chuyên môn chính xác (kỹ sư trạm).
5. Chỉ trả về JSON, không có văn bản thừa.`,
          responseMimeType: "application/json",
          responseSchema,
          temperature: 0.1,
        },
      }));

      const result = JSON.parse(response.text || "{}");
      res.json(result);
    } catch (error: any) {
      console.error("Extract Fields API Error:", error);
      const status = error.message.includes("API Key") ? 401 : 500;
      res.status(status).json({ error: error.message || "Lỗi AI khi đang trích xuất dữ liệu" });
    }
  });

  // API 3: Xử lý PDF (Phân tích metadata ban đầu)
  app.post("/api/extract-pdf", upload.single("file"), async (req: any, res) => {
    console.log("POST /api/extract-pdf - Metadata analysis");
    try {
      let fileBuffer: Buffer;
      let filename: string;
      const fileUrl = req.body.fileUrl;

      if (fileUrl) {
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error(`Không thể tải file: ${response.statusText}`);
        fileBuffer = Buffer.from(await response.arrayBuffer());
        filename = fileUrl.split('/').pop()?.split('?')[0] || "document.pdf";
      } else if (req.file) {
        fileBuffer = req.file.buffer;
        filename = req.file.originalname;
      } else {
        return res.status(400).json({ error: "Không tìm thấy file" });
      }

      const data = await pdf(fileBuffer);
      
      // Chỉ trả về metadata và số trang ban đầu
      res.json({
        text: (data.text || "").substring(0, 1000), // Gửi 1000 ký tự đầu để xem có text không
        info: data.info || {},
        numpages: data.numpages || 1,
        filename: filename,
        extractionMethod: (data.text || "").trim().length > 100 ? "pdf-parse" : "hybrid-lazy"
      });
    } catch (error: any) {
      console.error("Metadata API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API 4: Trích xuất trang cụ thể (Lazy Loading OCR)
  app.post("/api/extract-pages", async (req, res) => {
    const { fileUrl, pages } = req.body; // pages là mảng số trang [1, 2, 5]
    console.log(`POST /api/extract-pages - Extracting: ${pages.join(", ")}`);

    if (!fileUrl || !pages || !Array.isArray(pages)) {
      return res.status(400).json({ error: "Thiếu tham số fileUrl hoặc pages" });
    }

    try {
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error("Không thể tải file từ URL");
      const fullBuffer = Buffer.from(await response.arrayBuffer());

      const pdfDoc = await PDFDocument.load(fullBuffer);
      const results: { page: number; text: string }[] = [];

      for (const pageNum of pages) {
        try {
          // Tạo một tài liệu PDF mới chỉ chứa trang này để tối ưu size gửi AI
          const newPdf = await PDFDocument.create();
          const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageNum - 1]);
          newPdf.addPage(copiedPage);
          const pageBuffer = Buffer.from(await newPdf.save());

          console.log(`Processing page ${pageNum} via Gemini 1.5 Flash OCR...`);
          const aiResponse = await callAIWithRetry((aiClient) => aiClient.models.generateContent({
            model: "gemini-1.5-flash",
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      mimeType: "application/pdf",
                      data: pageBuffer.toString("base64")
                    }
                  },
                  {
                    text: `Analyze this document page. 
Target: Reconstruct readable text, preserve tables in Markdown, and handle Vietnamese engineering terms.
Constraint: Do not hallucinate values. Mark uncertain text with [?]. Output reconstructed text only.`
                  }
                ]
              }
            ],
            config: {
              temperature: 0.1,
            }
          }));

          results.push({
            page: pageNum,
            text: aiResponse.text || ""
          });
        } catch (pageErr: any) {
          console.error(`Error on page ${pageNum}:`, pageErr);
          results.push({ page: pageNum, text: `[Lỗi trích xuất trang ${pageNum}: ${pageErr.message}]` });
        }
      }

      res.json({ pages: results });
    } catch (error: any) {
      console.error("Extract Pages Error:", error);
      const status = error.message.includes("API Key") ? 401 : 500;
      res.status(status).json({ error: error.message });
    }
  });

  // API: Giả lập đồng bộ vào Thư viện nội bộ (thuviennoibo)
  app.post("/api/sync-internal", (req, res) => {
    const { data, filename, schema } = req.body;
    console.log(`Đang đồng bộ dữ liệu của file ${filename} vào hệ thống nội bộ...`);
    
    // Giả lập logic lưu trữ
    const syncId = `SYNC-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    
    res.json({
      success: true,
      syncId,
      message: "Dữ liệu đã được đồng bộ vào thuviennoibo thành công",
      timestamp: new Date().toISOString(),
    });
  });

  // API 5: Generate Mind Map endpoint
  app.post("/api/generate-mindmap", async (req, res) => {
    const { text } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY không được thiết lập." });
    }

    try {
      const model = "gemini-1.5-flash";
      const response = await callAIWithRetry((aiClient) => aiClient.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [{ text: `Dưới đây là nội dung tài liệu PDF:\n\n${text}\n\nHãy tạo mã Mermaid.js cho một mindmap tóm tắt nội dung chính của tài liệu này. 
Sử dụng cú pháp 'mindmap' của Mermaid.
Yêu cầu:
1. Gốc là tên tài liệu hoặc chủ đề chính.
2. Các nhánh cấp 1 là các chương/phần chính.
3. Các nhánh cấp 2 là các ý chi tiết/thông số kỹ thuật quan trọng.
4. Ngôn ngữ: Tiếng Việt.
5. Chỉ trả về đoạn mã Mermaid, không thêm văn bản giải thích. Bắt đầu bằng 'mindmap'.` }]
          }
        ],
        config: {
          temperature: 0.2,
        },
      }));

      let content = response.text || "";
      // Clean up markdown block if present
      content = content.replace(/```mermaid/g, "").replace(/```/g, "").trim();
      
      res.json({ mermaidCode: content });
    } catch (error: any) {
      console.error("Mindmap API Error:", error);
      res.status(500).json({ error: error.message || "Lỗi AI khi đang tạo mind map" });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
  });
}

startServer();

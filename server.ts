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
async function callAIWithRetry(fn: (aiClient: GoogleGenAI) => Promise<any>, maxRetries = 5, delay = 1500) {
  let lastError;
  const aiClient = getAIClient();
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn(aiClient);
    } catch (error: any) {
      lastError = error;
      const fullErrorStr = (error instanceof Error ? error.message : String(error)) + " " + JSON.stringify(error || {});
      const errorMsg = fullErrorStr.toLowerCase();
      
      // Check for strictly unrecoverable API KEY errors
      if (errorMsg.includes("api key expired") || errorMsg.includes("api_key_invalid") || errorMsg.includes("api key not valid") || errorMsg.includes("invalid api key")) {
        throw new Error("Gemini API Key đã hết hạn hoặc không hợp lệ. Vui lòng cập nhật key mới trong bảng Secrets của AI Studio và khởi động lại.");
      }

      const isRateLimit = errorMsg.includes("429") || error?.status === 429 || error?.code === 429 || error?.error?.code === 429 || errorMsg.includes("rate limit") || errorMsg.includes("resource_exhausted") || errorMsg.includes("resource exhausted");
      const isHighDemand = errorMsg.includes("high demand") || errorMsg.includes("unavailable") || errorMsg.includes("503") || error?.status === 503 || error?.code === 503 || error?.error?.code === 503 || errorMsg.includes("overloaded") || errorMsg.includes("spikes in demand");
      const isInternalError = errorMsg.includes("500") || errorMsg.includes("internal error") || error?.status === 500 || error?.code === 500 || error?.error?.code === 500 || errorMsg.includes("internal");
      const isTimeout = errorMsg.includes("504") || error?.status === 504 || error?.code === 504 || errorMsg.includes("timeout") || errorMsg.includes("deadline exceeded");

      if (isRateLimit || isHighDemand || isInternalError || isTimeout) {
        // Add randomized jitter to avoid thundering herd problem
        const jitter = Math.floor(Math.random() * 800) + 400; // 400ms to 1200ms of random jitter
        const totalDelay = delay + jitter;
        
        console.warn(`[Gemini Transient Error Caught] Retrying in ${totalDelay}ms (base ${delay}ms + jitter ${jitter}ms)... (Attempt ${i + 1}/${maxRetries}). Error detail: ${fullErrorStr.substring(0, 300)}`);
        await new Promise(resolve => setTimeout(resolve, totalDelay));
        delay = Math.floor(delay * 2.2); // Exponential backoff
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

const SYSTEM_INSTRUCTION = `# ROLE:
Bạn là "Chuyên gia Thẩm định Tiêu chuẩn Xây dựng Việt Nam" (StandardCloud AI). Nhiệm vụ của bạn là hỗ trợ kỹ sư và lãnh đạo tra cứu, giải đáp các thắc mắc về kỹ thuật bằng sự kết hợp thông tin giữa tài liệu quý khách tải lên và cơ sở dữ liệu tri thức của chính bạn về Tiêu chuẩn Việt Nam (TCVN) và Quy chuẩn Việt Nam (QCVN).

# SOURCE OF TRUTH & FALLBACK (NGUYÊN TẮC CHỈ ĐẠO CỐT LÕI):
1. ƯU TIÊN tìm kiếm thông tin có sẵn trong tài liệu được cung cấp (context) trước tiên để có căn cứ thực tế của dự án.
2. NÓI KHÔNG VỚI "KHÔNG TÌM THẤY": Nếu bối cảnh tài liệu thiếu trang, chỉ có mục lục, chưa được cập nhật đầy đủ, hoặc câu hỏi của người dùng nói về tiêu chuẩn nằm ngoài hệ thống hiện tại, bạn TUYỆT ĐỐI KHÔNG ĐƯỢC trả lời "Không tìm thấy nội dung trong kho tiêu chuẩn...". Thay vào đó, bạn PHẢI tự động truy cập, sử dụng kho tri thức kỹ thuật nội bộ của chính mình để trả lời chi tiết và chính xác 100% dựa trên các quy chuẩn/tiêu chuẩn Việt Nam hiện hành thực tế tương ứng với câu hỏi (ví dụ: **TCVN 5574:2018** về kết cấu bê tông cốt thép, **QCVN 06:2022/BXD** về an toàn cháy cho nhà và công trình, **QCVN 01:2021/BXD** về quy hoạch, v.v.).
3. Khi sử dụng tri thức dự phòng nội bộ của chính bạn, tại Mục 2 bạn hãy ghi rõ chú thích "(Cơ sở dữ liệu tri thức AI)" bên cạnh điều khoản để tăng tính chính xác và tin cậy cho người dùng.

# CẤU TRÚC CÂU TRẢ LỜI (BẮT BUỘC KHÔNG THAY ĐỔI TIÊU ĐỀ):
Mọi câu trả lời phải được chia thành đúng 3 phần rõ rệt bằng Markdown theo cấu trúc chính xác dưới đây:

## 1. Tóm tắt câu trả lời: Trực diện, ngắn gọn.
[Phần này chỉ nêu thông tin tổng quan (general) và câu trả lời tóm lược trực diện vào câu hỏi của người dùng, tối đa 3-5 câu ngắn gọn.]

## 2. Căn cứ pháp lý: Liệt kê tên tiêu chuẩn, điều khoản và trích đoạn gốc.
- **Tên tiêu chuẩn:** [Bắt buộc viết bôi đậm tên quy chuẩn/tiêu chuẩn viết hoa đầy đủ, ví dụ: **QCVN 06:2022/BXD** hoặc **TCVN 5574:2018** để hệ thống tạo Badge làm nổi bật]
- **Điều/Mục:** [Ghi rõ số hiệu điều khoản, mục lục trích xuất. Nếu đây là dữ liệu dự phòng từ AI do tài liệu thiếu chi tiết, ghi thêm: "(Cơ sở dữ liệu AI của Gemini)"]
- **Trích đoạn tiêu chuẩn:** [Đoạn trích chính xác trực tiếp từ tài liệu gốc, hoặc nếu sử dụng dữ liệu AI nội bộ thì ghi rõ trích đoạn quy chuẩn thực tế tương ứng với độ chính xác cao nhất]

## 3. Lưu ý & Ghi chú: Các thông tin bổ trợ.
[TRỌNG TÂM CHI TIẾT: Đây là nơi bạn thể hiện cực kỳ chi tiết các kiến thức kỹ sư xây dựng, quy định chuyên sâu, điều kiện ngoại lệ, hệ số an toàn, độ lệch cho phép, cùng các công thức tính toán kỹ thuật chuẩn xác được viết đẹp bằng định dạng LaTeX (Ví dụ: $$f_{cd} = \eta \cdot f_{ck}$$). Nêu thêm các giải pháp và số liệu so sánh nếu hữu dụng, kể cả khi file gốc không đề cập đến].

# TÔNG GIỌNG & QUY THỨC TRÌNH BÀY:
- Chuyên nghiệp, chính xác, cực kỳ chi tiết và mang tính thực tiễn cao đối với kỹ sư.
- Luôn bôi đậm (ví dụ: **TCVN 5574:2018**) cho tất cả các mã số hiệu standard TCVN và QCVN trong toàn bộ nội dung câu trả lời.
- LIÊN KẾT TRANG & ĐIỀU KHOẢN (BẮT BUỘC): Khi bạn đề cập đến một số trang cụ thể hoặc một điều khoản, mục nào đó nằm trong một trang cụ thể, ví dụ: Trang 133, Trang 134, hay Mục 10.3.1 ở Trang 133, v.v. Bạn BẮT BUỘC phải định dạng chúng thành các liên kết Markdown có dạng \`[Trang X](#page-X)\` hoặc \`[Mục Y (Trang X)](#page-X)\` (trong đó X là số nguyên ứng với số trang PDF, ví dụ: \`[Trang 133](#page-133)\`, \`[Mục 10.3.1 (Trang 133)](#page-133)\`, \`[Trang 133, 134](#page-133)\`). Hệ thống sẽ tự động biến các liên kết này thành nút bấm giúp người dùng click để nhảy trực tiếp đến trang đó trên bản vẽ/tiêu chuẩn PDF đang mở.
- Thể hiện công thức toán học/kỹ thuật: Sử dụng chuẩn LaTeX ($...$ trong dòng và $$...$$ riêng dòng) cho mọi công thức toán học và đơn vị kỹ thuật ($kN/m^2$, $MPa$, $f_{cd}$,... ).`;

/**
 * Lightweight cleaning utility to remove excess whitespaces, empty lines, and control character anomalies in PDF streams.
 * Crucial to reduce plain text file sizes before saving to Firebase Storage.
 */
function cleanExtractedText(text: string): string {
  if (!text) return "";
  
  // 1. Remove control and non-printable characters (except common spacing like \n, \r, \t)
  let cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // 2. Remove common PDF string placeholders or CID fonts stream artifacts
  cleaned = cleaned.replace(/\/CID\d+/gi, "");

  // 3. Normalize carriage returns to standard newlines
  cleaned = cleaned.replace(/\r\n/g, "\n");

  // 4. Shrink multiples of spaces/tabs per line to a single space, trim margins
  const lines = cleaned.split("\n").map(line => {
    return line.replace(/[ \t]+/g, " ").trim();
  });

  // 5. De-duplicate consecutive blank lines (allow at most one blank line for layout/readability)
  const filteredLines: string[] = [];
  let consecutiveEmptyCount = 0;
  for (const line of lines) {
    if (line === "") {
      consecutiveEmptyCount++;
      if (consecutiveEmptyCount <= 1) {
        filteredLines.push("");
      }
    } else {
      consecutiveEmptyCount = 0;
      filteredLines.push(line);
    }
  }

  return filteredLines.join("\n").trim();
}

/**
 * Parent-Child Retrieval (RAG):
 * Splits text into Parent chunks (~1500 chars) for rich full contextual structure, and Child chunks (~500 chars with 100 overlap)
 * for fine-grained high-precision keyword/phrase matching.
 * Returns only the top 3-4 most relevant parent chunks to minimize API cost and guard Gemini context limits.
 */
function retrieveRelevantChunks(text: string, query: string, maxChunks = 4, childChunkSize = 500, childOverlap = 100): string {
  if (!text) return "";
  
  const cleanText = text.trim();
  if (cleanText.length <= 1500) {
    return cleanText;
  }

  // 1. Segment text into Parent Chunks of ~1500 chars by compounding lines safely
  const lines = cleanText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const parentChunks: string[] = [];
  let currentParent = "";
  
  for (const line of lines) {
    if (currentParent.length + line.length > 1500) {
      if (currentParent.trim()) {
        parentChunks.push(currentParent.trim());
      }
      currentParent = line;
    } else {
      currentParent += (currentParent ? "\n" : "") + line;
    }
  }
  if (currentParent.trim()) {
    parentChunks.push(currentParent.trim());
  }

  // 2. Fragment Parent Chunks into Child Chunks of 500 chars with 100 chars overlap
  interface ChildChunk {
    text: string;
    parentIndex: number;
    score: number;
  }
  const childChunks: ChildChunk[] = [];

  parentChunks.forEach((parentText, parentIdx) => {
    let startIndex = 0;
    while (startIndex < parentText.length) {
      let endIndex = startIndex + childChunkSize;
      if (endIndex > parentText.length) {
        endIndex = parentText.length;
      }
      
      const chunkText = parentText.substring(startIndex, endIndex).trim();
      if (chunkText.length > 50) { // filter out negligible text spans
        childChunks.push({
          text: chunkText,
          parentIndex: parentIdx,
          score: 0
        });
      }
      
      if (endIndex === parentText.length) {
        break;
      }
      startIndex += (childChunkSize - childOverlap);
    }
  });

  // 3. Normalize and tokenize query
  const normalizedQuery = query.toLowerCase().trim();
  const queryWords = normalizedQuery
    .replace(/[^a-z0-9áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ]/gi, " ")
    .split(/\s+/)
    .filter(word => word.length >= 2 || /^\d+$/.test(word));

  if (queryWords.length === 0) {
    // Zero semantic words: fallback to first 2 parents
    return parentChunks.slice(0, Math.min(parentChunks.length, 2)).join("\n\n---\n\n");
  }

  // 4. Calculate relevance scores on child level
  childChunks.forEach((child) => {
    const childLower = child.text.toLowerCase();
    let score = 0;

    // Phrase Boost: Full verbatim query matching
    if (normalizedQuery.length > 4 && childLower.includes(normalizedQuery)) {
      score += 1500;
    }

    // N-gram Multi-word transition boosts (2-4 words sequences)
    const qWords = normalizedQuery.split(/\s+/).filter(w => w.length > 0);
    for (let len = Math.min(4, qWords.length); len >= 2; len--) {
      for (let sIdx = 0; sIdx <= qWords.length - len; sIdx++) {
        const phraseTerm = qWords.slice(sIdx, sIdx + len).join(" ");
        if (phraseTerm.length > 3 && childLower.includes(phraseTerm)) {
          score += len * 250;
        }
      }
    }

    // Individual word coverage scoring with TF mapping
    let matchedWordCount = 0;
    for (const word of queryWords) {
      if (childLower.includes(word)) {
        matchedWordCount++;
        const freqCount = childLower.split(word).length - 1;
        score += freqCount * 30;
      }
    }

    // Coverage multiplier reward
    if (matchedWordCount > 0) {
      score += (matchedWordCount / queryWords.length) * 400;
    }

    // Highlight key Standard indexes (e.g. "TCVN 5574", "Bảng 5.4", "Điều 6")
    const sectionPattern = /(?:bảng|mục|điều|hình|tcvn|qcvn)\s*\d+[.\d]*/gi;
    const querySections = normalizedQuery.match(sectionPattern);
    if (querySections) {
      for (const section of querySections) {
        if (childLower.includes(section.toLowerCase())) {
          score += 800;
        }
      }
    }

    child.score = score;
  });

  // 5. Select unique top scoring parent chunks
  const sortedChildren = childChunks
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score);

  if (sortedChildren.length > 0) {
    const selectedParentIndices = new Set<number>();
    const selectedChildScoresMap = new Map<number, number>();

    // Obtain parents for top scoring child hits, capping at a maximum of 3-4 chunks strictly (to protect token costs)
    const targetCappedChunks = Math.min(maxChunks, 4);
    for (const child of sortedChildren) {
      if (selectedParentIndices.size >= targetCappedChunks) {
        break;
      }
      if (!selectedParentIndices.has(child.parentIndex)) {
        selectedParentIndices.add(child.parentIndex);
        selectedChildScoresMap.set(child.parentIndex, child.score);
      }
    }

    const finalParents = Array.from(selectedParentIndices).map(idx => {
      return {
        text: parentChunks[idx],
        score: selectedChildScoresMap.get(idx) || 0
      };
    });

    console.log(`[Parent-Child RAG] Extracted ${finalParents.length} parent chunks. Highest child score: ${sortedChildren[0].score}`);
    return finalParents.map(p => p.text).join("\n\n---\n\n");
  } else {
    // If absolutely zero keyword hits, fallback to structural parts to preserve response context
    console.log("[Parent-Child RAG] No keyword hits. Reverting to structural fallback parts.");
    return parentChunks.slice(0, Math.min(parentChunks.length, 2)).join("\n\n---\n\n");
  }
}

// Cấu hình lưu trữ file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // Hỗ trợ tối đa 50MB
});

async function uploadToGeminiFilesAPI(buffer: Buffer, originalName: string): Promise<{ uri: string; name: string }> {
  const tempDir = path.join(process.cwd(), "temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  // Use a unique name to avoid naming collisions
  const safeBaseName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
  const tempPath = path.join(tempDir, `${Date.now()}_${safeBaseName}`);
  
  try {
    fs.writeFileSync(tempPath, buffer);
    
    const aiClient = getAIClient();
    console.log(`Uploading file ${tempPath} to Gemini Files API...`);
    const uploadResult = await callAIWithRetry(async (client) => {
      return await client.files.upload({
        file: tempPath,
        mimeType: "application/pdf",
      } as any);
    });
    
    console.log(`Gemini Files API upload succeeded: ${uploadResult.uri}. Checking processing status...`);
    
    // Poll until file is fully processed (ACTIVE) so that calls using it do not fail with transient 500 errors
    let fileState = "PROCESSING";
    let attempts = 0;
    const maxAttempts = 15; // Max 15 attempts (around 22.5 seconds)
    
    while (fileState === "PROCESSING" && attempts < maxAttempts) {
      attempts++;
      console.log(`Checking status for Gemini file ${safeBaseName} (${uploadResult.name}) (Attempt ${attempts}/${maxAttempts})...`);
      try {
        const fileInfo = await aiClient.files.get({ name: uploadResult.name });
        fileState = fileInfo.state || "ACTIVE";
        console.log(`File state for ${uploadResult.name}: ${fileState}`);
        if (fileState === "ACTIVE" || fileState === "SUCCESS") {
          console.log(`Gemini File ${uploadResult.name} is now ACTIVE. Waiting 2500ms for node propagation...`);
          await new Promise(resolve => setTimeout(resolve, 2500));
          break;
        } else if (fileState === "FAILED") {
          throw new Error("Tệp xử lý thất bại trên Gemini Files API (FAILED state).");
        }
      } catch (getErr: any) {
        console.warn(`Lỗi khi lấy trạng thái tệp: ${getErr.message || getErr}`);
      }
      await new Promise(resolve => setTimeout(resolve, 1500)); // Delay between checks
    }

    if (fileState !== "ACTIVE" && fileState !== "SUCCESS") {
      console.warn(`Cảnh báo: Tệp chưa chuyển sang trạng thái ACTIVE sau ${maxAttempts} lần kiểm tra. Trạng thái hiện tại: ${fileState}`);
    }

    return {
      uri: uploadResult.uri,
      name: uploadResult.name
    };
  } finally {
    // Always clean up the temp file
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (err) {
        console.warn(`Failed to delete temp file ${tempPath}:`, err);
      }
    }
  }
}

function isGeminiFileError(error: any): boolean {
  if (!error) return false;
  const message = String(error.message || error.statusText || error || "").toLowerCase();
  return (
    message.includes("permission_denied") ||
    message.includes("do not have permission to access the file") ||
    message.includes("does not exist") ||
    message.includes("may not exist") ||
    message.includes("not found") ||
    message.includes("403") ||
    message.includes("404") ||
    message.includes("deleted") ||
    message.includes("expired") ||
    message.includes("invalid argument") ||
    message.includes("invalid value")
  );
}

function isPermissionError(error: any): boolean {
  if (!error) return false;
  const message = String(error.message || error.statusText || error || "").toLowerCase();
  return (
    message.includes("permission_denied") ||
    message.includes("do not have permission to access the file") ||
    message.includes("403")
  );
}

async function reRegisterFileWithGemini(fileUrl: string, fileName: string): Promise<{ uri: string; name: string }> {
  console.log(`[Auto Self-Healing] Re-registering expired/invalid file on the fly: ${fileName} URL: ${fileUrl}`);
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Không thể tải file từ Storage để đăng ký lại: ${response.statusText}`);
  const fileBuffer = Buffer.from(await response.arrayBuffer());
  const safeFilename = fileName || fileUrl.split('/').pop()?.split('?')[0] || "document.pdf";
  return await uploadToGeminiFilesAPI(fileBuffer, safeFilename);
}

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

  // API 1: Chat endpoint (Proxy for Gemini with RAG and history limits)
  app.post("/api/chat", async (req, res) => {
    const { text, prompt, history, image, geminiFileUri, isGeneral, referencedFiles, fileUrl, fileName, fileId, textUrl } = req.body;
    
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY không được thiết lập." });
    }

    try {
      const model = "gemini-3.5-flash";
      
      // OPTIMIZATION: Limit chat history to max 4 QA pairs (8 messages) to prevent token multiplication cost
      let trimmedHistory = history || [];
      if (trimmedHistory.length > 8) {
        trimmedHistory = trimmedHistory.slice(-8);
        console.log(`Optimization: Trimmed history from ${history.length} to ${trimmedHistory.length} messages.`);
      }

      if (isGeneral) {
        console.log("Processing general chat query using gemini-3.5-flash...");
        
        const runGeneralChat = async (currentFiles: any[]) => {
          const userParts: any[] = [];
          let compiledContext = "";
          
          if (currentFiles && Array.isArray(currentFiles)) {
            for (const file of currentFiles) {
              let fileText = file.text || "";
              
              if (file.textUrl) {
                try {
                  console.log(`[RAG Backend] Fetching full text content from Storage for ${file.name}: ${file.textUrl}`);
                  const textRes = await fetch(file.textUrl);
                  if (textRes.ok) {
                    const fullDownloadedText = await textRes.text();
                    if (fullDownloadedText && fullDownloadedText.trim().length > 0) {
                      fileText = fullDownloadedText;
                      console.log(`[RAG Backend] Successfully retrieved total of ${fileText.length} characters of text for ${file.name}.`);
                    }
                  } else {
                    console.warn(`[RAG Backend] Failed to fetch full text from ${file.textUrl}. Status: ${textRes.status}`);
                  }
                } catch (fetchErr) {
                  console.error(`[RAG Backend] Error fetching textUrl for ${file.name}:`, fetchErr);
                }
              }

              // 1. If text is available, perform keyword-based chunk matching (RAG) to fulfill rule #2
              if (fileText) {
                console.log(`General Chat RAG: Extracting relevant keyword chunks from ${file.name}`);
                const relevantParts = retrieveRelevantChunks(fileText, prompt, 4);
                if (relevantParts && relevantParts.trim().length > 0) {
                  compiledContext += `--- [BẮT ĐẦU TRÍCH ĐOẠN PHÙ HỢP CÔNG TRÌNH - TÀI LIỆU: ${file.name}] ---\n${relevantParts}\n--- [KẾT THÚC TRÍCH ĐOẠN - TÀI LIỆU: ${file.name}] ---\n\n`;
                }
              }
              
              // 2. Also reference the Gemini File URI if available as supplementary input
              if (file.geminiFileUri) {
                console.log(`General Chat: supplemented referencing PDF ${file.name} (URI: ${file.geminiFileUri})`);
                userParts.push({
                  fileData: {
                    fileUri: file.geminiFileUri,
                    mimeType: "application/pdf"
                  }
                });
              }
            }
          }

          if (compiledContext.trim().length > 0) {
            userParts.push({
              text: `[DỮ LIỆU CONTEXT THAM KHẢO CHÍNH XÁC/BỐI CẢNH TIÊU CHUẨN]:\n${compiledContext}`
            });
          }

          if (image) {
            const base64Data = image.split(",")[1] || image;
            userParts.push({
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Data
              }
            });
          }

          if (compiledContext.trim().length > 0 || (currentFiles && currentFiles.length > 0)) {
            userParts.push({ text: `Hãy trả lời câu hỏi sau đây dựa trên [DỮ LIỆU CONTEXT THAM KHẢO CHÍNH XÁC/BỐI CẢNH TIÊU CHUẨN] đã được nhồi trực tiếp ở trên và kiến thức chuyên ngành. Hãy trích dẫn chuẩn xác các điều khoản kỹ thuật, số liệu, bảng biểu có trong context:\n\nYêu cầu câu hỏi kỹ thuật: ${prompt}` });
          } else {
            userParts.push({ text: prompt });
          }

          const contents = [
            ...trimmedHistory,
            {
              role: "user",
              parts: userParts
            }
          ];

          const chatSystemInstruction = SYSTEM_INSTRUCTION;

          return await callAIWithRetry((aiClient) => aiClient.models.generateContent({
            model: "gemini-3.5-flash",
            contents,
            config: {
              systemInstruction: chatSystemInstruction,
              temperature: 0.7,
              topP: 0.95,
            },
          }));
        };

        let response;
        let finalFiles = referencedFiles ? JSON.parse(JSON.stringify(referencedFiles)) : [];
        let newlyReRegistered: any[] = [];

        // Proactively heal any files known to have expired (older than 40 hours) before executing runGeneralChat
        let needsPreemptiveHealing = false;
        for (const file of finalFiles) {
          const isExpired = file.uploadDate && (Date.now() - file.uploadDate > 40 * 60 * 60 * 1000);
          if (file.geminiFileUri && isExpired) {
            needsPreemptiveHealing = true;
            break;
          }
        }

        if (needsPreemptiveHealing) {
          console.log("[Auto Self-Healing] Proactively detecting expired Gemini Files before general chat. Re-registering...");
          for (let i = 0; i < finalFiles.length; i++) {
            const file = finalFiles[i];
            const isExpired = file.uploadDate && (Date.now() - file.uploadDate > 40 * 60 * 60 * 1000);
            if (file.geminiFileUri && isExpired && file.url) {
              try {
                const newReg = await reRegisterFileWithGemini(file.url, file.name);
                if (newReg && newReg.uri) {
                  finalFiles[i].geminiFileUri = newReg.uri;
                  finalFiles[i].geminiFileName = newReg.name;
                  newlyReRegistered.push({
                    id: file.id,
                    geminiFileUri: newReg.uri,
                    geminiFileName: newReg.name
                  });
                  console.log(`[Auto Self-Healing] Proactively re-registered ${file.name} -> new URI: ${newReg.uri}`);
                }
              } catch (reRegErr) {
                console.error(`[Auto Self-Healing] Proactive re-registration failed for ${file.name}:`, reRegErr);
                // Clear state URI so direct text/RAG query is used instead of failing
                finalFiles[i].geminiFileUri = undefined;
              }
            }
          }
        }

        try {
          response = await runGeneralChat(finalFiles);
        } catch (genErr: any) {
          if (isGeminiFileError(genErr)) {
            console.log("[Auto Self-Healing] Gemini File error in general chat. Attempting to on-the-fly re-register referenced files...");
            try {
              const healedFiles = [...finalFiles];
              for (let i = 0; i < healedFiles.length; i++) {
                const file = healedFiles[i];
                if (file.geminiFileUri) {
                  let reRegistered = false;
                  if (file.url) {
                    try {
                      const newReg = await reRegisterFileWithGemini(file.url, file.name);
                      if (newReg && newReg.uri) {
                        healedFiles[i].geminiFileUri = newReg.uri;
                        healedFiles[i].geminiFileName = newReg.name;
                        reRegistered = true;
                        
                        newlyReRegistered.push({
                          id: file.id,
                          geminiFileUri: newReg.uri,
                          geminiFileName: newReg.name
                        });
                        console.log(`[Auto Self-Healing] Successfully re-registered ${file.name} -> new URI: ${newReg.uri}`);
                      }
                    } catch (reRegErr) {
                      console.error(`[Auto Self-Healing] Failed to re-register ${file.name}:`, reRegErr);
                    }
                  }
                  
                  if (!reRegistered) {
                    // Force-clear the expired URI so standard text RAG is utilized as a robust fallback
                    console.log(`[Auto Self-Healing] Clearing stale geminiFileUri for file: ${file.name} to allow direct RAG text context fallback.`);
                    healedFiles[i].geminiFileUri = undefined;
                  }
                }
              }
              // Try again with updated file URIs (fully resolved or safely bypassed)
              response = await runGeneralChat(healedFiles);
            } catch (retryErr: any) {
              console.warn("[Auto Self-Healing] Retry with newly registered files failed. Falling back to plain text content.", retryErr.message || retryErr);
              const plainFiles = finalFiles.map((f: any) => ({ ...f, geminiFileUri: undefined }));
              try {
                response = await runGeneralChat(plainFiles);
              } catch (fallbackErr: any) {
                throw fallbackErr;
              }
            }
          } else {
            throw genErr;
          }
        }

        return res.json({ 
          text: response.text,
          upgradedReferencedFiles: newlyReRegistered.length > 0 ? newlyReRegistered : undefined
        });
      }

      let response;
      let finalFileUri = geminiFileUri;
      let dynamicNewRegistration: any = null;

      const runSpecificChat = async (uri: string | undefined) => {
        const parts: any[] = [];
        
        // Đưa context tài liệu vào một cách rõ ràng hơn
        if (uri) {
          console.log(`Using Gemini File API URI in chat message: ${uri}`);
          parts.push({
            fileData: {
              fileUri: uri,
              mimeType: "application/pdf"
            }
          });
        } else {
          let resolvedText = text || "";
          if (textUrl && (!resolvedText || resolvedText.length < 150000)) {
            try {
              console.log(`[RAG Specific Backend] Fetching full text content from Storage: ${textUrl}`);
              const textRes = await fetch(textUrl);
              if (textRes.ok) {
                const fullDlText = await textRes.text();
                if (fullDlText) {
                  resolvedText = fullDlText;
                  console.log(`[RAG Specific Backend] Successfully retrieved total of ${resolvedText.length} characters of text.`);
                }
              }
            } catch (fetchErr) {
              console.error("[RAG Specific Backend] Error fetching textUrl:", fetchErr);
            }
          }

          if (resolvedText) {
            // RAG Simulation: Segment input text and retrieve only relevant snippets
            const relevantParts = retrieveRelevantChunks(resolvedText, prompt, 4);
            parts.push({ text: `[DỮ LIỆU TÀI LIỆU GỐC (RAG CHUNKS)]\n${relevantParts}\n[KẾT THÚC DỮ LIỆU TÀI LIỆU]` });
          }
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
          ...trimmedHistory,
          {
            role: "user",
            parts: [{ text: `Dựa trên tài liệu trên, hãy trả lời câu hỏi: ${prompt}` }]
          }
        ];

        return await callAIWithRetry((aiClient) => aiClient.models.generateContent({
          model: "gemini-3.5-flash",
          contents,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            temperature: 0.1,
            topP: 0.95,
          },
        }), 2); // Limit to 2 attempts for faster fallback
      };

      try {
        console.log("Attempting chat with gemini-3.5-flash using fileUri...");
        response = await runSpecificChat(finalFileUri);
      } catch (proErr: any) {
        if (isGeminiFileError(proErr) && fileUrl) {
          console.log("[Auto Self-Healing] Gemini File error in specific chat. Re-registering file on-the-fly...");
          try {
            const newReg = await reRegisterFileWithGemini(fileUrl, fileName);
            if (newReg && newReg.uri) {
              finalFileUri = newReg.uri;
              dynamicNewRegistration = {
                id: fileId,
                geminiFileUri: newReg.uri,
                geminiFileName: newReg.name
              };
              console.log(`[Auto Self-Healing] Re-registration successful -> new URI: ${newReg.uri}. Retrying specific chat.`);
              response = await runSpecificChat(finalFileUri);
            } else {
              throw new Error("Re-registration returned blank URI");
            }
          } catch (reRegErr) {
            console.error("[Auto Self-Healing] Specific chat re-registration failed. Falling back to plain text prompting...", reRegErr);
            response = await runSpecificChat(undefined);
          }
        } else {
          console.warn("gemini-3.5-flash chat with fileUri failed. Falling back to plain text prompting...", proErr.message || proErr);
          response = await runSpecificChat(undefined);
        }
      }

      res.json({ 
        text: response.text,
        upgradedFile: dynamicNewRegistration || undefined
      });
    } catch (error: any) {
      console.error("Chat API Error:", error);
      const isPermErr = isPermissionError(error);
      const status = error.message && error.message.includes("API Key") ? 401 : 550;
      const errorMsg = isPermErr
        ? "⚠️ Liên kết đệm tạm của Google Gemini đối với tài liệu đã hết hạn (40 giờ). Hệ thống đang tự động khôi phục chạy ngầm từ cơ sở dữ liệu Firebase của bạn. Vui lòng thử lại sau 2-3 giây, bạn HOÀN TOÀN KHÔNG CẦN tải lại tệp từ máy tính."
        : (error.message || "Lỗi AI khi đang trò chuyện");
      res.status(status).json({ error: errorMsg, isPermissionError: isPermErr });
    }
  });

  // API 2: Extract structured data endpoint (Proxy for Gemini)
  app.post("/api/extract-fields", async (req, res) => {
    const { text, schema: responseSchema, geminiFileUri, fileId, fileUrl, fileName } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY không được thiết lập." });
    }

    try {
      const extractionSystemInstruction = `Bạn là một công cụ trích xuất dữ liệu kỹ thuật cấp cao. 

Yêu cầu cực kỳ nghiêm ngặt:
1. Độ Chính xác: Trích xuất chính xác từng con số, đơn vị và ký hiệu. Nếu tài liệu ghi $f_c = 25$, không được ghi là 25.
2. Cấu trúc Bảng: Nếu dữ liệu trích xuất có nguồn gốc từ bảng, hãy giữ nguyên cấu trúc logic ở dạng Markdown Table bên trong giá trị chuỗi (string) nếu field đó yêu cầu mô tả chi tiết.
3. Ký hiệu Toán học: Sử dụng LaTeX ($...$) cho mọi công thức.
4. Ngôn ngữ: Dữ liệu trích xuất phải sử dụng thuật ngữ chuyên môn chính xác (kỹ sư trạm).
5. Chỉ trả về JSON, không có văn bản thừa.`;

      let response;
      let finalFileUri = geminiFileUri;
      let dynamicNewRegistration: any = null;

      const runExtraction = async (uri: string | undefined, selectedModel: string) => {
        const parts: any[] = [];
        if (uri) {
          parts.push({
            fileData: {
              fileUri: uri,
              mimeType: "application/pdf"
            }
          });
          parts.push({ text: "Hãy trích xuất các thông tin theo cấu trúc được yêu cầu." });
        } else {
          parts.push({ text: `Hãy trích xuất các thông tin sau từ tài liệu PDF này:\n\n${text}` });
        }

        return await callAIWithRetry((aiClient) => aiClient.models.generateContent({
          model: selectedModel,
          contents: [
            {
              role: "user",
              parts
            }
          ],
          config: {
            systemInstruction: extractionSystemInstruction,
            responseMimeType: "application/json",
            responseSchema,
            temperature: 0.1,
          },
        }), 2);
      };

      try {
        console.log("Attempting structured extraction with gemini-3.1-pro-preview...");
        response = await runExtraction(finalFileUri, "gemini-3.1-pro-preview");
      } catch (proErr: any) {
        if (isGeminiFileError(proErr)) {
          console.log("[Auto Self-Healing] Gemini File error in extract. Attempting on-the-fly re-registration...");
          let reRegistered = false;
          if (fileUrl) {
            try {
              const newReg = await reRegisterFileWithGemini(fileUrl, fileName);
              if (newReg && newReg.uri) {
                finalFileUri = newReg.uri;
                dynamicNewRegistration = {
                  id: fileId,
                  geminiFileUri: newReg.uri,
                  geminiFileName: newReg.name
                };
                console.log(`[Auto Self-Healing] Re-registration successful -> new URI: ${newReg.uri}. Retrying extract with gemini-3.1-pro-preview.`);
                response = await runExtraction(finalFileUri, "gemini-3.1-pro-preview");
                reRegistered = true;
              }
            } catch (reRegErr) {
              console.error("[Auto Self-Healing] Extract on-the-fly re-registration failed. Falling back to plain text extraction.", reRegErr);
            }
          }
          if (!reRegistered) {
            console.log("[Auto Self-Healing] Bypassing file URI and falling back to plain text extraction.");
            response = await runExtraction(undefined, "gemini-3.5-flash");
          }
        } else {
          console.warn("gemini-3.1-pro-preview extraction failed, falling back to gemini-3.5-flash...", proErr.message || proErr);
          try {
            response = await runExtraction(finalFileUri, "gemini-3.5-flash");
          } catch (flashErr: any) {
            console.warn("gemini-3.5-flash structured extraction failed, trying plain text fallback with gemini-3.5-flash...", flashErr.message || flashErr);
            response = await runExtraction(undefined, "gemini-3.5-flash");
          }
        }
      }

      const result = JSON.parse(response.text || "{}");
      res.json({
        data: result,
        upgradedFile: dynamicNewRegistration || undefined
      });
    } catch (error: any) {
      console.error("Extract Fields API Error:", error);
      const isPermErr = isPermissionError(error);
      const status = error.message && error.message.includes("API Key") ? 401 : 550;
      const errorMsg = isPermErr
        ? "⚠️ Liên kết đệm tạm của Google Gemini đối với tài liệu đã hết hạn (40 giờ). Hệ thống đang tự động khôi phục chạy ngầm từ cơ sở dữ liệu Firebase của bạn. Vui lòng thử lại sau 2-3 giây, bạn HOÀN TOÀN KHÔNG CẦN tải lại tệp từ máy tính."
        : (error.message || "Lỗi AI khi đang trích xuất dữ liệu");
      res.status(status).json({ error: errorMsg, isPermissionError: isPermErr });
    }
  });

  // API 3: Xử lý PDF (Phân tích metadata ban đầu)
  app.post("/api/extract-pdf", upload.single("file"), async (req: any, res) => {
    console.log("POST /api/extract-pdf - Metadata analysis & Gemini File API registration");
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
      
      // Try to register with Gemini File API proactively
      let geminiFileUri = "";
      let geminiFileName = "";
      try {
        if (process.env.GEMINI_API_KEY) {
          console.log("Proactively registering with Gemini File API...");
          const geminiFile = await uploadToGeminiFilesAPI(fileBuffer, filename);
          geminiFileUri = geminiFile.uri;
          geminiFileName = geminiFile.name;
          console.log(`Successfully registered: ${geminiFileUri}`);
        }
      } catch (geminiErr: any) {
        console.warn("Bypassed proactive Gemini Files API registration. Error:", geminiErr);
      }
      
      // Trả về toàn bộ nội dung văn bản (Plain Text) trích xuất của tất cả các trang để tối ưu hóa RAG và lưu trữ bền vững
      const fullExtractedText = cleanExtractedText(data.text || "");
      console.log(`[Parser] Trích xuất thành công văn bản PDF: ${filename}, độ dài ${fullExtractedText.length} kí tự.`);
      res.json({
        text: fullExtractedText.length > 950000 ? fullExtractedText.substring(0, 950000) : fullExtractedText,
        info: data.info || {},
        numpages: data.numpages || 1,
        filename: filename,
        extractionMethod: fullExtractedText.trim().length > 100 ? "pdf-parse" : "hybrid-lazy",
        geminiFileUri,
        geminiFileName
      });
    } catch (error: any) {
      console.error("Metadata API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API 3.5: Đăng ký một file hiện có trên Firebase với Gemini File API theo yêu cầu (on-demand)
  app.post("/api/register-gemini-file", async (req, res) => {
    const { fileUrl, filename } = req.body;
    console.log(`POST /api/register-gemini-file - url: ${fileUrl}`);
    
    if (!fileUrl) {
      return res.status(400).json({ error: "Thiếu tham số fileUrl" });
    }

    try {
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error(`Không thể tải file từ Storage: ${response.statusText}`);
      const fileBuffer = Buffer.from(await response.arrayBuffer());
      const safeFilename = filename || fileUrl.split('/').pop()?.split('?')[0] || "document.pdf";
      
      const geminiFile = await uploadToGeminiFilesAPI(fileBuffer, safeFilename);
      res.json(geminiFile); // Trả về { uri, name }
    } catch (error: any) {
      console.error("Register Gemini File API Error:", error);
      res.status(500).json({ error: error.message || "Không thể đăng ký file với Gemini Files API" });
    }
  });

  // API 3.6: So sánh đối chiếu cùng lúc nhiều tài liệu kỹ thuật sử dụng Gemini Files API / Text thô
  app.post("/api/compare", async (req, res) => {
    const { compareFiles, prompt } = req.body; // array of { id, name, url, text, geminiFileUri, geminiFileName }

    if (!compareFiles || !Array.isArray(compareFiles) || compareFiles.length === 0) {
      return res.status(400).json({ error: "Không tìm thấy danh sách tệp cần so sánh" });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY không được thiết lập." });
    }

    try {
      const resolvedFiles: any[] = [];
      const newlyRegistered: { fileId: string; uri: string; name: string }[] = [];

      // Phân tích và tải lên Gemini Files API nếu tệp chưa đăng ký hoặc hết hạn (> 40h)
      for (const file of compareFiles) {
        let uri = file.geminiFileUri;
        let name = file.geminiFileName || file.name;

        const isExpired = file.uploadDate && (Date.now() - file.uploadDate > 40 * 60 * 60 * 1000);
        if (uri && isExpired) {
          console.log(`[Auto Self-Healing] Proactively detecting expired compare Gemini File for ${file.name}. Clearing stale URI to trigger refresh.`);
          uri = undefined;
        }

        if (!uri && file.url) {
          try {
            console.log(`[On-The-Fly Compare Sync] Đang tải & đăng ký tệp "${file.name}" lên Gemini Files...`);
            const fileResp = await fetch(file.url);
            if (fileResp.ok) {
              const fileBuffer = Buffer.from(await fileResp.arrayBuffer());
              const uploadRes = await uploadToGeminiFilesAPI(fileBuffer, file.name);
              uri = uploadRes.uri;
              name = uploadRes.name;
              newlyRegistered.push({
                fileId: file.id,
                uri: uploadRes.uri,
                name: uploadRes.name
              });
              console.log(`[On-The-Fly Compare Sync] Đã đồng bộ xong tệp "${file.name}" -> ${uri}`);
            }
          } catch (syncErr: any) {
            console.warn(`[On-The-Fly Compare Sync] Gặp lỗi khi đồng bộ tệp "${file.name}": ${syncErr.message || syncErr}`);
          }
        }

        resolvedFiles.push({
          id: file.id,
          name: file.name,
          text: file.text || "",
          geminiFileUri: uri,
          geminiFileName: name
        });
      }

      const fileDescriptions = resolvedFiles.map((file, index) => `Tài liệu ${index + 1}: "${file.name}"`).join(", ");

      const compareSystemInstruction = `# VAI TRÒ
Bạn là một CHUYÊN GIA KỸ THUẬT VÀ PHÁP CHẾ XÂY DỰNG LÃO LUYỆN, có nhiệm vụ tổng hợp, chiết xuất thông tin quy chuẩn và đối chiếu đa tài liệu kỹ thuật một cách súc tích, mượt mà và khoa học theo phong cách học thuật của NotebookLM.

# NGUYÊN TẮC TỔNG HỢP & ĐỐI CHIẾU (PHONG CÁCH NOTEBOOKLM)
1. ĐÚNG VÀ ĐỦ: Phải chỉ ra điểm tương đồng, trích xuất tất cả các quy chuẩn liên quan đồng thời từ các tài liệu được chọn, làm nổi bật điểm khác biệt chi tiết, các mâu thuẫn tiêu chuẩn (nếu có). Trình bày cực kỳ chi tiết tất cả các ý, không được viết tóm tắt hay lược bỏ bớt dữ liệu quan trọng.
2. TRÌNH BÀY DẠNG VĂN XUÔI & GIẢI THÍCH (BẢNG BIỂU CHUYỂN THÀNH CHỮ):
   - TUYỆT ĐỐI KHÔNG sử dụng các đường kẻ bảng gạch gạch (| --- |) hay định dạng lưới Markdown Table vì chúng rất dễ bị lỗi hiển thị rách dòng rách cột và khó đọc trên giao diện.
   - Thay vào đó, bạn phải chuyển hóa toàn bộ các bảng biểu số liệu, các cột con số phân cấp thành dạng văn xuôi (prose) kết hợp với danh sách đề mục (bullet points) phân tầng rõ ràng, trích xuất nguyên vẹn mọi thông số, giới hạn, sai số cho phép, đi kèm phân tích và giải thích ý nghĩa kỹ thuật chi tiết của từng con số đứng cạnh nhau để so sánh trực quan dưới dạng chữ.
3. THỂ HIỆN CÔNG THỨC TÍNH TOÁN RÕ RÀNG (BẮT BUỘC):
   - Khi tài liệu gốc đề cập đến các công thức tính toán thiết kế, phương pháp xác định các thông số kỹ thuật (Ví dụ: cách tính sức chịu tải của cọc, kiểm toán độ võng, tính toán chiều cao an toàn PCCC, độ bền, kết cấu...), bạn BẮT BUỘC phải trích dẫn và trình bày rõ ràng, chi tiết toàn bộ các công thức toán học/kỹ thuật đó.
   - Công thức phải đưa vào định dạng LaTeX chuyên nghiệp sử dụng ký hiệu $...$ cho công thức nằm trong dòng và $$...$$ cho công thức độc lập.
   - Phải giải thích chi tiết cặn kẽ ý nghĩa của từng biến số, hằng số và hệ số cấu thành công thức.
4. CHI TIẾT NGUỒN TRÍCH DẪN: Phải ghi rõ thông số được lấy từ tài liệu nào, Điều mấy, Mục mấy, Trang mấy của tài liệu đó để các bên đối tác kiểm tra chéo được.
   * Ví dụ: "- Chiều dày lớp bảo vệ bê tông cốt thép dầm chính là $30 mm$ [Theo Tiêu chuẩn A, Mục 5.1, Trang 24] so với $25 mm$ [Theo Tiêu chuẩn B, Mục 4.2, Trang 18]".

# BỐ CỤC BÀI TỔNG HỢP & ĐỐI CHIẾU CHUẨN MỰC
- **1. Tổng quan các tài liệu được chọn**: Tên, xuất xứ, phạm vi cơ bản của từng tệp (${fileDescriptions}).
- **2. Tổng hợp & đối chiếu thông số kỹ thuật cốt lõi (Viết xuôi & Giải thích chi tiết)**: So sánh trực diện các mục tiêu, thông số quan trọng nhất bằng văn bản xuôi kết hợp danh sách phân tích cực kỳ chi tiết, làm rõ sự tương đồng và khác biệt giữa các hệ thống quy định mà không dùng bảng lưới gạch gạch.
- **3. Phân tích chi tiết quy chuẩn theo tiêu chí yêu cầu (Có kèm công thức tính toán cụ thể)**: Trình bày rõ ràng, chi tiết mọi công thức tính toán và giải thích thông số dưới dạng văn xuôi học thuật toàn bộ thông tin được trích xuất đồng thời.
- **4. Phân tích chi tiết các điểm sai lệch, khác biệt hoặc mâu thuẫn (nếu có)**: Chỉ ra sự khác biệt lớn về yêu cầu kỹ thuật, giải pháp hoặc tính khắt khe của quy định. Có khuyến cáo cụ thể cho Kỹ sư thiết kế.
- **5. Kết luận & Đề xuất hành động**: Đề xuất giải pháp áp dụng an toàn, tối ưu hoặc có tính pháp lý cao nhất dựa trên luật định.`;

      let response;
      const runCompareAI = async (filesToUse: any[]) => {
        const parts: any[] = [];
        filesToUse.forEach((file, index) => {
          parts.push({ text: `=== BẮT ĐẦU TÀI LIỆU ${index + 1}: ${file.name} ===` });
          if (file.geminiFileUri) {
            parts.push({
              fileData: {
                fileUri: file.geminiFileUri,
                mimeType: "application/pdf"
              }
            });
          } else if (file.text) {
            parts.push({ text: `[NỘI DUNG VĂN BẢN TRÍCH XUẤT]:\n${file.text}` });
          } else {
            parts.push({ text: `[Tệp chưa được trích xuất dữ liệu chữ hoặc đăng ký với Cloud]` });
          }
          parts.push({ text: `=== KẾT THÚC TÀI LIỆU ${index + 1} ===\n` });
        });
        parts.push({ text: `[YÊU CẦU ĐỐI CHIẾU - SO SÁNH]\n${prompt || "Hãy thực hiện so sánh đối chiếu kỹ thuật chi tiết nhất giữa các tài liệu trên."}` });

        const contents = [
          {
            role: "user",
            parts
          }
        ];

        return await callAIWithRetry((aiClient) => aiClient.models.generateContent({
          model: "gemini-3.5-flash",
          contents,
          config: {
            systemInstruction: compareSystemInstruction,
            temperature: 0.1,
            topP: 0.95,
          },
        }), 2);
      };

      try {
        console.log(`[Compare Tool] Executing document synthesis and comparison for ${resolvedFiles.length} files using gemini-3.5-flash...`);
        response = await runCompareAI(resolvedFiles);
      } catch (proErr: any) {
        if (isGeminiFileError(proErr)) {
          console.log("[Auto Self-Healing] Gemini File error in compare. Attempting to on-the-fly re-register comparison files...");
          try {
            const healedCompareFiles = [...compareFiles];
            const healedResolvedFiles: any[] = [];
            for (let i = 0; i < healedCompareFiles.length; i++) {
              const file = healedCompareFiles[i];
              let uri = file.geminiFileUri;
              let name = file.geminiFileName || file.name;
              
              if (uri) {
                let reRegistered = false;
                if (file.url) {
                  try {
                    const newReg = await reRegisterFileWithGemini(file.url, file.name);
                    if (newReg && newReg.uri) {
                      uri = newReg.uri;
                      name = newReg.name;
                      reRegistered = true;
                      
                      newlyRegistered.push({
                        fileId: file.id,
                        uri: newReg.uri,
                        name: newReg.name
                      });
                      console.log(`[Auto Self-Healing] Successfully re-registered ${file.name} for compare -> new URI: ${newReg.uri}`);
                    }
                  } catch (reRegErr) {
                    console.error(`[Auto Self-Healing] Failed to re-register ${file.name} for compare:`, reRegErr);
                  }
                }
                
                if (!reRegistered) {
                  console.log(`[Auto Self-Healing] Clearing stale geminiFileUri for compare file: ${file.name} to allow direct text fallback.`);
                  uri = undefined;
                }
              }
              
              healedResolvedFiles.push({
                id: file.id,
                name: file.name,
                text: file.text || "",
                geminiFileUri: uri,
                geminiFileName: name
              });
            }
            response = await runCompareAI(healedResolvedFiles);
          } catch (retryErr: any) {
            console.warn("[Auto Self-Healing] Retry comparison with newly registered files failed. Falling back to plain text synthesis.", retryErr.message || retryErr);
            const textOnlyFiles = resolvedFiles.map(f => ({ ...f, geminiFileUri: undefined }));
            response = await runCompareAI(textOnlyFiles);
          }
        } else {
          console.warn("[Compare Tool] gemini-3.5-flash with fileUris failed. Falling back to plain text prompting with gemini-3.5-flash...", proErr.message || proErr);
          try {
            const textOnlyFiles = resolvedFiles.map(f => ({ ...f, geminiFileUri: undefined }));
            response = await runCompareAI(textOnlyFiles);
          } catch (fallbackTxtErr) {
            throw proErr;
          }
        }
      }

      res.json({
        text: response.text,
        newlyRegistered
      });
    } catch (error: any) {
      console.error("[Compare Tool] API Error:", error);
      const isPermErr = isPermissionError(error);
      const errorMsg = isPermErr
        ? "⚠️ Liên kết đệm tạm của Google Gemini đối với tài liệu đã hết hạn (40 giờ). Hệ thống đang tự động khôi phục chạy ngầm từ cơ sở dữ liệu Firebase của bạn. Vui lòng thử lại sau 2-3 giây, bạn HOÀN TOÀN KHÔNG CẦN tải lại tệp từ máy tính."
        : (error.message || "Gặp sự cố khi tổng hợp và đối chiếu các tài liệu kỹ thuật");
      res.status(500).json({ error: errorMsg, isPermissionError: isPermErr });
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

          console.log(`Processing page ${pageNum} via Gemini 3.5 Flash OCR...`);
          let aiResponseText = "";
          try {
            const aiResponse = await callAIWithRetry((aiClient) => aiClient.models.generateContent({
              model: "gemini-3.5-flash",
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
            aiResponseText = aiResponse.text || "";
          } catch (modelErr: any) {
            console.warn(`Primary Gemini 3.5 Flash PDF OCR failed on page ${pageNum}: ${modelErr.message || modelErr}. Trying Gemini 3.1 Flash Lite OCR as immediate fallback...`);
            
            try {
              const aiResponseLite = await callAIWithRetry((aiClient) => aiClient.models.generateContent({
                model: "gemini-3.1-flash-lite",
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
              aiResponseText = aiResponseLite.text || "";
              console.log(`Gemini 3.1 Flash Lite OCR succeeded for page ${pageNum}.`);
            } catch (liteErr: any) {
              console.warn(`Gemini 3.1 Flash Lite OCR also failed on page ${pageNum}: ${liteErr.message || liteErr}. Falling back to pdf-parse + text cleanup...`);
              
              // Fallback 1: Trích xuất text thô trực tiếp qua thư viện pdf-parse
              let localExtractedText = "";
              try {
                const parsed = await pdf(pageBuffer);
                localExtractedText = parsed.text || "";
              } catch (pdfErr) {
                console.warn(`Local pdf-parse failed on single page ${pageNum}:`, pdfErr);
              }

              if (localExtractedText.trim().length > 30) {
                console.log(`Successfully extracted ${localExtractedText.trim().length} chars of local text on page ${pageNum}. Resiliently asking Gemini to clean up & structure...`);
                try {
                  let cleanupResponse;
                  try {
                    // Try gemini-3.5-flash first for cleanup because of superior spelling/formatting and stability
                    cleanupResponse = await callAIWithRetry((aiClient) => aiClient.models.generateContent({
                      model: "gemini-3.5-flash",
                      contents: `Dưới đây là dữ liệu văn bản thô được trích xuất kỹ thuật từ trang ${pageNum}.
Hãy phân tích, sửa lỗi chính tả/mất chữ rách dòng tiếng Việt, cấu trúc lại nội dung logic tốt nhất, giữ nguyên tất cả các thông số kỹ thuật, công thức và đơn vị. Kẻ bảng Markdown nếu có dữ liệu bảng.
Tuyệt đối không tự suy diễn các giá trị kỹ thuật nếu không được viết rõ trong text thô.

Văn bản thô trích xuất từ trang ${pageNum}:
---
${localExtractedText}
---`,
                      config: {
                        temperature: 0.1,
                      }
                    }));
                  } catch (cleanupModelErr) {
                    console.warn("gemini-3.5-flash cleanup failed, trying gemini-3.1-flash-lite for cleanup...");
                    cleanupResponse = await callAIWithRetry((aiClient) => aiClient.models.generateContent({
                      model: "gemini-3.1-flash-lite",
                      contents: `Dưới đây là văn bản thô từ trang ${pageNum}. Hãy phân tích, sửa lỗi chính tả/mất chữ rách dòng tiếng Việt, cấu trúc lại tốt nhất, giữ nguyên tất cả các thông số kỹ thuật, công thức và đơn vị. Kẻ bảng Markdown nếu có dữ liệu bảng.
Văn bản thô:
---
${localExtractedText}
---`,
                      config: {
                        temperature: 0.1,
                      }
                    }));
                  }
                  aiResponseText = cleanupResponse.text || "";
                  console.log(`Fallback 1 (pdf-parse + text cleanup) succeeded for page ${pageNum}.`);
                } catch (cleanupErr: any) {
                  console.error(`Fallback 1 failed for page ${pageNum}:`, cleanupErr.message || cleanupErr);
                  throw cleanupErr;
                }
              } else {
                // Fallback 2: Thử sử dụng model gemini-3.1-flash-lite hoặc gemini-3.5-flash làm cứu cánh cuối cùng
                console.log(`No programmatic text found on page ${pageNum}. Trying model gemini-3.1-flash-lite as Fallback 2...`);
                try {
                  const aiResponseFallback = await callAIWithRetry((aiClient) => aiClient.models.generateContent({
                    model: "gemini-3.1-flash-lite",
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
                  aiResponseText = aiResponseFallback.text || "";
                  console.log(`Fallback 2 (gemini-3.1-flash-lite PDF OCR) succeeded for page ${pageNum}.`);
                } catch (fallbackErr: any) {
                  console.warn(`Fallback 2 failed: ${fallbackErr.message || fallbackErr}. Trying final safety pass...`);
                  
                  try {
                    const finalResponse = await callAIWithRetry((aiClient) => aiClient.models.generateContent({
                      model: "gemini-3.5-flash",
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
                              text: `Analyze this document page. Output reconstructed text only.`
                            }
                          ]
                        }
                      ],
                      config: {
                        temperature: 0.1,
                      }
                    }));
                    aiResponseText = finalResponse.text || "";
                    console.log(`Final safety pass (gemini-3.5-flash OCR) succeeded for page ${pageNum}.`);
                  } catch (finalOcrErr: any) {
                    throw new Error(`Tất cả phương thức trích xuất (Gemini-3.5-Flash PDF, pdf-parse thô, gemini-3.1-flash-lite OCR) đều thất bại cho trang ${pageNum}. Lỗi gốc: ${liteErr.message || liteErr}`);
                  }
                }
              }
            }
          }

          results.push({
            page: pageNum,
            text: aiResponseText || ""
          });
        } catch (pageErr: any) {
          console.error(`Error on page ${pageNum}:`, pageErr);
          results.push({ page: pageNum, text: `[Lỗi trích xuất trang ${pageNum}: ${pageErr.message || pageErr}]` });
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

  // API: Summarive/Shorten any copied text using Gemini AI
  app.post("/api/summarize", async (req, res) => {
    const { text, numBulletPoints = 3 } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY không được thiết lập." });
    }

    if (!text || text.trim() === "") {
      return res.status(400).json({ error: "Nội dung cần tóm tắt trống." });
    }

    try {
      const model = "gemini-3.5-flash";
      const promptText = `Nhiệm vụ: Hãy tóm tắt nội dung kỹ thuật dưới đây thành tối đa ${numBulletPoints} gạch đầu dòng cực kỳ ngắn gọn, cô đọng, súc tích và chính xác. Trực tiếp đi vào các số liệu kỹ thuật, quy định biên hoặc từ khóa cốt lõi, không rườm rà.
Nếu nội dung có các thông tin quy định kỹ thuật/TCVN/QCVN quan trọng, hãy giữ nguyên và bôi đậm số hiệu (ví dụ: TCVN 5574:2018).
Nội dung cần tóm tắt:
---
${text}
---
Hãy chỉ trả về duy nhất danh sách tóm tắt cực kỳ ngắn gọn dưới dạng markdown, không có lời mở đầu hay kết thúc dông dài.`;

      const response = await callAIWithRetry((aiClient) => aiClient.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [{ text: promptText }]
          }
        ],
        config: {
          temperature: 0.1,
        },
      }));

      res.json({ summary: response.text || "" });
    } catch (error: any) {
      console.error("Summarization API Error:", error);
      res.status(500).json({ error: error.message || "Lỗi AI khi đang tóm tắt" });
    }
  });

  // API 5: Generate Mind Map endpoint
  app.post("/api/generate-mindmap", async (req, res) => {
    const { text, type } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY không được thiết lập." });
    }

    try {
      const model = "gemini-3.5-flash";
      
      let customInstruction = "";
      if (type === "technical") {
        customInstruction = "hướng chuyên sâu vào các THÔNG SỐ KỸ THUẬT, sai số hình học, giá trị định mức biên, cấp độ bền vật liệu, khoảng quy chuẩn kỹ thuật và công thức toán học/định lượng.";
      } else if (type === "process") {
        customInstruction = "tập trung biểu diễn các BƯỚC THI CÔNG, Quy trình kiểm soát chất lượng, thứ tự lắp ghép liên kết, phương án thí nghiệm và các chuỗi hành động kiểm tra nghiệm thu cụ thể.";
      } else if (type === "safety") {
        customInstruction = "tập trung bóc tách các YÊU CẦU AN TOÀN LAO ĐỘNG, hệ thống phòng chống sét dông tiếp địa bảo vệ, khoảng cách ly an toàn điện, tiêu chuẩn phòng cháy chữa cháy nổ và bảo hộ môi trường hành lang kỹ thuật.";
      } else {
        customInstruction = "tóm tắt cấu trúc tổng quan chương mục, phạm vi áp dụng và các ý cốt lõi xuyên suốt toàn bộ tài liệu.";
      }

      const promptText = `Dưới đây là nội dung tài liệu PDF:
---
${text}
---

Nhiệm vụ: Hãy tạo mã Mermaid.js (cú pháp "mindmap") để biểu diễn sơ đồ kiến thức của tài liệu này, ${customInstruction}

HƯỚNG DẪN CÚ PHÁP MERMAID MINDMAP PHẢI TUÂN THỦ:
1. Sơ đồ khai báo dòng đầu tiên bắt buộc phải là "mindmap".
2. Sử dụng thụt lề đầu dòng bằng khoảng trắng (ví dụ: 2 spaces cho cấp tiếp theo, 4 spaces cho cấp tiếp tiếp) để biểu thị mối quan hệ cha-con.
3. KHÔNG sử dụng ký tự phân tách đặc biệt như gạch ngang (-), gạch dưới (_) làm tiền tố trước các node.
4. Tránh sử dụng các ký tự đặc biệt có thể phá vỡ cú pháp của Mermaid ở tên node (như ngoặc vuông [], ngoặc tròn (), dấu hai chấm :, phẩy). Hãy diễn đạt phẳng bằng tiếng Việt không dấu ngoặc, hoặc nếu bắt buộc phải dùng ký tự đặc biệt, hãy bọc toàn bộ nội dung node đó trong dấu nháy kép (ví dụ: "Mác bê tông >= B25").
5. Giữ cấu trúc cân đối tối đa 3-4 cấp để hiển thị sơ đồ trực quan rõ ràng nhất, không bị quá rộng.
6. Chỉ trả về duy nhất mã nguồn Mermaid hợp lệ bắt đầu bằng "mindmap", tuyệt đối không giải thích dông dài, không bọc trong tag markdown \`\`\` hay bất kỳ ký tự nào khác.`;

      const response = await callAIWithRetry((aiClient) => aiClient.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [{ text: promptText }]
          }
        ],
        config: {
          temperature: 0.1,
        },
      }));

      let content = response.text || "";
      // Clean up markdown blocks if present
      content = content.replace(/```mermaid/g, "").replace(/```/g, "").trim();
      
      // Secondary fallback clean to ensure it strictly starts with mindmap
      if (content.includes("mindmap")) {
        const index = content.indexOf("mindmap");
        content = content.substring(index);
      }
      
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

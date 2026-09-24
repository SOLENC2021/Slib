import React, { useState } from "react";
import { 
  User, Calendar, Globe, FileText, Layers, Tag, CheckCircle2, 
  Clock, Zap, Sparkles, Copy, Check, RefreshCw, ExternalLink, 
  BookOpen, ChevronDown, ChevronUp, AlertCircle, Loader2, Info,
  Share2, ArrowRight
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { PDFFile } from "@/types";
import { cn, getApiUrl, cleanLatexForClipboard } from "@/lib/utils";

interface DocumentSummaryViewProps {
  file: PDFFile;
  onUpdateFile?: (fileId: string, data: Partial<PDFFile>) => Promise<void>;
  onSwitchToChat?: () => void;
  onOpenPdfViewer?: () => void;
}

export function formatPdfDate(dateVal?: string | number | null): string {
  if (!dateVal) return "Không xác định";
  if (typeof dateVal === "number") {
    return new Date(dateVal).toLocaleDateString("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const str = String(dateVal).trim();
  if (str.startsWith("D:")) {
    // PDF format: D:YYYYMMDDHHmmSS...
    const match = str.match(/^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/);
    if (match) {
      const year = match[1];
      const month = match[2] || "01";
      const day = match[3] || "01";
      const hour = match[4] || "00";
      const min = match[5] || "00";
      const sec = match[6] || "00";
      return `${day}/${month}/${year} ${hour}:${min}:${sec}`;
    }
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return str;
}

export function resolveDocumentAuthor(file: PDFFile): string {
  if (file.author && file.author !== "Không xác định") return file.author;
  if (file.metadata?.Author) return String(file.metadata.Author);
  if (file.metadata?.author) return String(file.metadata.author);
  if (file.metadata?.Creator) return String(file.metadata.Creator);
  if (file.extractedData?.author) return String(file.extractedData.author);
  return "Không xác định trong metadata";
}

export function resolveDocumentLanguage(file: PDFFile): string {
  if (file.language) return file.language;
  if (file.metadata?.Language) return String(file.metadata.Language);
  if (file.metadata?.language) return String(file.metadata.language);
  const sample = (file.text || "").substring(0, 3000);
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(sample)) {
    return "Tiếng Việt (vi)";
  }
  if (sample.trim().length > 50) {
    return "Tiếng Anh (en)";
  }
  return "Tiếng Việt (vi)";
}

export function resolveDocumentCreationDate(file: PDFFile): string {
  if (file.creationDate) return formatPdfDate(file.creationDate);
  if (file.metadata?.CreationDate) return formatPdfDate(file.metadata.CreationDate);
  if (file.metadata?.creationDate) return formatPdfDate(file.metadata.creationDate);
  if (file.metadata?.ModDate) return formatPdfDate(file.metadata.ModDate);
  if (file.uploadDate) return formatPdfDate(file.uploadDate) + " (Tải lên hệ thống)";
  return "Không xác định";
}

export default function DocumentSummaryView({
  file,
  onUpdateFile,
  onSwitchToChat,
  onOpenPdfViewer
}: DocumentSummaryViewProps) {
  const [copied, setCopied] = useState(false);
  const [showRawMetadata, setShowRawMetadata] = useState(false);
  const [isReExtracting, setIsReExtracting] = useState(false);
  const [reExtractError, setReExtractError] = useState<string | null>(null);
  const [reExtractSuccess, setReExtractSuccess] = useState(false);

  // AI Summary generation state
  const [isGeneratingAiSummary, setIsGeneratingAiSummary] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSummaryError, setAiSummaryError] = useState<string | null>(null);

  const author = resolveDocumentAuthor(file);
  const creationDate = resolveDocumentCreationDate(file);
  const language = resolveDocumentLanguage(file);

  const handleCopyProperties = async () => {
    const textToCopy = `=== THUỘC TÍNH TÀI LIỆU (DOCUMENT PROPERTIES) ===
• Tên tệp: ${file.name}
• Tác giả (Author): ${author}
• Ngày khởi tạo (Creation Date): ${creationDate}
• Ngôn ngữ (Language): ${language}
• Số trang: ${file.numpages || 1} trang
• Dung lượng: ${file.size || "N/A"}
• Phân loại: ${file.category || "Chưa phân loại"}
• Trạng thái AI: ${file.isAIReady ? "Đã phân tích AI thành công" : "Chưa hoàn tất"}
• Phương thức bóc tách: ${file.extractionMethod || "Tự động"}
• Gemini File URI: ${file.geminiFileUri || "Chưa liên kết"}
==============================================`;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy metadata:", err);
    }
  };

  const handleReExtractMetadata = async () => {
    if (!file.url) {
      setReExtractError("Không tìm thấy đường dẫn tệp để trích xuất lại.");
      return;
    }

    setIsReExtracting(true);
    setReExtractError(null);
    setReExtractSuccess(false);

    try {
      const response = await fetch(getApiUrl("/api/extract-pdf"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl: file.url }),
      });

      if (!response.ok) {
        throw new Error(`Trích xuất metadata thất bại: ${response.statusText}`);
      }

      const extractionData = await response.json();
      const rawInfo = extractionData.info || {};
      const newAuthor = rawInfo.Author || rawInfo.author || rawInfo.Creator || "";
      const newCreationDate = rawInfo.CreationDate || rawInfo.creationDate || "";
      const sampleText = extractionData.text || file.text || "";
      const newLang = rawInfo.Language || rawInfo.language || (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(sampleText) ? "Tiếng Việt (vi)" : "Tiếng Anh (en)");

      if (onUpdateFile) {
        await onUpdateFile(file.id, {
          author: newAuthor || "Không xác định",
          creationDate: newCreationDate || null,
          language: newLang,
          metadata: rawInfo,
          isAIReady: true,
          numpages: extractionData.numpages || file.numpages,
          geminiFileUri: extractionData.geminiFileUri || file.geminiFileUri,
          geminiFileName: extractionData.geminiFileName || file.geminiFileName,
          extractionMethod: extractionData.extractionMethod || file.extractionMethod,
        });
      }

      setReExtractSuccess(true);
      setTimeout(() => setReExtractSuccess(false), 3000);
    } catch (err: any) {
      console.error("Re-extract error:", err);
      setReExtractError(err.message || "Lỗi khi trích xuất lại metadata.");
    } finally {
      setIsReExtracting(false);
    }
  };

  const handleGenerateAiSummary = async () => {
    const textToSummarize = file.text;
    if (!textToSummarize || textToSummarize.trim().length === 0) {
      setAiSummaryError("Tài liệu chưa có văn bản trích xuất để tạo tóm tắt.");
      return;
    }

    setIsGeneratingAiSummary(true);
    setAiSummaryError(null);

    try {
      const response = await fetch(getApiUrl("/api/summarize"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: textToSummarize.substring(0, 50000),
          numBulletPoints: 5,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Tóm tắt thất bại (${response.status})`);
      }

      const data = await response.json();
      setAiSummary(data.summary || "Không nhận được kết quả tóm tắt.");
    } catch (err: any) {
      console.error("AI Summary error:", err);
      setAiSummaryError(err.message || "Không thể khởi tạo tóm tắt AI.");
    } finally {
      setIsGeneratingAiSummary(false);
    }
  };

  const rawMetadataEntries = Object.entries(file.metadata || {}).filter(([_, val]) => val !== undefined && val !== null && String(val).trim() !== "");

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-7 shadow-lg border border-indigo-900/40 relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-black uppercase tracking-wider">
                Document Properties & Summary
              </span>
              <span className={cn(
                "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 border",
                file.isAIReady 
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" 
                  : "bg-amber-500/20 text-amber-300 border-amber-500/30"
              )}>
                {file.isAIReady ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                {file.isAIReady ? "AI READY" : "PENDING"}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-black tracking-tight text-white line-clamp-2" title={file.name}>
              {file.name}
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed font-medium">
              Bảng trích xuất chi tiết thuộc tính định danh, thông số kỹ thuật và nội dung tài liệu PDF phục vụ thẩm tra, đối chiếu.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            <button
              onClick={handleCopyProperties}
              className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 border border-white/10 backdrop-blur-sm cursor-pointer shadow-sm active:scale-95"
              title="Sao chép toàn bộ thuộc tính"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Đã chép" : "Sao chép"}</span>
            </button>

            <button
              onClick={handleReExtractMetadata}
              disabled={isReExtracting}
              className="px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900/50 text-white text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md shadow-indigo-600/30 cursor-pointer active:scale-95"
              title="Phân tích lại metadata từ tệp gốc"
            >
              {isReExtracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span>{isReExtracting ? "Đang trích xuất..." : "Trích xuất lại"}</span>
            </button>
          </div>
        </div>

        {/* Feedback alerts */}
        {reExtractSuccess && (
          <div className="mt-4 p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-200 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Đã cập nhật các thuộc tính metadata thành công!</span>
          </div>
        )}
        {reExtractError && (
          <div className="mt-4 p-3 bg-red-500/20 border border-red-500/40 rounded-xl text-red-200 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span>{reExtractError}</span>
          </div>
        )}
      </div>

      {/* Primary Extracted Properties Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <Info className="w-4 h-4 text-indigo-600" />
            <span>Thuộc tính tài liệu trích xuất (Extracted Properties)</span>
          </h3>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
            Metadata Schema v2.0
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {/* 1. Tác giả (Author) */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-4.5 shadow-xs hover:border-indigo-300 hover:shadow-sm transition-all flex flex-col justify-between group">
            <div className="flex items-start justify-between gap-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 group-hover:scale-105 transition-transform">
                <User className="w-4.5 h-4.5" />
              </div>
              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase tracking-wider">
                AUTHOR
              </span>
            </div>
            <div className="mt-3.5 space-y-1">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Tác giả / Cơ quan ban hành
              </span>
              <p className="text-xs sm:text-sm font-bold text-gray-900 line-clamp-2" title={author}>
                {author}
              </p>
            </div>
          </div>

          {/* 2. Ngày khởi tạo (Creation Date) */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-4.5 shadow-xs hover:border-indigo-300 hover:shadow-sm transition-all flex flex-col justify-between group">
            <div className="flex items-start justify-between gap-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 group-hover:scale-105 transition-transform">
                <Calendar className="w-4.5 h-4.5" />
              </div>
              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase tracking-wider">
                DATE
              </span>
            </div>
            <div className="mt-3.5 space-y-1">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Ngày tạo lập / Ban hành
              </span>
              <p className="text-xs sm:text-sm font-bold text-gray-900" title={creationDate}>
                {creationDate}
              </p>
            </div>
          </div>

          {/* 3. Ngôn ngữ (Language) */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-4.5 shadow-xs hover:border-indigo-300 hover:shadow-sm transition-all flex flex-col justify-between group">
            <div className="flex items-start justify-between gap-2">
              <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-105 transition-transform">
                <Globe className="w-4.5 h-4.5" />
              </div>
              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase tracking-wider">
                LANGUAGE
              </span>
            </div>
            <div className="mt-3.5 space-y-1">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Ngôn ngữ văn bản
              </span>
              <p className="text-xs sm:text-sm font-bold text-gray-900" title={language}>
                {language}
              </p>
            </div>
          </div>

          {/* 4. Quy mô & Số trang (Pages) */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-4.5 shadow-xs hover:border-indigo-300 hover:shadow-sm transition-all flex flex-col justify-between group">
            <div className="flex items-start justify-between gap-2">
              <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 group-hover:scale-105 transition-transform">
                <Layers className="w-4.5 h-4.5" />
              </div>
              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase tracking-wider">
                PAGES
              </span>
            </div>
            <div className="mt-3.5 space-y-1">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Số trang & Dung lượng
              </span>
              <p className="text-xs sm:text-sm font-bold text-gray-900">
                {file.numpages || 1} trang • {file.size || "Không rõ dung lượng"}
              </p>
            </div>
          </div>

          {/* 5. Phân loại tài liệu (Category) */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-4.5 shadow-xs hover:border-indigo-300 hover:shadow-sm transition-all flex flex-col justify-between group">
            <div className="flex items-start justify-between gap-2">
              <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 group-hover:scale-105 transition-transform">
                <Tag className="w-4.5 h-4.5" />
              </div>
              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase tracking-wider">
                CATEGORY
              </span>
            </div>
            <div className="mt-3.5 space-y-1">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Phân loại danh mục
              </span>
              <p className="text-xs sm:text-sm font-bold text-gray-900 line-clamp-1">
                {file.category || "Tiêu chuẩn & Quy chuẩn"}
              </p>
            </div>
          </div>

          {/* 6. Công nghệ trích xuất (Extraction Method) */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-4.5 shadow-xs hover:border-indigo-300 hover:shadow-sm transition-all flex flex-col justify-between group">
            <div className="flex items-start justify-between gap-2">
              <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 group-hover:scale-105 transition-transform">
                <Zap className="w-4.5 h-4.5" />
              </div>
              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase tracking-wider">
                ENGINE
              </span>
            </div>
            <div className="mt-3.5 space-y-1">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Công nghệ bóc tách
              </span>
              <p className="text-xs sm:text-sm font-bold text-gray-900">
                {file.extractionMethod === "pdf-parse" 
                  ? "Bóc tách Text gốc (pdf-parse)" 
                  : file.extractionMethod === "gemini-ocr" 
                    ? "Gemini AI OCR thị giác" 
                    : "Hybrid Lazy (Tải theo trang)"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Cloud Integration Status Card */}
      <div className="bg-white border border-gray-200/80 rounded-3xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className={cn(
            "w-10 h-10 rounded-2xl flex items-center justify-center border",
            file.geminiFileUri 
              ? "bg-emerald-50 text-emerald-600 border-emerald-200" 
              : "bg-amber-50 text-amber-600 border-amber-200"
          )}>
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                Google Gemini Files API Sync
              </h4>
              <span className={cn(
                "text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider",
                file.geminiFileUri ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
              )}>
                {file.geminiFileUri ? "ĐÃ ĐỒNG BỘ CLOUD" : "CHƯA KẾT NỐI URI"}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              {file.geminiFileUri 
                ? `URI: ${file.geminiFileUri.substring(0, 40)}... (Sẵn sàng cho mô hình Gemini 3.5 Flash)`
                : "Tài liệu đang xử lý ở chế độ trích xuất văn bản phẳng. Có thể đồng bộ lên Cloud để tăng tốc."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenPdfViewer && (
            <button
              onClick={onOpenPdfViewer}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Xem trực quan PDF</span>
            </button>
          )}

          {onSwitchToChat && (
            <button
              onClick={onSwitchToChat}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm shadow-indigo-600/20 cursor-pointer"
            >
              <span>Hỏi đáp về tệp</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Document Summary & Executive Briefing */}
      <div className="bg-white border border-gray-200/80 rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                Tóm tắt & Tổng quan Nội dung (Executive Summary)
              </h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Tổng hợp văn bản kỹ thuật và điều khoản chính
              </p>
            </div>
          </div>

          <button
            onClick={handleGenerateAiSummary}
            disabled={isGeneratingAiSummary || !file.text}
            className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 border border-indigo-200 cursor-pointer self-start sm:self-auto disabled:opacity-50"
          >
            {isGeneratingAiSummary ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>AI Đang tóm tắt...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>{aiSummary ? "Tạo lại tóm tắt AI" : "Tạo tóm tắt AI chuyên sâu"}</span>
              </>
            )}
          </button>
        </div>

        {/* AI Summary View */}
        {aiSummary && (
          <div className="bg-indigo-50/40 border border-indigo-100 rounded-2xl p-5 space-y-3 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-950 font-black text-xs uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
                <span>Kết quả tóm tắt thông minh bởi Gemini AI:</span>
              </div>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(cleanLatexForClipboard(aiSummary));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                <span>{copied ? "Đã copy" : "Sao chép tóm tắt"}</span>
              </button>
            </div>
            <div className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium prose prose-indigo max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex]}
              >
                {aiSummary}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {aiSummaryError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{aiSummaryError}</span>
          </div>
        )}

        {/* Text Excerpt / Preview */}
        <div className="space-y-2">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            Trích đoạn văn bản tài liệu đã bóc tách (Sample Content Preview):
          </span>
          {file.text && file.text.trim().length > 0 ? (
            <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-4.5 text-xs text-slate-700 leading-relaxed font-mono max-h-48 overflow-y-auto no-scrollbar whitespace-pre-wrap select-text">
              {file.text.substring(0, 1500)}
              {file.text.length > 1500 && "...\n\n[Còn tiếp trong toàn bộ văn bản của tài liệu]"}
            </div>
          ) : (
            <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-center space-y-2">
              <FileText className="w-6 h-6 text-slate-300 mx-auto" />
              <p className="text-xs font-semibold text-slate-500">
                Chưa có dữ liệu văn bản trích xuất cho tệp này.
              </p>
              <button
                onClick={handleReExtractMetadata}
                disabled={isReExtracting}
                className="px-3.5 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition cursor-pointer"
              >
                {isReExtracting ? "Đang xử lý..." : "Trích xuất văn bản ngay"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Advanced Technical Metadata Accordion */}
      {rawMetadataEntries.length > 0 && (
        <div className="bg-white border border-gray-200/80 rounded-3xl p-5 shadow-xs space-y-3">
          <button
            onClick={() => setShowRawMetadata(!showRawMetadata)}
            className="w-full flex items-center justify-between text-left cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-800 uppercase tracking-widest">
                Thuộc tính kỹ thuật mở rộng ({rawMetadataEntries.length} trường)
              </span>
              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                Advanced
              </span>
            </div>
            <div className="p-1 rounded-lg group-hover:bg-slate-100 transition-colors">
              {showRawMetadata ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
            </div>
          </button>

          {showRawMetadata && (
            <div className="pt-2 border-t border-gray-100 overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] font-black uppercase text-gray-400 tracking-wider">
                    <th className="py-2 px-3">Tên trường (Field)</th>
                    <th className="py-2 px-3">Giá trị (Value)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rawMetadataEntries.map(([key, val]) => (
                    <tr key={key} className="hover:bg-slate-50/70 transition-colors font-mono">
                      <td className="py-2 px-3 font-semibold text-indigo-900 w-1/3">{key}</td>
                      <td className="py-2 px-3 text-slate-600 break-all">{String(val)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

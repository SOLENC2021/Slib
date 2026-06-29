import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { 
  Send, Zap, ListFilter, Save, CheckCircle2, 
  AlertCircle, Loader2, Copy, Maximize2, Download,
  Plus, Trash2, Settings, Sparkles, X, LayoutGrid,
  Check, Scale, Search, ArrowLeftRight, ZoomIn, ZoomOut, RotateCcw, Minimize2, BookOpen, FileText, Camera, Languages,
  Presentation, ExternalLink, ChevronDown, ChevronRight, Folder, FolderOpen
} from "lucide-react";
import pptxgen from "pptxgenjs";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { cn, getApiUrl, cleanLatexForClipboard } from "@/lib/utils";
import Mermaid from "./Mermaid";
import { Message, ExtractionField, PDFFile, Note } from "@/types";

interface ChatPanelProps {
  messages: Message[];
  generalMessages?: Message[];
  activeFile: PDFFile | null;
  onSendMessage: (content: string, image?: string, isGeneral?: boolean, referencedFileIds?: string[]) => void;
  onExtract: (fields: ExtractionField[]) => Promise<any>;
  isProcessing: boolean;
  onSync: (data: any) => Promise<void>;
  isSyncing: boolean;
  onClose?: () => void;
  onRegisterGeminiFile?: (geminiFileUri: string, geminiFileName: string) => Promise<void>;
  notes?: Note[];
  onSaveNote?: (content: string) => Promise<void>;
  onDeleteNote?: (id: string) => Promise<void>;
  allFiles?: PDFFile[];
  onUpdateFile?: (fileId: string, data: Partial<PDFFile>) => Promise<void>;
  onSelectFile?: (fileId: string, pageNum?: number | null) => void;
  isPdfViewerOpen?: boolean;
  onTogglePdfViewer?: () => void;
  onCheckQuota?: () => Promise<boolean>;
  viewMode?: "admin" | "member";
}

function parseMermaidToOutline(code: string) {
  if (!code) return [];
  const lines = code.split("\n");
  const result: { text: string; indent: number }[] = [];
  
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "mindmap") return;
    
    // Count leading variables for indentation
    const match = line.match(/^(\s*)/);
    const indent = match ? match[1].length : 0;
    
    // Clean string by removing quotes or parenthesis
    let cleanText = trimmed;
    if (cleanText.startsWith('"') && cleanText.endsWith('"')) {
      cleanText = cleanText.substring(1, cleanText.length - 1);
    } else {
      cleanText = cleanText
        .replace(/^\s*\(\((.*?)\)\)\s*$/, '$1')
        .replace(/^\s*\((.*?)\)\s*$/, '$1')
        .replace(/^\s*\[(.*?)\]\s*$/, '$1')
        .replace(/^\s*\{\{(.*?)\}\}\s*$/, '$1')
        .replace(/^\s*\[\((.*?)\)\]\s*$/, '$1');
    }
    
    if (cleanText) {
      result.push({ text: cleanText, indent });
    }
  });
  
  return result;
}

interface ParsedSections {
  summary: string;
  basis: string;
  notes: string;
  hasStructure: boolean;
}

function parseAIResponse(content: string): ParsedSections {
  const sections: ParsedSections = {
    summary: "",
    basis: "",
    notes: "",
    hasStructure: false
  };

  if (!content) return sections;

  // Extremely flexible regex matching to support subtitles such as "Trực diện, ngắn gọn." and variations
  const summaryMatch = content.match(/##\s*1\.\s*(Tóm tắt câu trả lời|Tóm tắt)[^:\n]*(?::|\.)?/i);
  const basisMatch = content.match(/##\s*2\.\s*(Căn cứ pháp lý|Căn cứ pháp lý & Kỹ thuật)[^:\n]*(?::|\.)?/i);
  const notesMatch = content.match(/##\s*3\.\s*(Lưu ý\s*&\s*Ghi chú|Ghi chú|Lưu ý thêm)[^:\n]*(?::|\.)?/i);

  if (summaryMatch && basisMatch) {
    sections.hasStructure = true;
    
    const summaryStart = summaryMatch.index! + summaryMatch[0].length;
    const basisStart = basisMatch.index!;
    
    let summaryText = content.substring(summaryStart, basisStart).trim();
    // Clean up redundant "Trực diện, ngắn gọn" prefixes that might have been generated at the start of Section 1 text block
    summaryText = summaryText.replace(/^(trực diện,?\s*ngắn gọn\.?\s*[-:–—]*\s*)/i, "").trim();
    sections.summary = summaryText;

    if (notesMatch && notesMatch.index! > basisStart) {
      const basisEnd = notesMatch.index!;
      const basisContentStart = basisStart + basisMatch[0].length;
      sections.basis = content.substring(basisContentStart, basisEnd).trim();

      const notesContentStart = notesMatch.index! + notesMatch[0].length;
      sections.notes = content.substring(notesContentStart).trim();
    } else {
      const basisContentStart = basisStart + basisMatch[0].length;
      sections.basis = content.substring(basisContentStart).trim();
    }
  }

  return sections;
}

// -------------------------------------------------------------
// DOCUMENT SEARCH & CITATION CLI-CLICK NAVIGATION SERVICES
// -------------------------------------------------------------

interface SearchResult {
  pageNumber: number;
  snippet: string;
}

function parsePagesFromText(text: string): { [pageNo: number]: string } {
  const pages: { [pageNo: number]: string } = {};
  if (!text) return pages;

  // Split by standard page start markers
  const regex = /---\s*\[BẮT ĐẦU TRANG\s+(\d+)\]\s*---/gi;
  let match;
  const matches: { pageNum: number; index: number; headerLength: number }[] = [];
  
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      pageNum: parseInt(match[1], 10),
      index: match.index,
      headerLength: match[0].length
    });
  }

  if (matches.length === 0) {
    pages[1] = text;
    return pages;
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const next = matches[i + 1];
    
    const start = current.index + current.headerLength;
    const end = next ? next.index : text.length;
    
    let pageText = text.substring(start, end);
    pageText = pageText.replace(/---\s*\[KẾT THÚC TRANG\s+\d+\]\s*---/gi, "");
    
    pages[current.pageNum] = pageText.trim();
  }

  return pages;
}

function searchInDocument(text: string, query: string): SearchResult[] {
  if (!text || !query || !query.trim()) return [];
  const lowercaseQuery = query.toLowerCase().trim();
  const pages = parsePagesFromText(text);
  const results: SearchResult[] = [];

  Object.entries(pages).forEach(([pageStr, pageText]) => {
    const pageNumber = parseInt(pageStr, 10);
    const lowerPageText = pageText.toLowerCase();
    let index = 0;

    while ((index = lowerPageText.indexOf(lowercaseQuery, index)) !== -1) {
      const start = Math.max(0, index - 80);
      const end = Math.min(pageText.length, index + lowercaseQuery.length + 100);
      let snippet = pageText.substring(start, end);

      if (start > 0) snippet = "..." + snippet;
      if (end < pageText.length) snippet = snippet + "...";

      results.push({
        pageNumber,
        snippet
      });

      index += lowercaseQuery.length;
      if (results.length >= 100) break;
    }
  });

  return results;
}

function findFileByTerm(targetVal: string, allFiles: PDFFile[]): PDFFile | undefined {
  if (!targetVal || !allFiles) return undefined;
  const term = targetVal.toLowerCase().trim();
  if (!term) return undefined;

  const directMatch = allFiles.find(f => f.id === targetVal);
  if (directMatch) return directMatch;

  const normalizedTerm = term.replace(/[^a-z0-9]/g, "");
  if (!normalizedTerm) return undefined;

  const matchByName = allFiles.find(f => {
    const normName = f.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    return normName.includes(normalizedTerm) || normalizedTerm.includes(normName);
  });
  if (matchByName) return matchByName;

  return allFiles.find(f => f.name.toLowerCase().includes(term));
}

function convertCitationsToLinks(text: string): string {
  if (!text) return "";
  
  let result = text;
  
  // Highlight TCVN/QCVN patterns by making them bold automatically if not already bolded
  result = result.replace(/(?<!\*\*|\*)([TQ]CVN\s*(?:\d+:\d+(?:\/\w+)?|\d+-\d+(?:\/\w+)?|\d+(?:\/\w+)?))(?!\*\*|\*)/gi, "**$1**");

  // Protect existing markdown links by replacing them with temporary placeholders
  const placeholders: string[] = [];
  result = result.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (match) => {
    placeholders.push(match);
    return `__MARKDOWN_LINK_PLACEHOLDER_${placeholders.length - 1}__`;
  });

  // Pre-process multiple or ranges of pages like "Trang 133, 134" or "Trang 133-134" or "Trang 133 và 134" into "Trang 133 - Trang 134"
  result = result.replace(/([Tt]rang\s+\d+(?:\s*(?:,|\s+và\s+|-)\s*\d+)+)/gi, (match) => {
    const numbers = match.match(/\d+/g);
    if (numbers && numbers.length > 1) {
      return numbers.map(n => `Trang ${n}`).join(" - ");
    }
    return match;
  });

  // Single page conversions into placeholder links
  result = result.replace(/(?:[Tt]rang)\s*(\d+)/gi, (match, p1) => {
    const link = `[Trang ${p1}](#page-${p1})`;
    placeholders.push(link);
    return `__MARKDOWN_LINK_PLACEHOLDER_${placeholders.length - 1}__`;
  });

  // Link Vị trí: [Mục X, Trang Y] then Link_ID: #click-xxx to #click-xxx-page-Y
  result = result.replace(/([Tt]rang\s+(\d+))([\s\S]*?)(#click-([a-zA-Z0-9_-]+))/g, (match, trangText, pageNumStr, midText, clickHash, fileId) => {
    if (midText.length > 250 || midText.includes("#click-")) {
      return match;
    }
    const cleanPageNumMatch = pageNumStr.match(/\d+/);
    if (cleanPageNumMatch) {
      return `${trangText}${midText}#click-${fileId}-page-${cleanPageNumMatch[0]}`;
    }
    return match;
  });

  // Reverse match
  result = result.replace(/(#click-([a-zA-Z0-9_-]+))([\s\S]*?)([Tt]rang\s+(\d+))/g, (match, clickHash, fileId, midText, trangText, pageNumStr) => {
    if (midText.length > 250 || midText.includes("#click-")) {
      return match;
    }
    const cleanPageNumMatch = pageNumStr.match(/\d+/);
    if (cleanPageNumMatch) {
      return `#click-${fileId}-page-${cleanPageNumMatch[0]}${midText}${trangText}`;
    }
    return match;
  });

  // Replaces patterns like [Theo Mục X, Trang Y] with markdown links
  result = result.replace(/\[([^\]]*[Tt]rang\s+(\d+)[^\]]*)\]/g, (match, innerContent, pageNum) => {
    return `[${innerContent}](#page-${pageNum})`;
  });

  // Replaces naked #click-xxxx into markdown links
  result = result.replace(/(?<!\]\()#click-([a-zA-Z0-9_.-]+)/g, (match, clickId) => {
    return `[#click-${clickId}](#click-${clickId})`;
  });

  // Restore all protected placeholders
  for (let idx = 0; idx < placeholders.length; idx++) {
    result = result.replace(`__MARKDOWN_LINK_PLACEHOLDER_${idx}__`, placeholders[idx]);
  }

  return result;
}

function highlightText(text: string, highlight: string) {
  if (!highlight || !highlight.trim()) return <span>{text}</span>;
  const parts = text.split(new RegExp(`(${highlight.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, "gi"));
  return (
    <span>
      {parts.map((part, i) => 
        part.toLowerCase() === highlight.toLowerCase().trim() ? (
          <mark key={i} className="bg-yellow-100 text-yellow-950 font-black px-1.5 py-1.5 rounded border border-yellow-200 shadow-sm mx-0.5 inline-block leading-none">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </span>
  );
}

export function ChatPanel({
  messages,
  generalMessages = [],
  activeFile,
  onSendMessage,
  onExtract,
  isProcessing,
  onSync,
  isSyncing,
  onClose,
  onRegisterGeminiFile,
  notes = [],
  onSaveNote,
  onDeleteNote,
  allFiles = [],
  onUpdateFile,
  onSelectFile,
  isPdfViewerOpen = false,
  onTogglePdfViewer,
  onCheckQuota,
  viewMode = "member"
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [mode, setMode] = useState<"general_chat" | "chat" | "extract" | "mindmap" | "notes" | "compare" | "compliance">("general_chat");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [selectedGeneralDocIds, setSelectedGeneralDocIds] = useState<string[]>([]);
  const [showDocSelectorInGeneral, setShowDocSelectorInGeneral] = useState(false);

  // Scrolling detection for input area fading effect
  const [isScrolled, setIsScrolled] = useState(false);
  const [isComposerExpanded, setIsComposerExpanded] = useState(false);

  // Gemini Quick-Summarizer Assistant States
  const [summarizingText, setSummarizingText] = useState<string | null>(null);
  const [summaryResult, setSummaryResult] = useState<string>("");
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [bulletCount, setBulletCount] = useState<number>(3);
  const [summarizeError, setSummarizeError] = useState<string | null>(null);
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);
  const [isSavingSummaryToNote, setIsSavingSummaryToNote] = useState<boolean>(false);
  const [savedSummaryToNote, setSavedSummaryToNote] = useState<boolean>(false);

  // When summarizing text changes, reset saved state
  useEffect(() => {
    setSavedSummaryToNote(false);
    setIsSavingSummaryToNote(false);
  }, [summarizingText]);

  const handleSaveSummaryToNote = async () => {
    if (!summaryResult || !onSaveNote) return;
    setIsSavingSummaryToNote(true);
    try {
      let titleHeader = "### TÓM TẮT AI TỪ TÀI LIỆU KỸ THUẬT\n\n";
      if (activeFile) {
        titleHeader = `### TÓM TẮT AI TỪ TÀI LIỆU: ${activeFile.name}\n\n`;
      }
      await onSaveNote(`${titleHeader}${summaryResult}`);
      setSavedSummaryToNote(true);
    } catch (err) {
      console.error("Lỗi khi lưu tóm tắt vào ghi chú:", err);
    } finally {
      setIsSavingSummaryToNote(false);
    }
  };

  // PowerPoint & Gamma Exporter States
  const [pptModalData, setPptModalData] = useState<{ isOpen: boolean; content: string; messageId: string } | null>(null);
  const [isGeneratingPpt, setIsGeneratingPpt] = useState<boolean>(false);
  const [copiedGammaOutline, setCopiedGammaOutline] = useState<boolean>(false);

  // Global Notebook Synthesis States
  const [isSynthesizingNotes, setIsSynthesizingNotes] = useState<boolean>(false);
  const [synthesizedNotesSummary, setSynthesizedNotesSummary] = useState<string | null>(null);
  const [synthesisStyle, setSynthesisStyle] = useState<'bullets' | 'report' | 'quickref'>('report');
  const [synthesisError, setSynthesisError] = useState<string | null>(null);
  const [copiedSynthesis, setCopiedSynthesis] = useState<boolean>(false);

  // Manual Note Creation & Deletion Confirmation States
  const [newNoteText, setNewNoteText] = useState<string>("");
  const [isAddingNote, setIsAddingNote] = useState<boolean>(false);
  const [noteIdToDelete, setNoteIdToDelete] = useState<string | null>(null);

  // Dynamic Note Storage Upgrade States
  const [storageLimitGb, setStorageLimitGb] = useState<number>(10);
  const [isUpgradingStorage, setIsUpgradingStorage] = useState<boolean>(false);
  const [showUpgradeSuccess, setShowUpgradeSuccess] = useState<boolean>(false);

  const handleUpgradeStorageCapacity = () => {
    setIsUpgradingStorage(true);
    setTimeout(() => {
      setStorageLimitGb(prev => prev + 50);
      setIsUpgradingStorage(false);
      setShowUpgradeSuccess(true);
      setTimeout(() => setShowUpgradeSuccess(false), 5000);
    }, 800);
  };

  const handleAddNewManualNote = async () => {
    if (!newNoteText.trim() || !onSaveNote) return;
    setIsAddingNote(true);
    try {
      await onSaveNote(newNoteText.trim());
      setNewNoteText("");
    } catch (err) {
      console.error("Lỗi khi thêm ghi chú thủ công:", err);
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleSynthesizeNotes = async () => {
    if (!notes || notes.length === 0) return;
    setIsSynthesizingNotes(true);
    setSynthesisError(null);
    setCopiedSynthesis(false);

    // Compile all notes into a single prompt content block
    const compiledNotesText = notes.map((note, index) => {
      const dateStr = new Date(note.createdAt).toLocaleString("vi-VN", { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
      return `GHI CHÚ #${index + 1} (Thời gian: ${dateStr}, Nguồn tài liệu: ${note.fileName || "N/A"}):\n---\nNội dung:\n${note.content}\n---`;
    }).join("\n\n");

    try {
      let promptText = "";
      if (synthesisStyle === 'bullets') {
        promptText = `Nhiệm vụ: Hãy tổng hợp toàn bộ các ghi chú kỹ thuật bên dưới thành một bản tóm tắt phân tích gạch đầu dòng cực kỳ cô đọng, hệ thống và chính xác. Trực tiếp đi vào các số liệu kỹ thuật, tiêu chuẩn áp dụng, quy định biên hoặc từ khóa cốt lõi. Nhóm các thông tin tương tự lại với nhau để tạo thành cấu trúc nhóm logic rõ ràng.\n\nDưới đây là tập hợp ghi chú cần tổng hợp:\n===\n${compiledNotesText}\n===\n\nHãy chỉ trả về nội dung tổng hợp bằng tiếng Việt dưới dạng markdown (bắt đầu bằng tiêu đề # TỔNG HỢP GHI CHÚ KỸ THUẬT: CÔ ĐỌNG), trình bày trực tiếp, không dông dài.`;
      } else if (synthesisStyle === 'report') {
        promptText = `Nhiệm vụ: Phân tích toàn bộ các ghi chú kỹ thuật bên dưới và biên soạn thành một BÁO CÁO TỔNG HỢP ĐỐI CHIẾU KỸ THUẬT cực kỳ chuyên nghiệp.\nHồ sơ báo cáo cần có các mục rõ ràng:\n1. Tổng quan & Kết luận cốt lõi (Tóm tắt nhanh trạng thái, các thông số quan trọng nhất)\n2. Bảng đối chiếu so sánh chỉ số/quy chuẩn (Hãy lập bảng markdown đối chiếu chi tiết các yêu cầu biên, giới hạn chịu lực, khoảng cách, chiều dày...)\n3. Kiến nghị thực tế / Các điểm cần đặc biệt lưu ý khi thi công thiết kế.\n\nDưới đây là tập hợp ghi chú cần phân tích tổng hợp:\n===\n${compiledNotesText}\n===\n\nTrả về báo cáo bằng tiếng Việt định dạng markdown, bắt đầu bằng tiêu đề # BÁO CÁO ĐỐI CHIẾU & TỔNG HỢP KỸ THUẬT, trình bày chuẩn mực kỹ thuật cao nhất, không dông dài mở đầu kết thúc.`;
      } else {
        promptText = `Nhiệm vụ: Hãy biên soạn cẩm nang tra cứu nhanh (Quick Reference & Cheat Sheet) từ các ghi chú kỹ thuật dưới đây.\nBố cục gồm:\n- Định nghĩa & Các con số mật độ cốt lõi (Trình bày dạng danh mục hoặc bảng khóa)\n- Công thức & Quy tắc tỷ lệ vàng (Lọc ra các công thức cốt lõi)\n- Checklist tự kiểm tra nhanh cho kỹ sư thiết kế/thẩm tra.\n\nDưới đây là tập hợp ghi chú cần biên soạn:\n===\n${compiledNotesText}\n===\n\nHãy chỉ trả về tài liệu tra cứu nhanh bằng tiếng Việt dạng markdown, bắt đầu bằng tiêu đề # CẨM NANG TRA CỨU NHANH KỸ THUẬT, trực quan, dễ theo dõi nhất.`;
      }

      const response = await fetch(getApiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: promptText,
          history: []
        })
      });

      if (!response.ok) {
        throw new Error("Không thể kết nối với dịch vụ AI.");
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      setSynthesizedNotesSummary(data.response || "");
    } catch (err: any) {
      console.error("Notes synthesis error:", err);
      setSynthesisError(err?.message || "Lỗi không xác định khi tổng hợp.");
    } finally {
      setIsSynthesizingNotes(false);
    }
  };

  // Translation states
  const [translations, setTranslations] = useState<{ [id: string]: { [lang: string]: string } }>({});
  const [visibleLanguages, setVisibleLanguages] = useState<{ [id: string]: 'vi' | 'en' | 'ko' }>({});
  const [translatingId, setTranslatingId] = useState<{ [id: string]: 'en' | 'ko' | null }>({});

  const handleTranslate = async (text: string, id: string, lang: 'en' | 'ko') => {
    if (translations[id] && translations[id][lang]) {
      setVisibleLanguages(prev => ({ ...prev, [id]: lang }));
      return;
    }

    try {
      setTranslatingId(prev => ({ ...prev, [id]: lang }));
      
      const response = await fetch(getApiUrl("/api/translate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, targetLanguage: lang })
      });
      
      if (!response.ok) {
        let errMsg = "Lỗi khi kết nối dịch thuật.";
        try {
          const errData = await response.json();
          errMsg = errData.error || errData.message || errMsg;
        } catch (_) {}
        throw new Error(errMsg);
      }
      
      const data = await response.json();
      if (data.translatedText) {
        setTranslations(prev => ({
          ...prev,
          [id]: {
            ...(prev[id] || {}),
            [lang]: data.translatedText
          }
        }));
        setVisibleLanguages(prev => ({ ...prev, [id]: lang }));
      }
    } catch (err: any) {
      console.error(err);
      alert(`Không thể tự động dịch bằng AI. Chi tiết: ${err.message || "Kiểm tra lại cấu hình API."}`);
    } finally {
      setTranslatingId(prev => ({ ...prev, [id]: null }));
    }
  };

  const triggerSummarize = async (text: string, count = bulletCount) => {
    if (onCheckQuota) {
      const allowed = await onCheckQuota();
      if (!allowed) return;
    }
    setSummarizingText(text);
    setIsSummarizing(true);
    setSummaryResult("");
    setSummarizeError(null);
    setCopiedSummary(false);

    try {
      const response = await fetch(getApiUrl("/api/summarize"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, numBulletPoints: count })
      });
      if (!response.ok) {
        let errMsg = "Yêu cầu tóm tắt thất bại";
        try {
          const errData = await response.json();
          errMsg = errData.error || errData.message || errMsg;
        } catch (_) {}
        throw new Error(errMsg);
      }
      const data = await response.json();
      setSummaryResult(data.summary);
    } catch (err: any) {
      console.error(err);
      setSummarizeError(err.message || "Lỗi kết nối hoặc API Key gặp sự cố");
    } finally {
      setIsSummarizing(false);
    }
  };

  // Create customMarkdownComponents to dynamically change search files and trigger clicks
  const customMarkdownComponents = React.useMemo(() => ({
    a: ({ node, href, children, ...props }: any) => {
      if (href?.startsWith("#page-")) {
        const pageNo = href.replace("#page-", "");
        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              const pageNum = parseInt(pageNo, 10);
              if (onSelectFile && activeFile) {
                onSelectFile(activeFile.id, pageNum);
              } else {
                const el = document.querySelector(`[data-page="${pageNo}"]`);
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "start" });
                  // Highlight selected pdf viewer page
                  el.classList.add("ring-8", "ring-indigo-500/50", "ring-offset-2", "transition-all", "duration-500");
                  setTimeout(() => {
                    el.classList.remove("ring-8", "ring-indigo-500/50", "ring-offset-2");
                  }, 2500);
                }
              }
            }}
            className="text-indigo-600 font-extrabold hover:text-indigo-800 underline decoration-2 decoration-indigo-300 hover:decoration-indigo-600 transition-all cursor-pointer inline-flex items-center gap-1 bg-indigo-50/70 hover:bg-indigo-100 px-2 py-0.5 rounded-lg text-sm"
            title={`Cuộn đến Trang ${pageNo}`}
            {...props}
          >
            {children}
          </a>
        );
      }

      if (href?.startsWith("#click-")) {
        const remaining = href.replace("#click-", "");
        const pageMatch = remaining.match(/-page-(\d+)$/i);
        let pageNum: number | null = null;
        let fileTerm = remaining;
        if (pageMatch) {
          pageNum = parseInt(pageMatch[1], 10);
          fileTerm = remaining.replace(/-page-\d+$/i, "");
        }

        const matched = findFileByTerm(fileTerm, allFiles);
        if (matched) {
          return (
            <button
              onClick={(e) => {
                e.preventDefault();
                if (onSelectFile) {
                  onSelectFile(matched.id, pageNum);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-sm my-1 cursor-pointer active:scale-95 text-left"
              title={`Mở tài liệu: ${matched.name}${pageNum ? ` - Trang ${pageNum}` : ""}`}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[200px]">{matched.name.substring(0, 30)}{matched.name.length > 30 ? "..." : ""}{pageNum ? ` (Trang ${pageNum})` : ""}</span>
            </button>
          );
        } else {
          return (
            <button
              disabled
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-400 border border-gray-250 rounded-xl font-bold text-xs uppercase tracking-wider opacity-60 my-1 font-mono text-left"
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[200px]">{fileTerm.toUpperCase()}{pageNum ? ` (Trang ${pageNum})` : ""}</span>
            </button>
          );
        }
      }

      return (
        <a href={href} className="text-indigo-600 hover:underline font-bold" target="_blank" rel="noopener noreferrer" {...props}>
          {children}
        </a>
      );
    },
    strong: ({ children, ...props }: any) => {
      const text = String(children).trim();
      if (text === "Tên tiêu chuẩn:" || text === "Tên quy chuẩn:") {
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-xl bg-amber-50 text-amber-850 text-[10px] font-black uppercase tracking-wider border border-amber-200/50 mr-1.5 shadow-sm">
            📌 {text}
          </span>
        );
      }
      if (text === "Điều/Mục:") {
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-xl bg-teal-50 text-teal-850 text-[10px] font-black uppercase tracking-wider border border-teal-200/50 mr-1.5 shadow-sm">
            🔗 {text}
          </span>
        );
      }
      if (text === "Nội dung trích dẫn:" || text === "Trích đoạn tiêu chuẩn:") {
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-xl bg-indigo-50/50 text-indigo-950 text-[10px] font-black uppercase tracking-wider border border-indigo-150/40 mr-1.5 shadow-sm">
            📄 {text}
          </span>
        );
      }
      
      // Dynamic badge highlights for Vietnamese TCVN/QCVN standard names
      if (/^[TQ]CVN\s*\d+/i.test(text)) {
        const matched = (() => {
          let f = findFileByTerm(text, allFiles);
          if (f) return f;
          const numbers = text.match(/\d+/g);
          if (numbers && numbers.length > 0) {
            const primaryNumber = numbers[0];
            f = allFiles.find(file => {
              const nameLower = file.name.toLowerCase();
              return nameLower.includes(primaryNumber);
            });
            if (f) return f;
          }
          return undefined;
        })();

        return (
          <button
            onClick={(e) => {
              e.preventDefault();
              if (matched) {
                if (onSelectFile) {
                  onSelectFile(matched.id);
                }
              } else {
                alert(`Không tìm thấy file tài liệu nào trong thư viện trùng khớp với tiêu chuẩn "${text}". Vui lòng tải file "${text}" lên hệ thống trước.`);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-[12px] font-black text-rose-700 bg-rose-50 border border-rose-200/60 rounded-xl uppercase tracking-wider shadow-sm hover:bg-rose-100 transition-all cursor-pointer active:scale-95 text-left"
            title={matched ? `Click để mở tiêu chuẩn ${matched.name}` : `Chưa có file tiêu chuẩn "${text}" trong thư viện`}
          >
            🛡️ {text}
          </button>
        );
      }

      return <strong className="font-black text-gray-900" {...props}>{children}</strong>;
    },
    code: ({ node, inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || '');
      const isMermaid = match && match[1] === 'mermaid';
      if (!inline && isMermaid) {
        return (
          <div className="my-6 p-5 bg-[#f4f7fb]/60 border border-gray-100 rounded-3xl overflow-x-auto shadow-inner flex justify-center animate-in fade-in duration-500">
            <Mermaid chart={String(children).replace(/\n$/, '')} />
          </div>
        );
      }
      return inline ? (
        <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-semibold font-mono text-indigo-700" {...props}>
          {children}
        </code>
      ) : (
        <pre className="p-4 bg-gray-55 rounded-2xl overflow-x-auto text-xs font-semibold font-mono text-gray-800 border border-gray-100/40 leading-relaxed my-4">
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      );
    }
  }), [allFiles, onSelectFile, activeFile]);

  // Document Search State
  const [docSearchInput, setDocSearchInput] = useState("");

  // Knowledge Lab & Mind Map State
  const [mindmapType, setMindmapType] = useState<"standard" | "technical" | "process" | "safety">("standard");
  const [mindmapScale, setMindmapScale] = useState<number>(1.0);
  const [isFullscreenMindmap, setIsFullscreenMindmap] = useState<boolean>(false);
  const [mindmapTab, setMindmapTab] = useState<"visual" | "outline">("visual");

  // Core Compare State
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>([]);
  const [comparePrompt, setComparePrompt] = useState<string>("");
  const [compareResult, setCompareResult] = useState<string | null>(null);
  const [isComparing, setIsComparing] = useState<boolean>(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareStep, setCompareStep] = useState<number>(0); // 0: Idle, 1: Connecting, 2: Document Processing, 3: AI Analyzing
  const [compareSearch, setCompareSearch] = useState<string>("");

  // Core Compliance Audit State
  const [selectedComplianceDrawingId, setSelectedComplianceDrawingId] = useState<string>("");
  const [selectedComplianceRefIds, setSelectedComplianceRefIds] = useState<string[]>([]);
  const [selectedComplianceDiscipline, setSelectedComplianceDiscipline] = useState<"kientruc" | "ketcau" | "mep" | "vatlieu" | "qckt">("ketcau");
  const [structuralStandardSystem, setStructuralStandardSystem] = useState<"tcvn" | "tcnn">("tcvn");
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    "banve": true,
    "kientruc": true,
    "ketcau": true,
    "mep": true,
    "qckt": false,
    "vatlieu": false,
  });
  const [complianceRuleType, setComplianceRuleType] = useState<string>("density_height");
  const [customCompliancePrompt, setCustomCompliancePrompt] = useState<string>("");
  const [complianceResult, setComplianceResult] = useState<string | null>(null);
  const [isComplianceAuditing, setIsComplianceAuditing] = useState<boolean>(false);
  const [complianceError, setComplianceError] = useState<string | null>(null);
  const [complianceStep, setComplianceStep] = useState<number>(0); // 0: Idle, 1: Loading CAD, 2: Syncing library standards, 3: AI Auditing

  // Initialize and preserve selections without wiping completed results or selections on tab/mode switches
  useEffect(() => {
    if (mode === "compare") {
      if (selectedCompareIds.length === 0 && activeFile) {
        setSelectedCompareIds([activeFile.id]);
      }
    }

    if (mode === "compliance") {
      if (!selectedComplianceDrawingId) {
        if (activeFile && activeFile.category === "Bản vẽ thiết kế") {
          setSelectedComplianceDrawingId(activeFile.id);
        } else {
          const drawF = allFiles.find(f => f.category === "Bản vẽ thiết kế");
          if (drawF) {
            setSelectedComplianceDrawingId(drawF.id);
          }
        }
      }
      
      if (selectedComplianceRefIds.length === 0) {
        const stdF = allFiles.filter(f => f.category !== "Bản vẽ thiết kế");
        if (stdF.length > 0) {
          setSelectedComplianceRefIds(stdF.map(f => f.id));
        }
      }
    }
  }, [mode, activeFile, allFiles]);

  const getRefFilesForDiscipline = (discipline: "kientruc" | "ketcau" | "mep" | "vatlieu" | "qckt") => {
    return allFiles.filter(f => {
      if (f.category === "Bản vẽ thiết kế") return false;
      const cat = f.category || "";
      const nameLower = f.name.toLowerCase();
      
      if (discipline === "ketcau") {
        const isTcvn = structuralStandardSystem === "tcvn";
        const isStructural = (
          cat === "Kết cấu" || 
          cat === "TCVN" || 
          cat === "TCNN" ||
          nameLower.includes("ket cau") ||
          nameLower.includes("kết cấu") ||
          nameLower.includes("5574") ||
          nameLower.includes("be tong") ||
          nameLower.includes("bê tông") ||
          nameLower.includes("thep") ||
          nameLower.includes("thép") ||
          nameLower.includes("tai trong") ||
          nameLower.includes("tải trọng") ||
          nameLower.includes("tcvn") ||
          nameLower.includes("tcnn") ||
          nameLower.includes("eurocode") ||
          nameLower.includes("bs ") ||
          nameLower.includes("aci")
        );
        
        if (!isStructural) return false;

        const hasTcnnKeywords = 
          cat === "TCNN" ||
          nameLower.includes("tcnn") ||
          nameLower.includes("eurocode") ||
          nameLower.includes("bs ") ||
          nameLower.includes("aci ") ||
          nameLower.includes("astm") ||
          nameLower.includes("asce") ||
          nameLower.includes("aisc");
          
        const hasTcvnKeywords =
          cat === "TCVN" ||
          nameLower.includes("tcvn") ||
          nameLower.includes("5574") ||
          nameLower.includes("2737");
          
        if (isTcvn) {
          return !hasTcnnKeywords || hasTcvnKeywords;
        } else {
          return hasTcnnKeywords || !hasTcvnKeywords;
        }
      }
      
      if (discipline === "mep") {
        return (
          cat === "MEP" || 
          nameLower.includes("mep") ||
          nameLower.includes("dien") ||
          nameLower.includes("điện") ||
          nameLower.includes("nuoc") ||
          nameLower.includes("nước") ||
          nameLower.includes("thong gio") ||
          nameLower.includes("thông gió") ||
          nameLower.includes("dieu hoa") ||
          nameLower.includes("điều hòa") ||
          nameLower.includes("cap thoat") ||
          nameLower.includes("cấp thoát")
        );
      }
      
      if (discipline === "kientruc") {
        return (
          cat === "Kiến trúc" ||
          nameLower.includes("kien truc") ||
          nameLower.includes("kiến trúc") ||
          nameLower.includes("mat dung") ||
          nameLower.includes("mặt đứng") ||
          nameLower.includes("mat cat") ||
          nameLower.includes("mặt cắt") ||
          nameLower.includes("mat bang") ||
          nameLower.includes("mặt bằng")
        );
      }

      if (discipline === "vatlieu") {
        return (
          cat === "Vật liệu" ||
          cat === "Văn bản hiện hành" ||
          nameLower.includes("vat lieu") ||
          nameLower.includes("vật liệu") ||
          nameLower.includes("be tong") ||
          nameLower.includes("bê tông") ||
          nameLower.includes("xi mang") ||
          nameLower.includes("xi măng") ||
          nameLower.includes("gach") ||
          nameLower.includes("gạch") ||
          nameLower.includes("nhua") ||
          nameLower.includes("nhựa")
        );
      }

      if (discipline === "qckt") {
        return (
          cat === "Quy chuẩn kỹ thuật" ||
          nameLower.includes("quy chuan") ||
          nameLower.includes("quy chuẩn") ||
          nameLower.includes("qcvn") ||
          nameLower.includes("pccc") ||
          nameLower.includes("phong chay") ||
          nameLower.includes("phòng cháy") ||
          nameLower.includes("tieu chuan") ||
          nameLower.includes("tiêu chuẩn") ||
          nameLower.includes("tcvn 9386")
        );
      }
      
      return false;
    });
  };

  const handleCopyText = async (text: string, id: string) => {
    try {
      const cleanText = cleanLatexForClipboard(text);
      await navigator.clipboard.writeText(cleanText);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownloadText = (text: string, defaultFilename: string) => {
    try {
      const cleanText = cleanLatexForClipboard(text);
      const blob = new Blob([cleanText], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = defaultFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Xuất báo cáo thất bại:", err);
    }
  };

  interface SlideData {
    title: string;
    bullets: string[];
  }

  const parseContentToSlides = (text: string): SlideData[] => {
    const sections = text.split(/(?=^##?\s+)/m);
    const slides: SlideData[] = [];
    
    sections.forEach((section) => {
      const lines = section.trim().split("\n");
      if (lines.length === 0) return;
      
      let heading = lines[0].replace(/^#+\s*/, "").replace(/^\d+\.\s*/, "").trim();
      if (!heading) heading = "Nội dung";
      
      const bullets: string[] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const cleanLine = line
          .replace(/^-\s*\*\*.*?\*\*:\s*/, "")
          .replace(/^[-*+]\s+/, "")
          .replace(/^\d+\.\s+/, "")
          .replace(/\*\*/g, "")
          .replace(/\*/g, "")
          .trim();
          
        if (cleanLine.length > 5) {
          bullets.push(cleanLine);
        }
      }
      
      if (bullets.length === 0) {
        const paragraphs = lines.slice(1).join("\n").split("\n\n");
        paragraphs.forEach(p => {
          const cleanP = p.replace(/\*\*/g, "").trim();
          if (cleanP.length > 10) {
            bullets.push(cleanP);
          }
        });
      }
      
      if (bullets.length > 0) {
        slides.push({
          title: heading,
          bullets: bullets.slice(0, 5)
        });
      }
    });
    
    return slides;
  };

  const handleExportToPPTX = (content: string) => {
    setIsGeneratingPpt(true);
    try {
      const pptx = new pptxgen();
      pptx.layout = "LAYOUT_16x9";
      
      const primaryColor = "1E1B4B";
      
      const slide1 = pptx.addSlide();
      slide1.background = { color: primaryColor };
      
      slide1.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: "100%",
        h: 0.15,
        fill: { color: "6366F1" },
      });
      
      slide1.addText("TÀI LIỆU TRÌNH BÀY QUY CHUẨN KỸ THUẬT", {
        x: 0.8,
        y: 1.5,
        w: "85%",
        h: 0.4,
        fontSize: 14,
        color: "D9F99D",
        fontFace: "Arial",
        bold: true,
      });

      const subtitleText = activeFile 
        ? `Nguồn tham chiếu: ${activeFile.name}\nHệ thống Đối chiếu & Tra cứu TCVN/QCVN tự động`
        : "Hệ thống Tra cứu Quy chuẩn & Tiêu chuẩn Xây dựng TCVN/QCVN";

      slide1.addText("HƯỚNG DẪN TRA CỨU & ÁP DỤNG", {
        x: 0.8,
        y: 2.1,
        w: "85%",
        h: 1.2,
        fontSize: 32,
        color: "FFFFFF",
        fontFace: "Arial",
        bold: true,
      });
      
      slide1.addText(subtitleText, {
        x: 0.8,
        y: 3.8,
        w: "85%",
        h: 0.8,
        fontSize: 13,
        color: "94A3B8",
        fontFace: "Arial",
      });
      
      slide1.addText("Được tạo tự động bởi AI Trợ lý Chuyên trách", {
        x: 0.8,
        y: 5.0,
        w: "85%",
        h: 0.4,
        fontSize: 10,
        color: "64748B",
        fontFace: "Arial",
        italic: true,
      });

      const parsedSlides = parseContentToSlides(content);
      
      if (parsedSlides.length === 0) {
        const s = pptx.addSlide();
        s.addText("NỘI DUNG TRA CỨU", { x: 0.6, y: 0.4, w: "80%", h: 0.5, fontSize: 20, color: primaryColor, bold: true });
        s.addText(content.slice(0, 1000), { x: 0.6, y: 1.2, w: "88%", h: 4.5, fontSize: 13, color: "334155" });
      } else {
        parsedSlides.forEach((slideData, idx) => {
          const s = pptx.addSlide();
          
          s.addText(`${idx + 1}. ${slideData.title.toUpperCase()}`, {
            x: 0.6,
            y: 0.4,
            w: "88%",
            h: 0.6,
            fontSize: 20,
            color: primaryColor,
            fontFace: "Arial",
            bold: true,
          });
          
          s.addShape(pptx.ShapeType.rect, {
            x: 0.6,
            y: 1.1,
            w: 0.05,
            h: 4.2,
            fill: { color: "6366F1" },
          });
          
          const textObjects = slideData.bullets.map((bulletText) => {
            let ptSize = 13;
            if (bulletText.length > 200) ptSize = 11;
            
            return {
              text: `•  ${bulletText}`,
              options: {
                fontSize: ptSize,
                color: "1E293B",
                fontFace: "Arial",
                paraSpaceAfter: 12,
                lineSpacing: 18,
              }
            };
          });

          s.addText(textObjects, {
            x: 0.85,
            y: 1.1,
            w: "82%",
            h: 4.2,
            valign: "top",
          });
          
          s.addText(`Trang ${idx + 2} / ${parsedSlides.length + 1} | Hệ thống Tra cứu TCVN/QCVN`, {
            x: 0.6,
            y: 5.4,
            w: "88%",
            h: 0.3,
            fontSize: 8,
            color: "94A3B8",
            fontFace: "Arial",
          });
        });
      }
      
      const fileName = `Trinh_bay_Tra_cuu_${new Date().toISOString().slice(0, 10)}.pptx`;
      pptx.writeFile({ fileName });
    } catch (err) {
      console.error("Lỗi khi tạo slide PPTX:", err);
      alert("Không thể sinh file PowerPoint. Vui lòng thử lại hoặc dùng mục Copy sang Gamma.");
    } finally {
      setIsGeneratingPpt(false);
    }
  };

  const generateGammaOutline = (content: string): string => {
    const parsedSlides = parseContentToSlides(content);
    if (parsedSlides.length === 0) return `# Slide Thuyết Trình Quy Chuẩn\n- ${content}`;
    
    let result = `# HƯỚNG DẪN TRA CỨU & ÁP DỤNG QUY CHUẨN\n- Định dạng hỗ trợ nhập trực tiếp sang Gamma AI\n- Tài liệu đối chiếu kỹ thuật thông minh\n\n`;
    
    parsedSlides.forEach((slide) => {
      result += `# ${slide.title}\n`;
      slide.bullets.forEach((bullet) => {
        result += `- ${bullet}\n`;
      });
      result += `\n`;
    });
    
    return result;
  };

  const handleCompareExecution = async () => {
    if (selectedCompareIds.length === 0) {
      setCompareError("Vui lòng chọn ít nhất 1 tài liệu để tiến hành so sánh.");
      return;
    }
    
    if (onCheckQuota) {
      const allowed = await onCheckQuota();
      if (!allowed) return;
    }

    setIsComparing(true);
    setCompareError(null);
    setCompareResult(null);
    setCompareStep(1); // 1: Connecting

    try {
      const selectedFiles = allFiles.filter(f => selectedCompareIds.includes(f.id));
      
      setCompareStep(2); // Docs Processing / OCR Check representation

      const response = await fetch(getApiUrl("/api/compare"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          compareFiles: selectedFiles.map(f => ({
            id: f.id,
            name: f.name,
            url: f.url,
            geminiFileUri: f.geminiFileUri,
            geminiFileName: f.geminiFileName,
            uploadDate: f.uploadDate,
            size: f.size,
            category: f.category,
            text: f.text ? f.text.substring(0, 100000) : ""
          })),
          prompt: comparePrompt || "Hãy thực hiện so sánh đối chiếu kỹ thuật chi tiết nhất giữa các tài liệu trên."
        })
      });

      setCompareStep(3); // AI is writing detailed engineering comparison

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const errorHtml = await response.text().catch(() => "");
        console.error("Non-JSON Response from compare API:", errorHtml.substring(0, 500));
        throw new Error(`AI Server phản hồi không đúng cấu trúc (Nhận HTML thay vì JSON). Có thể máy chủ đang khởi tạo lại hoặc gặp sự cố quá tải. Vui lòng thử lại sau 2-3 giây.`);
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Sự cố khi so sánh tài liệu (${response.status})`);
      }

      const data = await response.json();
      
      // If some files were registered on-the-fly, update parent state so we keep them persistent!
      if (data.newlyRegistered && data.newlyRegistered.length > 0 && onUpdateFile) {
        for (const reg of data.newlyRegistered) {
          await onUpdateFile(reg.fileId, {
            geminiFileUri: reg.uri,
            geminiFileName: reg.name,
            isAIReady: true
          });
        }
      }

      setCompareResult(data.text);
      setCompareStep(0);
    } catch (err: any) {
      console.error("Lỗi khi so sánh tài liệu:", err);
      
      const isPermError = 
        err.message?.includes("hết hạn lưu trữ") ||
        err.message?.includes("You do not have permission to access the File") ||
        err.message?.includes("PERMISSION_DENIED") ||
        err.message?.includes("403") ||
        err.message?.includes("permission");

      if (isPermError && onUpdateFile && allFiles && selectedCompareIds && selectedCompareIds.length > 0) {
        const compareSelectedFiles = allFiles.filter(f => selectedCompareIds.includes(f.id));
        for (const f of compareSelectedFiles) {
          onUpdateFile(f.id, {
            geminiFileUri: null,
            geminiFileName: null
          }).catch(subErr => console.error("Failed to clear expired geminiFileUri in compare catch:", subErr));
        }
      }

      setCompareError(isPermError 
        ? "⚠️ Liên kết đệm tạm của Google Gemini đối với tài liệu đã hết hạn (40 giờ). Hệ thống đang tự động khôi phục chạy ngầm từ cơ sở dữ liệu Firebase của bạn. Vui lòng thử lại sau 2-3 giây, bạn HOÀN TOÀN KHÔNG CẦN tải lại tệp từ máy tính."
        : (err.message || "Không thể thực hiện so sánh đối chiếu đa tài liệu. Vui lòng kiểm tra lại cấu hình kết nối."));
    } finally {
      setIsComparing(false);
    }
  };

  const handleComplianceExecution = async () => {
    if (!selectedComplianceDrawingId) {
      setComplianceError("Vui lòng chọn bản vẽ kỹ thuật hoặc tài liệu thiết kế cần kiểm định.");
      return;
    }

    if (onCheckQuota) {
      const allowed = await onCheckQuota();
      if (!allowed) return;
    }

    setIsComplianceAuditing(true);
    setComplianceError(null);
    setComplianceResult(null);
    setComplianceStep(1); // Reading Drawing File

    try {
      const drawingFile = allFiles.find(f => f.id === selectedComplianceDrawingId);
      if (!drawingFile) throw new Error("Không thể định vị được bản vẽ chỉ định.");

      setComplianceStep(2); // Connecting and referencing selected standards from library

      const refFiles = getRefFilesForDiscipline(selectedComplianceDiscipline);

      let ruleDesc = "";
      if (complianceRuleType === "density_height") {
        ruleDesc = "Xem xét và kiểm tra sự phù hợp về: mật độ xây dựng hình học, chiều cao xây dựng tối đa của công trình, tổng diện tích sàn xây dựng, chỉ giới xây dựng và khoảng lùi an toàn kỹ lý đối với ranh giới quy hoạch đô thị.";
      } else if (complianceRuleType === "fire_safety") {
        ruleDesc = "Kiểm tra sự phù hợp đối với Quy Chuẩn Phòng Cháy Chữa Cháy (QCVN 06:2022/BXD, QCVN 06:2021 hoặc TCVN 13606). Đánh giá bậc chịu lửa cấu kiện xây dựng chính, số lượng và chiều rộng tối thiểu hành lang, cầu thang thoát hiểm, khoảng cách thoát nạn phòng xa nhất và thiết kế cách ly chống cháy lan.";
      } else if (complianceRuleType === "structure_load") {
        ruleDesc = "Rà soát tính toán kết cấu cơ sở: mảng thiết kế khung vững bền, bê tông chịu lực cốt thép theo TCVN 5574:2018 (mác bê tông móng dầm sàn, hàm lượng thép chịu kéo/nén, độ dày lớp bảo vệ và phân bố tản nén tải động tĩnh tối thiểu).";
      } else if (complianceRuleType === "mep_ventilation") {
        ruleDesc = "Thẩm định mảng Hệ thống cơ điện MEP và điều khiển khí hậu: thông hơi tự nhiên hoặc nhân tạo, diện tích mặt thoáng chiếu sáng phòng đơn chức năng, bảo an kết nối phụ tải chống giật đô thị, và độ dốc ống cấp thoát thải xây dựng.";
      } else if (complianceRuleType === "blueprint_spec") {
        ruleDesc = "Kiểm nghiệm tiêu chuẩn định chuẩn bản vẽ chuyên ngành xây dựng: đầy đủ khung vẽ tên, định dạng tỷ lệ hiển thị chuẩn hóa, xuất hiện bảng liệt kê phân loại vật tư linh kiện cấu kiện và chuẩn mực ghi chú kỹ thuật chú dẫn cụ thể.";
      } else if (complianceRuleType === "design_manager") {
        ruleDesc = "Tập trung rà soát hồ sơ Thiết kế cơ sở để TỔNG HỢP THÔNG TIN DỰ ÁN sơ bộ (Thông tin Pháp lý & Quy mô kiến trúc, Giả thiết đầu vào & Vật liệu kết cấu, Giải pháp tổng thể và Địa chất) hỗ trợ công tác Quản lý Thiết kế.";
      } else {
        ruleDesc = customCompliancePrompt || "Phân tích, đánh giá chi tiết sự phù hợp của tất cả thông số hình học và ghi chú kỹ thuật trên bản vẽ đối với các dòng pháp quy hiện hành.";
      }

      let specialtyLabel = "KẾT CẤU & SỨC BỀN CHỊU LỰC";
      let standardSystemDescription = "TCVN/QCVN tương ứng";

      if (selectedComplianceDiscipline === "kientruc") {
        specialtyLabel = "KIẾN TRÚC THIẾT KẾ";
        standardSystemDescription = "Quy định quy chuẩn kiến trúc hiện hành và QCVN liên quan";
      } else if (selectedComplianceDiscipline === "ketcau") {
        specialtyLabel = `KẾT CẤU & SỨC BỀN CHỊU LỰC (Ưu tiên kiểm tra theo hệ tiêu chuẩn: ${structuralStandardSystem === "tcvn" ? "TCVN - TIÊU CHUẨN VIỆT NAM (ƯU TIÊN HÀNG ĐẦU)" : "TCNN - TIÊU CHUẨN NƯỚC NGOÀI (EUROCODE/ACI/BS)"})`;
        standardSystemDescription = structuralStandardSystem === "tcvn" ? "TCVN - Tiêu chuẩn Việt Nam" : "TCNN - Tiêu chuẩn Nước ngoài";
      } else if (selectedComplianceDiscipline === "mep") {
        specialtyLabel = "CƠ ĐIỆN MEP & TIỆN ÍCH HẠ TẦNG";
        standardSystemDescription = "Tiêu chuẩn cơ điện, điện, nước và PCCC MEP liên quan";
      } else if (selectedComplianceDiscipline === "vatlieu") {
        specialtyLabel = "VẬT LIỆU XÂY DỰNG & TIÊU CHUẨN HOÀN THIỆN";
        standardSystemDescription = "Các quy chuẩn, tiêu chuẩn kỹ thuật vật liệu xây dựng (TCVN)";
      } else if (selectedComplianceDiscipline === "qckt") {
        specialtyLabel = "QUY CHUẨN KỸ THUẬT QUỐC GIA & PHÁP QUY PHÒNG CHÁY CHỮA CHÁY (PCCC)";
        standardSystemDescription = "Quy chuẩn kỹ thuật Việt Nam (QCVN) và quy định pháp lý";
      }

      let auditPrompt = "";
      if (complianceRuleType === "design_manager") {
        auditPrompt = `
[YÊU CẦU ĐẶC BIỆT - TỔNG HỢP & HOẠCH ĐỊNH THIẾT KẾ DỰ ÁN]
Bạn là Trợ lý Cố vấn Thiết kế Cao cấp (Design Manager Assistant) trên hệ thống StandardCloud. 
Nhiệm vụ của bạn là rà soát file hồ sơ Thiết kế cơ sở "${drawingFile.name}" để TỔNG HỢP THÔNG TIN DỰ ÁN sơ bộ, phục vụ trực tiếp cho công tác quản lý, điều phối thiết kế Kiến trúc và Kết cấu.

HƯỚNG DẪN TRÍCH XUẤT (TẬP TRUNG THUYẾT MINH & CHỈ DẪN CHUNG):
Bỏ qua các chi tiết cấu kiện nhỏ lẻ. Tập trung quét trang Ghi chú chung (General Notes), Thuyết minh dự án và Mặt bằng tổng thể để trích xuất 3 nhóm thông tin cốt lõi sau:

1. THÔNG TIN PHÁP LÝ & QUY MÔ KIẾN TRÚC:
   - Quy mô công trình (Số tầng nổi, tầng hầm, chiều cao tổng thể).
   - Chỉ giới xây dựng, khoảng lùi, mật độ xây dựng diện tích sàn (nếu có đề cập).
   - Phân cấp công trình và bậc chịu lửa (đối chiếu nhanh QCVN 06:2022).

2. GIẢI THIẾT ĐẦU VÀO & VẬT LIỆU KẾT CẤU:
   - Tiêu chuẩn thiết kế chủ đạo được đơn vị tư vấn áp dụng.
   - Số liệu tải trọng đầu vào: Phân vùng áp lực gió, dạng địa hình (đối chiếu TCVN 2737:2023).
   - Giải pháp vật liệu dự kiến: Cấp độ bền bê tông (B), mác vữa, nhóm cốt thép chịu lực (CB400-V, CB300-V...).

3. GIẢI PHÁP TỔNG THỂ VÀ ĐỊA CHẤT:
   - Sơ bộ điều kiện địa chất (nếu có trong thuyết minh): Lớp đất tốt nằm ở độ sâu bao nhiêu, áp lực đất.
   - Giải pháp kết cấu móng đề xuất (Móng cọc khoan nhồi, cọc ép, móng bề...) và hệ kết cấu thân chính (Khung vách, cột vách...).

KẾT QUẢ ĐẦU RA (ĐỊNH DẠNG MARKDOWN CẤU TRÚC RÕ RÀNG):
Trình bày kết quả thành các thẻ tiêu đề (###) kèm bảng danh mục tổng hợp, tuyệt đối không viết văn xuôi dài dòng. Cuối bài xuất ra một mục "📌 LƯU Ý CHO QUẢN LÝ THIẾT KẾ" chỉ ra các điểm mâu thuẫn hoặc thiếu sót thông tin đầu vào (nếu phát hiện).
`;
      } else {
        auditPrompt = `
[YÊU CẦU ĐẶC BIỆT - CHUYÊN GIA THẨM ĐỊNH TUÂN THỦ TCVN/QCVN]
Bạn là GIÁM ĐỐC THẨM ĐỊNH VÀ KIỂM SOÁT THIẾT KẾ XÂY DỰNG CHUYÊN SÂU BỘ MÔN: ${specialtyLabel}.
Bạn có năng lực thâm sâu đọc hiểu bản vẽ CAD / bản vẽ kết cấu chi tiết dưới định dạng văn bản số và dữ liệu hình ảnh kỹ thuật để rà soát sự sai lệch tiêu chuẩn hiện hành.

Nhiệm vụ của bạn: Tiến hành THẨM ĐỊNH TOÀN DIỆN Bản vẽ kỹ thuật "${drawingFile.name}" dựa trên hệ quy chuẩn pháp luật hiện hành và các bộ quy tắc tham chiếu trong bộ môn đã chọn (Hãy ưu tiên tuyệt đối việc sử dụng và so khớp theo hệ tiêu chuẩn: ${standardSystemDescription}):
${refFiles.length > 0 ? refFiles.map((f, i) => `- Tài liệu Thư viện tham khảo ${i+1}: "${f.name}" (Hãy so khớp số liệu từ đây nếu có)`).join("\n") : "- Sử dụng trực tiếp kho tàng Standard pháp quy TCVN & QCVN hiện hành tương ứng chuyên ngành."}

KHOẢN MỤC RÀ SOÁT CHUYÊN BIỆT: ${ruleDesc}

YÊU CẦU TRÌNH BÀY KẾT QUẢ: Hãy viết kết quả bằng TIẾNG VIỆT, mạch lạc, chính xác cao và định dạng bằng Markdown sạch đẹp với cấu trúc hiển thị như sau:

# [BÁO CÁO THẨM ĐỊNH]: ${drawingFile.name.toUpperCase()}

### 1. KẾT LUẬN THẨM TRÌNH CHUNG
* **Tỷ lệ Tuân thủ**: Nhận xét về độ hòa hợp thiết kế và cho điểm số thẩm định khách quan (từ 1 đến 10).
* **Trạng thái Thẩm định**: Nêu rõ một trong ba trạng thái sau (viết hoa và in đậm nổi bật):
  - **ĐẠT TIÊU CHUẨN** (Nếu không có lỗi hoặc chỉ có điểm lưu ý nhỏ)
  - **CƠ BẢN ĐẠT - CẦN ĐIỀU CHỈNH CHỈ TIÊU** (Nếu có sai lệch không nguy cấp chỉnh được)
  - **KHÔNG ĐẠT TIÊU CHUẨN** (Nếu vi phạm nghiêm trọng luật ranh giới hoặc an toàn cứu hỏa xây dựng)
* **Tổng quan tóm tắt tồn tại lớn**: Phân tích ngắn 3-4 câu những điểm then khóa bị lỗi.

### 2. BẢNG CHI TIẾT ĐỐI CHIẾU TIÊU CHUẨN THƯ VIỆN & THỰC TẾ THIẾT KẾ
Vui lòng lập một bảng so sánh kỹ thuật gồm chính xác 5 cột sau đây để mô tả các tiêu chí được rà soát trực quan:
| Tiêu chí kiểm tra | Yêu cầu kỹ lý tối thiểu (TCVN / QCVN tương ứng) | Số liệu đo đạc thực tế trên Bản vẽ | Đánh giá Tuân thủ | Giải pháp khắc phục / Chú giải kỹ thuật cụ thể |
| :--- | :--- | :--- | :--- | :--- |

(Hãy cố gắng ghi rõ tên bộ tiêu chuẩn ví dụ TCVN 5574:2018, QCVN 06:2022/BXD tại cột quy chuẩn để tăng tính chuyên môn pháp học thiết kế).

### 3. CHỈ DẪN KHẮC PHỤC KỸ THUẬT CHI TIẾT (ACTIONABLE CHECKLIST)
Hãy đưa ra các bullet point rõ ràng hướng dẫn các kỹ sư sửa đổi trực tiếp trên bản vẽ AutoCAD hoặc bản vẽ kết cấu thiết kế (ví dụ: cần tăng tiết diện cột, kéo giãn khoảng cách an toàn, bổ sung thêm lối thoát hiểm thứ 2, v.v.).

### 4. SƠ ĐỒ LÝ THUYẾT VÀ QUY TRÌNH ĐỐI CHIẾU (DIAGRAM PHÁP QUY)
Hãy mô tả sơ đồ nhánh quyết định rà soát rủi ro hoặc cơ cấu tổ chức tiêu chuẩn bằng ngôn ngữ lập đồ Mermaid. Khối mã Mermaid PHẢI bắt đầu bằng cụm chuỗi:
\`\`\`mermaid
(Nội dung sơ đồ như flowchart LR hoặc mindmap thích hợp)
\`\`\`
`;
      }

      setComplianceStep(3); // AI Auditing drawing data

      const response = await fetch(getApiUrl("/api/compare"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          compareFiles: [drawingFile, ...refFiles].map(f => ({
            id: f.id,
            name: f.name,
            url: f.url,
            geminiFileUri: f.geminiFileUri,
            geminiFileName: f.geminiFileName,
            uploadDate: f.uploadDate,
            size: f.size,
            category: f.category,
            text: f.text ? f.text.substring(0, 100000) : ""
          })),
          prompt: auditPrompt,
          isCompliance: complianceRuleType !== "design_manager",
          isDesignManager: complianceRuleType === "design_manager"
        })
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          const errorHtml = await response.text().catch(() => "");
          console.error("Non-JSON error from compliance API:", errorHtml.substring(0, 500));
          throw new Error(`AI Server gặp sự cố hệ thống (Trích xuất không đồng bộ). Vui lòng thử lại sau giây lát.`);
        }
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Sự cố mạng phía AI Server (${response.status})`);
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const errorHtml = await response.text().catch(() => "");
        console.error("Non-JSON Response from compliance API:", errorHtml.substring(0, 500));
        throw new Error(`AI Server phản hồi không đúng cấu trúc (Nhận HTML thay vì JSON). Có thể máy chủ đang khởi động lại hoặc gặp sự cố quá tải. Vui lòng thử lại sau 2-3 giây.`);
      }

      const resData = await response.json();

      if (resData.newlyRegistered && resData.newlyRegistered.length > 0 && onUpdateFile) {
        for (const reg of resData.newlyRegistered) {
          await onUpdateFile(reg.fileId, {
            geminiFileUri: reg.uri,
            geminiFileName: reg.name,
            isAIReady: true
          });
        }
      }

      setComplianceResult(resData.text);
      setComplianceStep(0);
    } catch (e: any) {
      console.error("Lỗi khi đối định tiêu chuẩn bản vẽ:", e);

      const isPermError = 
        e.message?.includes("hết hạn lưu trữ") ||
        e.message?.includes("You do not have permission to access the File") ||
        e.message?.includes("PERMISSION_DENIED") ||
        e.message?.includes("403") ||
        e.message?.includes("permission");

      if (isPermError && onUpdateFile) {
        if (selectedComplianceDrawingId) {
          onUpdateFile(selectedComplianceDrawingId, {
            geminiFileUri: null,
            geminiFileName: null
          }).catch(subErr => console.error("Failed to clear expired geminiFileUri for drawing:", subErr));
        }
        const refFiles = allFiles ? getRefFilesForDiscipline(selectedComplianceDiscipline) : [];
        if (refFiles && refFiles.length > 0) {
          for (const f of refFiles) {
            onUpdateFile(f.id, {
              geminiFileUri: null,
              geminiFileName: null
            }).catch(subErr => console.error("Failed to clear expired geminiFileUri for ref:", subErr));
          }
        }
      }

      setComplianceError(isPermError 
        ? "⚠️ Liên kết đệm tạm của Google Gemini đối với tài liệu đã hết hạn (40 giờ). Hệ thống đang tự động khôi phục chạy ngầm từ cơ sở dữ liệu Firebase của bạn. Vui lòng thử lại sau 2-3 giây, bạn HOÀN TOÀN KHÔNG CẦN tải lại tệp từ máy tính."
        : (e.message || "Không thể thực chất phân tích tiêu chuẩn đối soát bản vẽ của bạn. Vui lòng kết nối lại tài nguyên."));
    } finally {
      setIsComplianceAuditing(false);
    }
  };

  const handleSaveMessageToNote = async (content: string, id: string) => {
    if (onSaveNote) {
      setSavingId(id);
      try {
        await onSaveNote(content);
        setSavedIds(prev => [...prev, id]);
        setTimeout(() => {
          setSavedIds(prev => prev.filter(x => x !== id));
        }, 3000);
      } catch (err) {
        console.error(err);
      } finally {
        setSavingId(null);
      }
    }
  };

  const handleCopyAllExtractedData = () => {
    if (!extractedData) return;
    try {
      let formattedText = `# SỐ LIỆU TRÍCH XUẤT KỸ THUẬT: ${activeFile?.name || ""}\n\n`;
      schema.forEach(field => {
        const val = extractedData[field.name];
        const valStr = Array.isArray(val) 
          ? val.map(item => `- ${item}`).join('\n')
          : typeof val === 'object'
          ? JSON.stringify(val, null, 2)
          : (val || "Chưa có dữ liệu");
        formattedText += `## ${field.name.toUpperCase()}\n${valStr}\n\n`;
      });
      navigator.clipboard.writeText(cleanLatexForClipboard(formattedText));
      setCopiedId("extracted_all");
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const [extractedData, setExtractedData] = useState<any>(null);
  const [extractStatus, setExtractStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [mindmapCode, setMindmapCode] = useState<string>("");
  const [isRegisteringUri, setIsRegisteringUri] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const handleManualRegisterFile = async () => {
    if (!activeFile || !activeFile.url) return;
    setIsRegisteringUri(true);
    setRegisterError(null);
    try {
      const response = await fetch(getApiUrl("/api/register-gemini-file"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl: activeFile.url, filename: activeFile.name })
      });
      if (!response.ok) throw new Error("Không thể kết nối API đăng ký file hoặc API Key bị hết hạn/gặp sự cố.");
      const data = await response.json();
      if (data && data.uri) {
        if (onRegisterGeminiFile) {
          await onRegisterGeminiFile(data.uri, data.name || "");
        }
      }
    } catch (err: any) {
      console.error(err);
      setRegisterError(err.message || "Đồng bộ thất bại");
    } finally {
      setIsRegisteringUri(false);
    }
  };
  const [mindmapStatus, setMindmapStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [isEditingSchema, setIsEditingSchema] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [schema, setSchema] = useState<ExtractionField[]>(() => {
    const saved = localStorage.getItem("extraction_schema");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved schema", e);
      }
    }
    return [
      { name: "publisher", type: "string", description: "Cơ quan ban hành tài liệu" },
      { name: "revision_history", type: "string", description: "Lịch sử sửa đổi của tài liệu" },
      { name: "code", type: "string", description: "Mã hiệu hoặc số hiệu của tài liệu" },
    ];
  });

  useEffect(() => {
    localStorage.setItem("extraction_schema", JSON.stringify(schema));
  }, [schema]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, generalMessages]);

  const handleSend = () => {
    if (!input.trim() && !selectedImage) return;
    if (isProcessing) return;
    
    onSendMessage(input, selectedImage || undefined, mode === "general_chat", mode === "general_chat" ? selectedGeneralDocIds : undefined);
    setInput("");
    setSelectedImage(null);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
    // Reset input value to allow selecting same file again
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeSelectedImage = () => {
    setSelectedImage(null);
  };

  const handleExtract = async () => {
    setExtractStatus("loading");
    try {
      const result = await onExtract(schema);
      setExtractedData(result);
      setExtractStatus("success");
    } catch (error) {
      setExtractStatus("error");
    }
  };

  const handleGenerateMindmap = async (typeOverride?: "standard" | "technical" | "process" | "safety") => {
    if (!activeFile) return;

    if (onCheckQuota) {
      const allowed = await onCheckQuota();
      if (!allowed) return;
    }

    const typeValue = typeOverride || mindmapType;
    if (typeOverride) {
      setMindmapType(typeOverride);
    }
    setMindmapStatus("loading");
    try {
      const response = await fetch(getApiUrl("/api/generate-mindmap"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: activeFile.text, type: typeValue }),
      });
      if (!response.ok) throw new Error("Failed to generate mind map");
      const data = await response.json();
      setMindmapCode(data.mermaidCode);
      setMindmapStatus("success");
      setMindmapScale(1.0); // Reset scale
    } catch (error) {
      console.error(error);
      setMindmapStatus("error");
    }
  };

  const handleAddField = () => {
    setSchema([...schema, { name: "", type: "string", description: "" }]);
  };

  const handleDeleteField = (index: number) => {
    const newSchema = schema.filter((_, i) => i !== index);
    setSchema(newSchema);
  };

  const updateField = (index: number, key: keyof ExtractionField, value: string) => {
    const newSchema = [...schema];
    newSchema[index] = { ...newSchema[index], [key]: value };
    setSchema(newSchema);
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#f4f7fa]">
      {/* Panel Header */}
      <div className="bg-white px-8 py-5.5 flex items-center justify-between border-b border-gray-200/50 shrink-0 shadow-[0_4px_12px_rgba(0,0,0,0.015)]">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20">
            <Sparkles className="w-5 h-5 text-white fill-white" />
          </div>
          <div>
            <h2 className="text-[17px] font-black text-gray-900 uppercase tracking-wide leading-none">
              KNOWLEDGE LAB
            </h2>
            <p className="text-[11px] text-gray-400 font-extrabold uppercase tracking-widest mt-1.5">Powered by Gemini 3.5 Flash</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {activeFile && onTogglePdfViewer && (
            <button
              onClick={onTogglePdfViewer}
              className={cn(
                "px-4.5 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all border shadow-sm flex items-center gap-2 cursor-pointer active:scale-95",
                isPdfViewerOpen 
                  ? "bg-amber-50 hover:bg-amber-100/80 text-amber-800 border-amber-200/60" 
                  : "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200/60 animate-pulse"
              )}
              title={isPdfViewerOpen ? "Thu gọn vùng PDF (Focus Mode - Chế độ tập trung đọc/chat)" : "Mở rộng vùng PDF để xem tiêu chuẩn/bản vẽ"}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span>{isPdfViewerOpen ? "COLLAPSE PDF 🔍" : "OPEN PDF 📖"}</span>
            </button>
          )}
          {onClose && (
            <button 
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-900 transition-all border border-gray-200/40 shadow-sm bg-white cursor-pointer active:scale-95"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 pt-5 pb-3 flex gap-2.5 shrink-0 overflow-x-auto no-scrollbar border-b border-gray-200/30 bg-[#edf1f5]/30">
        <button
          onClick={() => setMode("general_chat")}
          className={cn(
            "px-5 py-3 rounded-2xl text-[11px] sm:text-[12px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-2 border shadow-sm",
            mode === "general_chat" 
              ? "bg-indigo-600 text-white border-indigo-600 shadow-[0_6px_16px_rgba(79,70,229,0.22)]" 
              : "bg-white text-gray-500 hover:text-gray-900 border-gray-200/60"
          )}
        >
          <Sparkles className="w-3.5 h-3.5 text-current" />
          <span>HỎI ĐÁP CHUNG</span>
        </button>
        <button
          onClick={() => setMode("compare")}
          className={cn(
            "px-5 py-3 rounded-2xl text-[11px] sm:text-[12px] font-black uppercase tracking-widest transition-all shrink-0 flex items-center gap-2 border shadow-sm",
            mode === "compare" 
              ? "bg-indigo-600 text-white border-indigo-600 shadow-[0_6px_16px_rgba(79,70,229,0.22)]" 
              : "bg-white text-gray-500 hover:text-gray-900 border-gray-200/60"
          )}
        >
          <BookOpen className="w-3.5 h-3.5 text-current" />
          <span>TRA CỨU & ĐỐI CHIẾU</span>
        </button>
        <button
          onClick={() => setMode("compliance")}
          className={cn(
            "px-5 py-3 rounded-2xl text-[11px] sm:text-[12px] font-black uppercase tracking-widest transition-all shrink-0 flex items-center gap-2 border shadow-sm",
            mode === "compliance" 
              ? "bg-indigo-600 text-white border-indigo-600 shadow-[0_6px_16px_rgba(79,70,229,0.22)]" 
              : "bg-white text-gray-500 hover:text-gray-900 border-gray-200/60"
          )}
        >
          <Scale className="w-3.5 h-3.5 text-current animate-pulse" />
          <span>KIỂM TRA THIẾT KẾ</span>
        </button>
        <button
          onClick={() => setMode("notes")}
          className={cn(
            "px-5 py-3 rounded-2xl text-[11px] sm:text-[12px] font-black uppercase tracking-widest transition-all shrink-0 border shadow-sm",
            mode === "notes" 
              ? "bg-indigo-600 text-white border-indigo-600 shadow-[0_6px_16px_rgba(79,70,229,0.22)]" 
              : "bg-white text-gray-500 hover:text-gray-900 border-gray-200/60"
          )}
        >
          <span>SỔ TAY GHI CHÚ</span>
        </button>
      </div>

      <div 
        onScroll={(e) => {
          setIsScrolled(e.currentTarget.scrollTop > 25);
        }}
        className="flex-1 overflow-y-auto px-6 pt-6 pb-40 space-y-6 no-scrollbar"
      >
        {activeFile && mode !== "compare" && mode !== "compliance" && mode !== "general_chat" && mode !== "notes" && (
          <div className="bg-white border border-gray-200/60 rounded-3xl p-6 shadow-[0_12px_32px_rgba(0,0,0,0.035),0_1px_3px_rgba(0,0,0,0.015)] space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "p-2.5 rounded-xl border",
                  activeFile.geminiFileUri 
                    ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                    : "bg-amber-50 text-amber-600 border-amber-100"
                )}>
                  <Zap className={cn("w-5 h-5", activeFile.geminiFileUri ? "fill-emerald-600 animate-pulse" : "")} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest">
                    Gemini Files API
                  </h4>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-none mt-1">
                    {activeFile.geminiFileUri ? "Google Cloud Link: OK" : "ACTION REQUIRED"}
                  </p>
                </div>
              </div>

              {activeFile.geminiFileUri ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600 border border-emerald-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Sẵn sàng
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 border border-amber-100">
                  Chưa đồng bộ
                </span>
              )}
            </div>

            <p className="text-xs sm:text-[13px] text-gray-600 font-medium leading-relaxed uppercase tracking-wider">
              {activeFile.geminiFileUri ? (
                <span>Trực tiếp phân tích từ Cloud PDF gốc của Gemini. Trích xuất tài liệu siêu tốc (2-5 giây), giữ nguyên bảng biểu kỹ thuật và sơ đồ. <strong>Không cần tải lại file!</strong></span>
              ) : (
                <span>Tài liệu chưa được đăng ký trực tiếp trên Cloud Gemini API. Bấm nút dưới để đồng bộ ngầm chỉ trong 2 giây.</span>
              )}
            </p>

            {registerError && (
              <p className="text-xs text-red-500 font-bold uppercase tracking-widest">
                ❌ {registerError}
              </p>
            )}

            {!activeFile.geminiFileUri && (
              <button
                onClick={handleManualRegisterFile}
                disabled={isRegisteringUri}
                className="w-full mt-2 py-4 px-5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 border border-indigo-100"
              >
                {isRegisteringUri ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ĐANG KẾT NỐI GEMINI CLOUD...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    ĐỒNG BỘ SIÊU TỐC LÊN GEMINI CLOUD
                  </>
                )}
              </button>
            )}

            <button
              onClick={() => onSelectFile?.(activeFile.id)}
              className="w-full mt-3 py-4 px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/15 cursor-pointer active:scale-[0.98]"
            >
              <FileText className="w-4 h-4" />
              <span>MỞ TRÌNH ĐỌC PDF TRỰC QUAN</span>
            </button>
          </div>
        )}

        {mode === "compliance" ? (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center gap-3 pb-2">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center shadow-md shadow-indigo-100">
                <Scale className="w-6 h-6 text-indigo-600 animate-pulse" />
              </div>
              <div>
                <h3 className="text-lg sm:text-lg font-black text-gray-900 uppercase tracking-widest leading-tight">
                  Thẩm định & Kiểm tra Tiêu chuẩn
                </h3>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">Automated TCVN & QCVN Check</p>
              </div>
            </div>

            {/* Drawing Selection */}
            <div className="bg-white border border-gray-100 rounded-[32px] p-6 shadow-sm space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-2">
                  1. CHỌN BẢN VẼ / HỒ SƠ THIẾT KẾ CẦN KIỂM PHÁP
                </label>
                {allFiles.filter(f => f.category === "Bản vẽ thiết kế").length === 0 ? (
                  <div className="p-4 bg-amber-50/50 border border-amber-200/50 rounded-2xl text-xs font-semibold text-amber-800 leading-relaxed">
                    ⚠️ Chưa có tài liệu nào thuộc danh mục <strong className="font-extrabold text-amber-950 uppercase">Bản vẽ thiết kế</strong>. Hãy tải lên tệp bản vẽ ở cột trái và chọn phân loại <strong className="font-extrabold text-amber-900 uppercase">Bản vẽ thiết kế</strong> để tiếp tục.
                  </div>
                ) : (
                  <select
                    value={selectedComplianceDrawingId}
                    onChange={(e) => setSelectedComplianceDrawingId(e.target.value)}
                    className="w-full p-4 bg-[#f8f9fc] border border-gray-150 rounded-2xl text-[11px] font-black uppercase tracking-wide text-gray-800 focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none transition-all cursor-pointer"
                  >
                    <option value="">-- CLICK CHỌN BẢN VẼ TỪ HỆ THỐNG --</option>
                    {allFiles.filter(f => f.category === "Bản vẽ thiết kế").map(file => (
                      <option key={file.id} value={file.id}>
                        📄 {file.name.toUpperCase()} (Bản vẽ thiết kế)
                      </option>
                    ))}
                  </select>
                )}
              </div>
 
              {/* Disciplines Selection for Auditing Standards */}
              <div className="pt-2">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-2.5">
                  2. THẨM TRÌNH THEO HẠNG MỤC / BỘ MÔN
                </label>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-2.5 mb-3.5">
                  {[
                    { id: "kientruc", label: "Kiến trúc", icon: "🏛️", colorBg: "bg-amber-50/70 border-amber-200 text-amber-950 px-1 py-3" },
                    { id: "ketcau", label: "Kết cấu", icon: "🧱", colorBg: "bg-indigo-55 border-indigo-200 text-indigo-950 px-1 py-3" },
                    { id: "mep", label: "MEP", icon: "⚡", colorBg: "bg-emerald-50/70 border-emerald-200 text-emerald-950 px-1 py-3" },
                    { id: "vatlieu", label: "Vật liệu", icon: "🏗️", colorBg: "bg-rose-50/70 border-rose-200 text-rose-950 px-1 py-3" },
                    { id: "qckt", label: "Quy chuẩn KT", icon: "📒", colorBg: "bg-teal-50/70 border-teal-200 text-teal-950 px-1 py-3" },
                  ].map((disp) => {
                    const isSelected = selectedComplianceDiscipline === disp.id;
                    return (
                      <button
                        key={disp.id}
                        type="button"
                        onClick={() => setSelectedComplianceDiscipline(disp.id as any)}
                        className={cn(
                          "rounded-2xl border text-center flex flex-col items-center justify-center gap-1.5 transition-all text-xs cursor-pointer shadow-xs font-black",
                          isSelected
                            ? `${disp.colorBg} border-2 ring-2 ring-indigo-500/10 scale-[1.02]`
                            : "bg-[#fdfefe] hover:bg-gray-50 border-gray-150 text-gray-600 px-1 py-3"
                        )}
                      >
                        <span className="text-lg">{disp.icon}</span>
                        <span className="uppercase tracking-wide text-[10px] leading-tight font-black">{disp.label}</span>
                      </button>
                    );
                  })}
                </div>

                {selectedComplianceDiscipline === "ketcau" && (
                  <div className="mb-3.5 bg-indigo-50/55 p-3 rounded-2xl border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 animate-in fade-in duration-300">
                    <div>
                      <span className="text-[10px] font-black uppercase text-indigo-950 tracking-wider block">
                        Hệ thống Tiêu chuẩn Thẩm định:
                      </span>
                      <span className="text-[9px] font-bold text-indigo-700/80 block mt-0.5 uppercase tracking-wide">
                        Ưu tiên hàng đầu hệ tiêu chuẩn dùng để kiểm định cấu kiện
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setStructuralStandardSystem("tcvn")}
                        className={cn(
                          "px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-xl border cursor-pointer transition-all flex items-center gap-1.5",
                          structuralStandardSystem === "tcvn"
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                            : "bg-white text-gray-500 border-gray-150 hover:text-gray-900 shadow-3xs"
                        )}
                      >
                        <span>🇻🇳 TCVN (Khuyên dùng)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setStructuralStandardSystem("tcnn")}
                        className={cn(
                          "px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-xl border cursor-pointer transition-all flex items-center gap-1.5",
                          structuralStandardSystem === "tcnn"
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                            : "bg-white text-gray-500 border-gray-150 hover:text-gray-900 shadow-3xs"
                        )}
                      >
                        <span>🌐 TCNN (Eurocode/ACI)</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="max-h-[195px] overflow-y-auto border border-gray-200/50 rounded-2xl p-4 bg-[#f8fafc] space-y-2.5 no-scrollbar shadow-inner">
                  {getRefFilesForDiscipline(selectedComplianceDiscipline).length === 0 ? (
                    <div className="text-center py-4 space-y-2">
                      <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest bg-white rounded-xl py-3 border border-gray-150 shadow-2xs max-w-xs mx-auto">Không có file tiêu chuẩn riêng biệt đã tải</p>
                      <p className="text-[10.5px] text-gray-500 font-medium px-2 leading-relaxed italic">
                        💡 Hệ thống sẽ tự động dùng kho chuẩn mực liên bang <strong>TCVN / QCVN</strong> tích hợp sẵn trong trí thông minh AI để Thẩm định bộ môn <strong>
                          {selectedComplianceDiscipline === "kientruc" ? "Kiến trúc" 
                           : selectedComplianceDiscipline === "ketcau" ? `Kết cấu (${structuralStandardSystem === "tcvn" ? "Hệ TCVN" : "Hệ TCNN/Eurocode"})` 
                           : selectedComplianceDiscipline === "mep" ? "Hệ thống cơ điện MEP"
                           : selectedComplianceDiscipline === "vatlieu" ? "Vật liệu xây dựng"
                           : "Quy chuẩn kỹ thuật"}
                        </strong> độc lập.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[9px] text-indigo-600/80 font-black uppercase tracking-widest mb-1 leading-normal">
                        ✓ BỘ TIÊU CHUẨN SẼ ĐƯỢC QUÉT TỰ ĐỘNG ({getRefFilesForDiscipline(selectedComplianceDiscipline).length}):
                      </p>
                      {getRefFilesForDiscipline(selectedComplianceDiscipline).map(file => {
                        return (
                          <div key={file.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-indigo-100 shadow-3xs">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-black text-gray-800 truncate uppercase tracking-wide">{file.name}</p>
                              <span className="text-[9px] text-gray-450 font-extrabold uppercase tracking-widest block mt-0.5">
                                {file.category || "Quy chuẩn"} • {file.size || "0.1 MB"}
                              </span>
                            </div>
                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[8px] font-black uppercase tracking-wider rounded-md border border-indigo-100 shrink-0">ACTIVE</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Criteria & Action Check */}
            <div className="bg-white border border-gray-100 rounded-[32px] p-6 shadow-sm space-y-4">
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-2">
                3. CHỌN CHUYÊN ĐỀ HỢP CHUẨN CẦN RÀ SOÁT
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { id: "design_manager", label: "Tổng hợp Dự án (Design Manager) 📌", desc: "Quét thuyết minh, vật liệu xây dựng, rà móng và địa chất" },
                  { id: "density_height", label: "Mật độ, Chiều cao & Khoảng lùi", desc: "Mặt đứng, chỉ giới xây dựng, tỷ lệ ranh giới đất" },
                  { id: "fire_safety", label: "Phòng cháy chữa cháy PCCC", desc: "TCVN 06:2022, lối thoát nạn, cấu kiện chịu hỏa hoạn" },
                  { id: "structure_load", label: "Kết cấu sức bền cốt thép", desc: "TCVN 5574:2018, mác bê tông dầm móng dầm sàn dập" },
                  { id: "mep_ventilation", label: "Điều hòa thông khí & MEP", desc: "Tương thích phụ tải điện áp rò rỉ, thông gió" },
                  { id: "blueprint_spec", label: "Trình bày chuẩn hồ sơ vẽ", desc: "Khung tên pháp quy, tỷ lệ mặt bằng, bảng kê linh kiện" },
                  { id: "custom", label: "Rà soát luật tùy chỉnh...", desc: "Tự soạn thảo câu hỏi rà soát cho chuyên đề riêng biệt" },
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setComplianceRuleType(opt.id)}
                    className={cn(
                      "p-3.5 rounded-2xl border text-left flex flex-col gap-1 transition-all text-xs",
                      complianceRuleType === opt.id
                        ? "bg-indigo-50 border-indigo-300/60 shadow-sm"
                        : "bg-[#fcfdfe] hover:bg-gray-50 border-gray-150/50"
                    )}
                  >
                    <span className="font-extrabold text-indigo-950 uppercase tracking-wide text-[11px]">{opt.label}</span>
                    <span className="text-[10px] text-gray-400 font-bold leading-normal">{opt.desc}</span>
                  </button>
                ))}
              </div>

              {complianceRuleType === "custom" && (
                <div className="pt-2 animate-in slide-in-from-top-2 duration-300">
                  <textarea
                    value={customCompliancePrompt}
                    onChange={(e) => setCustomCompliancePrompt(e.target.value)}
                    placeholder="Nhập chính xác nội dung bộ quy định, tiêu chuẩn hiện hành hoặc yêu cầu so sánh riêng của bạn trên bản vẽ kỹ thuật này..."
                    className="w-full min-h-[100px] p-4 bg-[#f8f9fc] border border-gray-150/65 rounded-2xl text-xs sm:text-sm font-semibold outline-none text-gray-700 focus:border-indigo-150 focus:bg-white focus:ring-2 focus:ring-indigo-100/25 transition-all leading-relaxed"
                  />
                </div>
              )}

              {complianceError && (
                <div className="flex items-center gap-2 p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 text-xs sm:text-sm font-bold">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{complianceError}</span>
                </div>
              )}

              <button
                onClick={handleComplianceExecution}
                disabled={isComplianceAuditing || !selectedComplianceDrawingId}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4.5 rounded-[24px] font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/15 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 cursor-pointer"
              >
                {isComplianceAuditing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Scale className="w-5 h-5" />
                )}
                {isComplianceAuditing ? "TIẾN HÀNH THẨM ĐỊNH AI..." : "KHỞI CHẠY THẨM KIỂM COMPLIANCE ✦"}
              </button>
            </div>

            {/* Step Loader representation */}
            {isComplianceAuditing && (
              <div className="bg-white border border-gray-100 rounded-[32px] p-8 shadow-sm flex flex-col items-center justify-center text-center space-y-4 animate-pulse">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
                  <Scale className="w-6 h-6 text-indigo-600 absolute top-5 left-5" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-gray-950 text-sm font-black uppercase tracking-widest">
                    {complianceStep === 1 ? "BƯỚC 1: ĐỌC SỐ LIỆU ĐO ĐẠC BẢN VẼ..." :
                     complianceStep === 2 ? "BƯỚC 2: TRA TRUY THƯ VIỆN ĐỐI CHIẾU..." :
                     "BƯỚC 3: KIỂM TOÁN TIÊU CHUẨN TIÊU CHÍ VỚI GEMINI..."}
                  </p>
                  <p className="text-gray-450 text-[10px] font-bold uppercase tracking-widest leading-relaxed max-w-sm mx-auto">
                    {complianceStep === 1 && "AI phân tích hình lý dầm, mương, khoảng hẹp bản vẽ."}
                    {complianceStep === 2 && "Dò nạp văn bản pháp định TCVN hay quy chế đã chọn."}
                    {complianceStep === 3 && "So khớp sai lệch dung sai số cốt, sản sinh sơ đồ biểu quyết Mermaid."}
                  </p>
                </div>
              </div>
            )}

            {/* Output view */}
            {complianceResult && (
              <div className="bg-white border border-gray-100 rounded-[32px] p-6 shadow-sm space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 rounded-full bg-emerald-500 h-2 animate-ping" />
                    <h4 className="text-[10px] font-black text-indigo-950 uppercase tracking-[0.15em]">
                      BÁO CÁO THẨM ĐỊNH KỸ THUẬT TIÊU CHUẨN
                    </h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDownloadText(complianceResult, `bao_cao_tham_dinh_${activeFile ? activeFile.name.replace(/\.[^/.]+$/, "") : "tieu_chuan"}.txt`)}
                      className="px-3 py-2 bg-[#f8f9fc] text-gray-500 hover:text-emerald-600 rounded-xl border border-gray-150/40 hover:bg-emerald-50/50 transition-all flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest cursor-pointer shadow-sm active:scale-95"
                      title="Tải báo cáo này về máy dưới dạng tệp văn bản (.txt)"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Xuất văn bản</span>
                    </button>
                    <button
                      onClick={() => triggerSummarize(complianceResult)}
                      className="px-3 py-2 bg-[#f0f3ff] text-indigo-600 hover:text-white rounded-xl border border-indigo-150 hover:bg-indigo-600 transition-all flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest cursor-pointer shadow-sm active:scale-95"
                      title="Sử dụng Gemini AI để tóm tắt cực ngắn nội dung này trước khi copy"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Tóm tắt (AI)</span>
                    </button>
                    <button
                      onClick={() => handleCopyText(complianceResult, "compliance_output")}
                      className="px-3 py-2 bg-[#f8f9fc] text-gray-500 hover:text-indigo-600 rounded-xl border border-gray-150/40 hover:bg-indigo-50/50 transition-all flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest cursor-pointer shadow-sm active:scale-95"
                    >
                      {copiedId === "compliance_output" ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-emerald-600">Đã copy</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Sao chép báo cáo</span>
                        </>
                      )}
                    </button>
                    {onSaveNote && (
                      <button
                        onClick={async () => {
                          setSavingId("compliance_note_save");
                          await onSaveNote(`### PHÂN TÍCH TIÊU CHUẨN BẢN VẼ: ${allFiles.find(f => f.id === selectedComplianceDrawingId)?.name || ""}\n\n${complianceResult}`);
                          setSavingId(null);
                          setSavedIds(prev => [...prev, "compliance_note_save"]);
                        }}
                        className="px-3 py-2 bg-indigo-50/60 text-indigo-700 hover:text-indigo-900 rounded-xl border border-indigo-100/40 hover:bg-indigo-100/50 transition-all flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest cursor-pointer shadow-sm active:scale-95"
                        disabled={savingId === "compliance_note_save"}
                      >
                        {savingId === "compliance_note_save" ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Đăng lưu...</span>
                          </>
                        ) : savedIds.includes("compliance_note_save") ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-emerald-600">Đã lưu sổ tay</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-3.5 h-3.5" />
                            <span>Lưu vào sổ tay</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="h-[1px] bg-gray-100/60" />

                <div className="prose prose-xs sm:prose-sm prose-indigo max-w-none break-words leading-relaxed font-semibold text-gray-750 prose-table:border-collapse prose-table:border prose-table:border-gray-200 prose-th:bg-indigo-50/50 prose-th:text-indigo-950 prose-th:p-3 prose-th:font-black prose-th:text-xs prose-td:p-3 prose-td:border prose-td:border-gray-100 prose-td:text-[12px] prose-headings:text-indigo-950 prose-headings:font-black text-xs sm:text-xs text-gray-800">
                  <ReactMarkdown
                    remarkPlugins={[remarkMath, remarkGfm]}
                    rehypePlugins={[rehypeKatex]}
                    components={customMarkdownComponents}
                  >
                    {complianceResult}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        ) : mode === "compare" ? (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center gap-3 pb-2">
              <div className="w-12 h-12 rounded-2xl bg-indigo-55 flex items-center justify-center shadow-md shadow-indigo-100">
                <BookOpen className="w-6 h-6 text-indigo-600 animate-pulse" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-black text-gray-900 uppercase tracking-widest">
                  Tra cứu & Đối chiếu Tài liệu
                </h3>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">Multi-Document AI Lookup, Synthesizer & Cross-reference Engine</p>
              </div>
            </div>

            {/* Step 1: File Selection UI */}
            <div className="bg-white border border-gray-100 rounded-[32px] p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs sm:text-[13px] font-black text-gray-500 uppercase tracking-[0.15em]">
                  1. CLICK CHỌN CÁC FILE ĐỂ TRA CỨU & ĐỐI CHIẾU ({selectedCompareIds.length} đã chọn)
                </h4>
                {selectedCompareIds.length > 0 && (
                  <button 
                    onClick={() => setSelectedCompareIds([])}
                    className="text-xs font-black text-red-500 uppercase tracking-wider hover:text-red-700"
                  >
                    Bỏ chọn tất cả
                  </button>
                )}
              </div>

              {/* Search in Compare List */}
              <div className="relative">
                <Search className="w-5 h-5 text-gray-400 absolute left-4 top-4" />
                <input
                  type="text"
                  placeholder="Tìm nhanh file tài liệu..."
                  value={compareSearch}
                  onChange={(e) => setCompareSearch(e.target.value)}
                  className="w-full bg-[#f8f9fc] border border-transparent rounded-xl py-4 pl-12 pr-4 text-sm sm:text-base outline-none text-gray-750 placeholder:text-gray-400 focus:border-indigo-100 focus:bg-white focus:ring-2 focus:ring-indigo-100/20 transition-all font-sans font-medium"
                 />
              </div>

              {/* Scrollable tree list of files grouped by Folder */}
              <div className="max-h-[380px] overflow-y-auto border border-gray-200/50 rounded-2xl p-4 bg-[#f8fafc] space-y-3 no-scrollbar shadow-inner mt-4">
                {(() => {
                  const FOLDER_CATEGORIES = [
                    { id: "kientruc", label: "Kiến trúc", icon: "🏛️", categories: ["Kiến trúc"] },
                    { id: "ketcau", label: "Kết cấu", icon: "🧱", categories: ["Kết cấu", "TCVN", "TCNN"] },
                    { id: "mep", label: "MEP", icon: "⚡", categories: ["MEP"] },
                    { id: "vatlieu", label: "Vật liệu", icon: "🏗️", categories: ["Vật liệu", "Văn bản hiện hành"] },
                    { id: "qckt", label: "Quy chuẩn kỹ thuật", icon: "📒", categories: ["Quy chuẩn kỹ thuật"] },
                  ];

                  const getFilesInFolder = (folderCats: string[]) => {
                    return allFiles.filter(item => {
                      if (item.category === "Bản vẽ thiết kế") {
                        return false;
                      }
                      if (compareSearch && !item.name.toLowerCase().includes(compareSearch.toLowerCase())) {
                        return false;
                      }
                      const cat = item.category || "Văn bản hiện hành";
                      if (folderCats.includes(cat)) return true;
                      if (folderCats.includes("Văn bản hiện hành")) {
                        const ALL_DEFINED_CATS = ["Bản vẽ thiết kế", "Kiến trúc", "Kết cấu", "TCVN", "TCNN", "MEP", "Quy chuẩn kỹ thuật", "Vật liệu"];
                        if (!ALL_DEFINED_CATS.includes(cat)) {
                          return true;
                        }
                      }
                      return false;
                    });
                  };

                  const totalFilteredCount = allFiles.filter(item => {
                    if (item.category === "Bản vẽ thiết kế") return false;
                    return item.name.toLowerCase().includes(compareSearch.toLowerCase());
                  }).length;

                  if (totalFilteredCount === 0) {
                    return (
                      <p className="text-center text-xs text-gray-450 py-8 uppercase tracking-widest font-black bg-white rounded-xl border border-gray-150">
                        Không tìm thấy tài liệu phù hợp
                      </p>
                    );
                  }

                  return FOLDER_CATEGORIES.map(folder => {
                    const filesInFolder = getFilesInFolder(folder.categories);

                    const isExpanded = !!expandedFolders[folder.id];
                    const selectedInFolder = filesInFolder.filter(f => selectedCompareIds.includes(f.id));
                    const isAllSelected = filesInFolder.length > 0 && selectedInFolder.length === filesInFolder.length;

                    const handleToggleFolderExpanded = () => {
                      setExpandedFolders(prev => ({
                        ...prev,
                        [folder.id]: !prev[folder.id]
                      }));
                    };

                    const handleSelectAllInFolder = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      const folderFileIds = filesInFolder.map(f => f.id);
                      setSelectedCompareIds(prev => {
                        const filtered = prev.filter(id => !folderFileIds.includes(id));
                        return [...filtered, ...folderFileIds];
                      });
                    };

                    const handleDeselectAllInFolder = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      const folderFileIds = filesInFolder.map(f => f.id);
                      setSelectedCompareIds(prev => prev.filter(id => !folderFileIds.includes(id)));
                    };

                    return (
                      <div key={folder.id} className="bg-white rounded-2xl border border-gray-150 overflow-hidden shadow-xs">
                        {/* Folder Header */}
                        <div 
                          onClick={handleToggleFolderExpanded}
                          className={cn(
                            "flex items-center justify-between px-4 py-3.5 bg-gray-50/70 border-b border-gray-150 hover:bg-slate-100/50 cursor-pointer select-none transition-all",
                            isExpanded ? "bg-slate-50/80" : "border-b-transparent"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-gray-550 shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-550 shrink-0" />
                            )}
                            {isExpanded ? (
                              <FolderOpen className="w-4.5 h-4.5 text-indigo-500 shrink-0" />
                            ) : (
                              <Folder className="w-4.5 h-4.5 text-indigo-400 shrink-0" />
                            )}
                            <span className="text-xs font-black text-gray-750 uppercase tracking-widest truncate">
                              {folder.icon} {folder.label}
                            </span>
                            <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[9px] font-bold block shrink-0">
                              {selectedInFolder.length}/{filesInFolder.length}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {filesInFolder.length > 0 && (
                              isAllSelected ? (
                                <button
                                  type="button"
                                  onClick={handleDeselectAllInFolder}
                                  className="text-[10px] font-black text-red-500 uppercase tracking-wider hover:text-red-700 bg-red-55 px-2 py-1 rounded"
                                >
                                  Bỏ chọn
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={handleSelectAllInFolder}
                                  className="text-[10px] font-black text-indigo-600 uppercase tracking-wider hover:text-indigo-800 bg-indigo-55 px-2 py-1 rounded"
                                >
                                  Chọn hết
                                </button>
                              )
                            )}
                          </div>
                        </div>

                        {/* Folder File List */}
                        {isExpanded && (
                          <div className="p-3 bg-white space-y-2 border-l-2 border-dashed border-gray-100 ml-6 mr-3 my-2">
                            {filesInFolder.length === 0 ? (
                              <p className="text-center text-[11px] text-gray-400 py-4 uppercase tracking-wider font-semibold">
                                Không có tài liệu nào thuộc nhóm này
                              </p>
                            ) : (
                              filesInFolder.map(item => {
                                const isChecked = selectedCompareIds.includes(item.id);
                                const handleToggle = () => {
                                  setSelectedCompareIds(prev => {
                                    if (prev.includes(item.id)) {
                                      return prev.filter(id => id !== item.id);
                                    } else {
                                      return [...prev, item.id];
                                    }
                                  });
                                };
                                return (
                                  <div
                                    key={item.id}
                                    onClick={handleToggle}
                                    className={cn(
                                      "flex items-center justify-between p-3 bg-[#fdfefe] rounded-xl border transition-all duration-200 cursor-pointer shadow-3xs hover:border-indigo-200",
                                      isChecked ? "bg-indigo-50/20 border-indigo-300" : "border-gray-150 hover:bg-slate-50/30"
                                    )}
                                  >
                                    <div className="flex items-center gap-3 min-w-0 flex-1 pr-3">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={handleToggle}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-4.5 h-4.5 text-indigo-650 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                                      />
                                      <div className="min-w-0">
                                        <p className="text-xs font-black text-gray-800 truncate block uppercase tracking-wide">{item.name}</p>
                                        <p className="text-[9px] text-gray-450 font-bold uppercase tracking-widest mt-0.5">
                                          {item.category || "Kiến trúc"} • {item.size || "0 MB"}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex items-center shrink-0">
                                      {item.geminiFileUri ? (
                                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[8px] font-black uppercase tracking-wider border border-emerald-100">CLOUD OK</span>
                                      ) : (
                                        <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded text-[8px] font-black uppercase tracking-wider border border-amber-100">TEXT ONLY</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Step 2: Comparison Criteria Cards & Custom Input */}
            <div className="bg-white border border-gray-100 rounded-[32px] p-6 shadow-sm space-y-4">
              <h4 className="text-xs sm:text-[13px] font-black text-gray-500 uppercase tracking-[0.15em]">
                2. NHẬP NỘI DUNG TRA CỨU HOẶC TIÊU CHÍ ĐỐI CHIẾU
              </h4>

              {/* Text Input area */}
              <div className="space-y-2">
                <textarea
                  value={comparePrompt}
                  onChange={(e) => setComparePrompt(e.target.value)}
                  placeholder="Nhập nội dung bạn muốn tra cứu chính xác, hoặc câu hỏi so sánh đối chiếu giữa các tài liệu đã chọn..."
                  className="w-full min-h-[120px] p-5 bg-[#f8f9fc] border border-transparent rounded-[20px] text-sm sm:text-base outline-none text-gray-750 placeholder:text-gray-400 focus:border-indigo-100 focus:bg-white focus:ring-2 focus:ring-indigo-100/20 transition-all font-sans font-semibold leading-relaxed resize-y"
                />
              </div>

              {/* Compare Trigger button */}
              {compareError && (
                <div className="flex items-center gap-2 p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 text-xs sm:text-sm font-bold animate-shake">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{compareError}</span>
                </div>
              )}

              <button
                onClick={handleCompareExecution}
                disabled={isComparing || selectedCompareIds.length === 0}
                className="w-full bg-indigo-600 text-white py-5 rounded-[24px] font-black text-sm uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/20 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {isComparing ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <ArrowLeftRight className="w-6 h-6" />
                )}
                {isComparing ? "ĐANG TRA CỨU & ĐỐI CHIẾU..." : `BẮT ĐẦU TRẠM TRA CỨU & ĐỐI CHIẾU (${selectedCompareIds.length} TÀI LIỆU)`}
              </button>
            </div>

            {/* Custom Steps Visualizer for Comparison */}
            {isComparing && (
              <div className="bg-white border border-gray-100 rounded-[32px] p-8 shadow-sm flex flex-col items-center justify-center text-center space-y-4 animate-pulse">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
                  <Scale className="w-6 h-6 text-indigo-600 absolute top-5 left-5" />
                </div>
                <div className="space-y-2">
                  <p className="text-gray-950 text-base font-black uppercase tracking-widest">
                    {compareStep === 1 ? "KẾT NỐI SERVER TRUY LIÊN SỐ LIỆU..." :
                     compareStep === 2 ? "ĐANG KHAI THÁC VÀ ĐỒNG BỘ CLOUD..." :
                     "SỬ DỤNG TRÍ TUỆ NHÂN TẠO TRUY VẤN CHÍNH XÁC..."}
                  </p>
                  <p className="text-gray-450 text-xs sm:text-sm uppercase tracking-widest leading-relaxed">
                    {compareStep === 1 && "Đang xác thực thông tin tài liệu bảo mật trên và kết nối với Server API."}
                    {compareStep === 2 && "Đồng bộ hóa ngầm File PDF lên Google Cloud Files đại lý và giải nén dữ liệu."}
                    {compareStep === 3 && "Gemini đang tra cứu đa tầng, trích xuất thông tin & đối chiếu..."}
                  </p>
                </div>
              </div>
            )}

            {/* Step 3: Comparison Results Render */}
            {compareResult && (
              <div className="bg-white border border-gray-100 rounded-[32px] p-6 shadow-sm space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                    <h4 className="text-xs sm:text-sm font-black text-indigo-950 uppercase tracking-[0.15em]">
                      KẾT QUẢ ĐỐI CHIẾU & TỔNG HỢP AI CHÍNH XÁC CAO
                    </h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDownloadText(compareResult, "bao_cao_doi_chieu_tieu_chuan.txt")}
                      className="p-2.5 text-gray-500 hover:text-emerald-600 bg-gray-50 rounded-lg border border-gray-150/50 hover:bg-emerald-50 transition-all flex items-center gap-1.5 text-xs font-black uppercase tracking-widest cursor-pointer shadow-sm active:scale-95"
                      title="Xuất kết quả so sánh đối chiếu ra tệp văn bản (.txt)"
                    >
                      <Download className="w-4 h-4" />
                      <span>Xuất văn bản</span>
                    </button>
                    <button
                      onClick={() => triggerSummarize(compareResult)}
                      className="p-2.5 text-indigo-600 bg-indigo-50 border border-indigo-150 hover:bg-indigo-600 hover:text-white rounded-lg transition-all flex items-center gap-1.5 text-xs font-black uppercase tracking-widest cursor-pointer shadow-sm active:scale-95"
                      title="Sử dụng Gemini AI để tóm tắt cực ngắn trước khi sao chép"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Tóm tắt (AI)</span>
                    </button>
                    <button
                      onClick={() => handleCopyText(compareResult, "compare_match")}
                      className="p-2.5 text-gray-500 hover:text-indigo-600 bg-gray-50 rounded-lg border border-gray-150/50 hover:bg-indigo-50 transition-all flex items-center gap-1.5 text-xs font-black uppercase tracking-widest"
                      title="Sao chép kết quả"
                    >
                      {copiedId === "compare_match" ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-500" />
                          <span className="text-emerald-600">Đã copy</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Sao chép</span>
                        </>
                      )}
                    </button>
                    {onSaveNote && (
                      <button
                        onClick={async () => {
                          setSavingId("compare_note");
                          await onSaveNote(`### KẾT QUẢ SO SÁNH ĐA TÀI LIỆU\n\n**Yêu cầu:** _${comparePrompt || "So sánh kỹ thuật"}_ \n\n${compareResult}`);
                          setSavingId(null);
                          setSavedIds(prev => [...prev, "compare_note"]);
                        }}
                        className="p-2.5 text-gray-500 hover:text-indigo-600 bg-gray-50 rounded-lg border border-gray-150/50 hover:bg-indigo-50 transition-all flex items-center gap-1.5 text-xs font-black uppercase tracking-widest"
                        disabled={savingId === "compare_note"}
                      >
                        {savingId === "compare_note" ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Đang lưu...</span>
                          </>
                        ) : savedIds.includes("compare_note") ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            <span className="text-emerald-600">Đã lưu sổ tay</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4" />
                            <span>Lưu vào sổ tay</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="h-[1px] bg-gray-100" />

                <div className="prose prose-base sm:prose-lg prose-indigo max-w-none break-words font-medium leading-relaxed prose-table:border-collapse prose-table:border prose-table:border-gray-200 prose-th:bg-indigo-55/75 prose-th:text-indigo-950 prose-th:p-3.5 prose-th:font-black prose-th:text-sm prose-td:p-3.5 prose-td:border prose-td:border-gray-100 prose-td:text-[14px] sm:text-[15px] prose-headings:text-indigo-950 prose-headings:font-black prose-headings:mt-6 text-[15px] sm:text-[16px] text-gray-800">
                  <ReactMarkdown
                    remarkPlugins={[remarkMath, remarkGfm]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {compareResult}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        ) : mode === "general_chat" ? (
          <>
            <div ref={scrollRef} className="space-y-6 h-full flex flex-col justify-between">
              {generalMessages.length === 0 ? (
                <div className="max-w-3xl mx-auto w-full pt-4 pb-6 px-5 space-y-6 animate-in fade-in duration-500">
                  {/* Central Welcome Header */}
                  <div className="text-center space-y-2.5 shrink-0">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center mx-auto text-white shadow-lg shadow-indigo-600/15">
                      <Sparkles className="w-6 h-6 fill-white/10 animate-pulse" />
                    </div>
                    <div className="space-y-0.5">
                      <h3 className="text-lg sm:text-xl font-black text-slate-900 uppercase tracking-wider">
                        Trợ lý Thẩm định TCVN/QCVN
                      </h3>
                      <p className="text-[9px] sm:text-[10.5px] text-indigo-600 font-extrabold uppercase tracking-widest">
                        StandardCloud AI Engine — Tìm kiếm Toàn diện
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed max-w-lg mx-auto font-medium">
                      Chào mừng bạn! Trợ lý AI chuyên trách sẽ đồng hành và hỗ trợ bạn tra cứu nhanh chóng, chính xác mọi quy chuẩn, tiêu chuẩn kỹ thuật (TCVN/QCVN).
                    </p>
                  </div>

                  {/* Central Prominent Input box */}
                  <div className="bg-white border border-gray-200 rounded-[24px] p-4 shadow-xl shadow-indigo-500/5 transition-all focus-within:ring-2 focus-within:ring-indigo-150 focus-within:border-indigo-600/50 hover:border-gray-350 flex flex-col gap-2 relative">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Nhập câu hỏi kỹ thuật (Ví dụ: Quy định chiều dày lớp bê tông bảo vệ cốt thép dầm sàn hay khoảng cách an toàn PCCC, mật độ xây dựng)..."
                      className="w-full bg-transparent border-none py-1.5 px-1 text-sm sm:text-base font-semibold focus:outline-none focus:ring-0 transition-all resize-none h-28 placeholder:text-gray-400 text-gray-800"
                    />
                    <div className="flex items-center justify-between pt-2 border-t border-gray-50/50">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="p-2 bg-slate-50 text-slate-500 hover:text-indigo-600 rounded-full hover:bg-slate-100/80 transition-all flex items-center justify-center cursor-pointer"
                          title="Tải ảnh đính kèm"
                        >
                          <Camera className="w-4 h-4" />
                        </button>
                        {selectedImage && (
                          <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                            <img src={selectedImage} alt="Preview" className="w-full h-full object-cover" />
                            <button 
                              onClick={removeSelectedImage}
                              className="absolute top-0 right-0 p-0.5 bg-red-500 text-white rounded-full cursor-pointer hover:scale-105"
                            >
                              <X className="w-2 h-2" />
                            </button>
                          </div>
                        )}
                        <span className="text-[9px] text-gray-450 font-extrabold uppercase tracking-[0.12em] hidden sm:inline border-l pl-3 border-gray-200">
                          🔍 Global Engine Search 
                        </span>
                      </div>
                      <button
                        onClick={handleSend}
                        disabled={(!input.trim() && !selectedImage) || isProcessing}
                        className="px-4.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 text-white rounded-xl font-black text-[10px] uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/15 cursor-pointer"
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            ĐANG THẨM ĐỊNH...
                          </>
                        ) : (
                          <>
                            <Send className="w-3 h-3" />
                            GỬI YÊU CẦU
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Prompt Suggestions */}
                  <div className="space-y-3.5 pt-2">
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.18em] text-center">
                      💡 Thao tác nhanh — Câu hỏi gợi ý chuyên sâu TCVN/QCVN
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-w-2xl mx-auto">
                      {[
                        { text: "Bê tông khối lớn được định nghĩa thế nào theo TCVN 305:2004?", label: "TCVN 305:2004" },
                        { text: "Quy định về chiều dày lớp bê tông bảo vệ cốt thép dầm sàn?", label: "TCVN 5574:2018" },
                        { text: "Yêu cầu khoảng cách an toàn phòng cháy liên nhà?", label: "QCVN 06:2022/BXD" },
                        { text: "Tiêu chuẩn neo thép dầm và chiều dài đoạn nối chồng?", label: "Kết cấu thép" }
                      ].map((opt) => (
                        <button
                          key={opt.text}
                          onClick={() => {
                            setInput(opt.text);
                          }}
                          className="p-4 bg-white border border-gray-150/60 hover:border-indigo-200 hover:bg-indigo-50/20 active:bg-indigo-55/35 rounded-2xl text-xs transition-colors text-left shadow-sm flex flex-col gap-1 hover:translate-y-[-1px] cursor-pointer"
                        >
                          <span className="text-gray-800 font-bold leading-relaxed">👉 {opt.text}</span>
                          <span className="text-[9px] font-black uppercase tracking-wider text-indigo-500 self-end mt-0.5">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 flex-1 w-full pb-6">
                  {generalMessages.map((msg) => {
                    const parsed = msg.role === "ai" ? parseAIResponse(msg.content) : null;
                    const isTranslated = visibleLanguages[msg.id] && visibleLanguages[msg.id] !== 'vi' && translations[msg.id]?.[visibleLanguages[msg.id]];
                    
                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          "relative group/msg flex flex-col rounded-3xl p-5 shadow-sm transition-all drop-shadow-sm/80 animate-in fade-in duration-300 overflow-visible",
                          msg.role === "user"
                            ? "bg-indigo-600 text-white ml-auto max-w-[85%] pr-[76px]"
                            : "bg-[#f8fafc] border border-gray-200/50 mr-auto w-full max-w-[100%]"
                        )}
                      >
                        {msg.image && (
                          <div className="mb-3 rounded-2xl overflow-hidden border border-white/20">
                            <img src={msg.image} alt="User upload" className="max-w-full h-auto object-cover max-h-60" />
                          </div>
                        )}
                        
                        {/* Actions Toolbar - COMPACT FLOATING DOCK IN THE TOP-RIGHT CORNER */}
                        <div className="absolute top-3 bottom-3 right-3 w-fit pointer-events-none z-20 flex flex-col justify-start">
                          <div className={cn(
                            "sticky top-3 pointer-events-auto flex items-center gap-1 opacity-80 md:opacity-30 group-hover/msg:opacity-100 focus-within:opacity-100 hover:opacity-100 transition-all duration-300 p-1 rounded-xl shadow-sm border backdrop-blur-md",
                            msg.role === "user" 
                              ? "bg-indigo-750/95 border-indigo-505/35 text-white" 
                              : "bg-white/95 border-gray-150/75 text-gray-400"
                          )}>
                            {/* Tải về */}
                            <button
                              onClick={() => handleDownloadText(
                                isTranslated ? translations[msg.id][visibleLanguages[msg.id]] : msg.content,
                                `cau_tra_loi_${msg.id.slice(0, 5)}.txt`
                              )}
                              className={cn(
                                "flex items-center justify-center rounded-lg transition-all duration-300 pointer-events-auto cursor-pointer h-7 w-7 border border-transparent shadow-xs",
                                msg.role === "user"
                                  ? "hover:bg-indigo-600 text-indigo-150 hover:text-white"
                                  : "hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 hover:border-emerald-100"
                              )}
                              title="Tải về máy (.txt)"
                            >
                              <Download className="w-3.5 h-3.5 shrink-0" />
                            </button>

                            {/* Tóm tắt AI */}
                            {msg.role !== "user" && (
                              <button
                                onClick={() => triggerSummarize(
                                  isTranslated ? translations[msg.id][visibleLanguages[msg.id]] : msg.content
                                )}
                                className="flex items-center justify-center rounded-lg transition-all duration-300 pointer-events-auto cursor-pointer h-7 w-7 bg-white hover:bg-violet-50 text-gray-400 hover:text-violet-600 border border-transparent hover:border-violet-100 shadow-xs"
                                title="Tóm tắt ngắn câu trả lời bằng AI"
                              >
                                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                              </button>
                            )}

                            {/* Xuất Slides / Gamma AI */}
                            {msg.role !== "user" && (
                              <button
                                onClick={() => setPptModalData({ 
                                  isOpen: true, 
                                  content: isTranslated ? translations[msg.id][visibleLanguages[msg.id]] : msg.content, 
                                  messageId: msg.id 
                                })}
                                className="flex items-center justify-center rounded-lg transition-all duration-300 pointer-events-auto cursor-pointer h-7 w-7 bg-white hover:bg-violet-50 text-gray-400 hover:text-violet-650 border border-transparent hover:border-violet-105 shadow-xs"
                                title="Xuất slide thuyết trình (PowerPoint / Gamma AI)"
                              >
                                <Presentation className="w-3.5 h-3.5 shrink-0" />
                              </button>
                            )}

                            {/* Sao chép */}
                            <button
                              onClick={() => handleCopyText(
                                isTranslated ? translations[msg.id][visibleLanguages[msg.id]] : msg.content,
                                msg.id
                              )}
                              className={cn(
                                "flex items-center justify-center rounded-lg transition-all duration-300 pointer-events-auto cursor-pointer h-7 w-7 border border-transparent shadow-xs",
                                msg.role === "user"
                                  ? "hover:bg-indigo-600 text-indigo-100 hover:text-white"
                                  : "hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 hover:border-indigo-100"
                              )}
                              title="Sao chép câu trả lời"
                            >
                              {copiedId === msg.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              ) : (
                                <Copy className="w-3.5 h-3.5 shrink-0" />
                              )}
                            </button>

                            {/* Dịch EN / KO / VI */}
                            {msg.role === "ai" && (
                              <div className="flex items-center gap-1 shrink-0 border-l border-gray-150/60 pl-1">
                                {/* Dịch EN */}
                                <button
                                  onClick={() => handleTranslate(msg.content, msg.id, 'en')}
                                  disabled={translatingId[msg.id] !== undefined && translatingId[msg.id] !== null}
                                  className={cn(
                                    "flex items-center justify-center rounded-lg p-1 text-[9px] font-black tracking-wider transition-all duration-300 pointer-events-auto cursor-pointer h-7 min-w-[28px] border shadow-xs select-none",
                                    visibleLanguages[msg.id] === 'en'
                                      ? "bg-indigo-55 border-indigo-200 text-indigo-700 font-bold"
                                      : "bg-white hover:bg-slate-50 border-transparent text-gray-400 hover:text-indigo-650"
                                  )}
                                  title="Dịch câu trả lời sang Tiếng Anh"
                                >
                                  {translatingId[msg.id] === 'en' ? (
                                    <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />
                                  ) : (
                                    <span>EN</span>
                                  )}
                                </button>

                                {/* Dịch KO */}
                                <button
                                  onClick={() => handleTranslate(msg.content, msg.id, 'ko')}
                                  disabled={translatingId[msg.id] !== undefined && translatingId[msg.id] !== null}
                                  className={cn(
                                    "flex items-center justify-center rounded-lg p-1 text-[9px] font-black tracking-wider transition-all duration-300 pointer-events-auto cursor-pointer h-7 min-w-[28px] border shadow-xs select-none",
                                    visibleLanguages[msg.id] === 'ko'
                                      ? "bg-indigo-55 border-indigo-200 text-indigo-700 font-bold"
                                      : "bg-white hover:bg-slate-50 border-transparent text-gray-400 hover:text-indigo-650"
                                  )}
                                  title="Dịch câu trả lời sang Tiếng Hàn"
                                >
                                  {translatingId[msg.id] === 'ko' ? (
                                    <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />
                                  ) : (
                                    <span>KO</span>
                                  )}
                                </button>

                                {/* Quay lại tiếng Việt */}
                                {visibleLanguages[msg.id] && visibleLanguages[msg.id] !== 'vi' && (
                                  <button
                                    onClick={() => setVisibleLanguages(prev => ({ ...prev, [msg.id]: 'vi' }))}
                                    className="flex items-center justify-center rounded-lg p-1 text-[9px] font-black tracking-wider transition-all duration-300 pointer-events-auto cursor-pointer h-7 min-w-[28px] bg-rose-50 hover:bg-rose-100 border border-rose-150 text-rose-700 shadow-xs"
                                    title="Quay lại bản gốc tiếng Việt"
                                  >
                                    <span>Gốc</span>
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Lưu vào sổ tay ghi chú */}
                            {msg.role === "ai" && (
                              <button
                                onClick={() => handleSaveMessageToNote(
                                  isTranslated ? translations[msg.id][visibleLanguages[msg.id]] : msg.content,
                                  msg.id
                                )}
                                disabled={savingId === msg.id}
                                className="flex items-center justify-center rounded-lg transition-all duration-300 pointer-events-auto cursor-pointer h-7 w-7 bg-white hover:bg-blue-50 text-gray-400 hover:text-blue-650 border border-transparent hover:border-blue-105 shadow-xs"
                                title="Lưu vào ghi chú"
                              >
                                {savingId === msg.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />
                                ) : savedIds.includes(msg.id) ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                ) : (
                                  <Save className="w-3.5 h-3.5 shrink-0" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Content render body */}
                        {isTranslated ? (
                          <div className="prose prose-sm prose-indigo max-w-none break-words font-medium leading-relaxed prose-table:border-collapse prose-table:border prose-table:border-gray-200 prose-th:bg-gray-50 prose-th:p-2 prose-td:p-2 prose-td:border prose-td:border-gray-200 prose-headings:text-indigo-900 prose-headings:font-black text-left">
                            <ReactMarkdown
                              remarkPlugins={[remarkMath, remarkGfm]}
                              rehypePlugins={[rehypeKatex]}
                              components={customMarkdownComponents}
                            >
                              {convertCitationsToLinks(translations[msg.id][visibleLanguages[msg.id]])}
                            </ReactMarkdown>
                          </div>
                        ) : msg.role === "ai" && parsed && parsed.hasStructure ? (
                          <div className="space-y-5 w-full text-left">
                            {/* Section 1: Tóm tắt */}
                            <div className="bg-white border-l-4 border-l-indigo-600 border border-gray-150/50 rounded-r-2xl rounded-l-md p-5 shadow-sm space-y-2">
                              <div className="flex items-center gap-2 text-indigo-950 font-black uppercase tracking-widest text-[10px]">
                                <Sparkles className="w-3.5 h-3.5 text-indigo-600 fill-indigo-100/30 animate-pulse" />
                                <span>1. Tóm tắt câu trả lời: Trực diện, ngắn gọn</span>
                              </div>
                              <div className="text-gray-800 text-[13px] sm:text-sm font-semibold leading-relaxed prose prose-indigo max-w-none">
                                <ReactMarkdown
                                  remarkPlugins={[remarkMath, remarkGfm]}
                                  rehypePlugins={[rehypeKatex]}
                                  components={customMarkdownComponents}
                                >
                                  {convertCitationsToLinks(parsed.summary)}
                                </ReactMarkdown>
                              </div>
                            </div>

                            {/* Section 2: Căn cứ pháp lý */}
                            <div className="bg-white border-l-4 border-l-amber-500 border border-gray-150/50 rounded-r-2xl rounded-l-md p-5 shadow-sm space-y-3">
                              <div className="flex items-center gap-2 text-indigo-950 font-black uppercase tracking-widest text-[10px]">
                                <Scale className="w-3.5 h-3.5 text-amber-500 animate-bounce" />
                                <span>2. Căn cứ pháp lý: Liệt kê tên tiêu chuẩn, điều khoản và trích đoạn gốc</span>
                              </div>
                              <div className="text-gray-800 text-[13px] sm:text-sm leading-relaxed prose prose-indigo max-w-none">
                                <ReactMarkdown
                                  remarkPlugins={[remarkMath, remarkGfm]}
                                  rehypePlugins={[rehypeKatex]}
                                  components={customMarkdownComponents}
                                >
                                  {convertCitationsToLinks(parsed.basis)}
                                </ReactMarkdown>
                              </div>
                            </div>

                            {/* Section 3: Ghi chú */}
                            {parsed.notes && (
                              <div className="bg-[#f0f9ff]/30 border-l-4 border-l-sky-500 border border-[#e0f2fe]/60 rounded-r-2xl rounded-l-md p-5 shadow-sm space-y-2">
                                <div className="flex items-center gap-2 text-sky-950 font-black uppercase tracking-widest text-[10px]">
                                  <FileText className="w-3.5 h-3.5 text-sky-500" />
                                  <span>3. Lưu ý & Ghi chú: Các thông tin bổ trợ</span>
                                </div>
                                <div className="text-gray-700 text-[12px] sm:text-[13px] font-semibold leading-relaxed prose prose-indigo max-w-none">
                                  <ReactMarkdown
                                    remarkPlugins={[remarkMath, remarkGfm]}
                                    rehypePlugins={[rehypeKatex]}
                                    components={customMarkdownComponents}
                                  >
                                    {convertCitationsToLinks(parsed.notes)}
                                  </ReactMarkdown>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className={cn(
                            "prose prose-sm prose-indigo max-w-none break-words font-medium leading-relaxed prose-table:border-collapse prose-table:border prose-table:border-gray-200 prose-th:bg-gray-50 prose-th:p-2 prose-td:p-2 prose-td:border prose-td:border-gray-200 prose-headings:text-indigo-900 prose-headings:font-black text-left",
                            msg.role === "user" && "prose-invert text-white"
                          )}>
                            <ReactMarkdown
                              remarkPlugins={[remarkMath, remarkGfm]}
                              rehypePlugins={[rehypeKatex]}
                              components={customMarkdownComponents}
                            >
                              {convertCitationsToLinks(msg.content)}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {isProcessing && (
                    <div className="flex items-center gap-2 text-gray-400 text-[10px] font-black uppercase tracking-widest italic ml-4 text-left">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                      Gemini đang suy nghĩ...
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : mode === "notes" ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <Save className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">
                      SỔ TAY GHI CHÚ
                    </h3>
                    <span className="bg-emerald-55 text-emerald-800 text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-emerald-110 flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      Đã đồng bộ Cloud
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">KNOWLEDGE NOTEBOOK</p>
                </div>
              </div>
            </div>

            {/* Thêm ghi chú mới thủ công */}
            <div className="bg-white rounded-[32px] border border-gray-150/60 p-6 shadow-xs space-y-4">
              <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest block">Thêm ghi chú lưu ý mới</span>
              <textarea
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="Nhập nội dung ghi chú kỹ thuật, công thức, hoặc lưu ý tiêu chuẩn..."
                className="w-full min-h-[100px] p-4 bg-slate-50 border border-transparent focus:border-indigo-120 focus:bg-white rounded-2xl text-[12px] font-semibold text-slate-800 placeholder-gray-400 outline-none transition-all resize-none focus:ring-1 focus:ring-indigo-100"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleAddNewManualNote}
                  disabled={isAddingNote || !newNoteText.trim()}
                  className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {isAddingNote ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>ĐANG LƯU...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>LƯU GHI CHÚ MỚI</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {notes && notes.length > 0 ? (
                notes.map((note) => (
                  <div key={note.id} className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all group relative overflow-visible">
                    <div className="flex justify-between items-center mb-4 sticky top-0 bg-white/95 backdrop-blur-md z-10 py-3 -mx-6 px-6 -mt-6 border-b border-gray-50 rounded-t-[32px] transition-all">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                          📅 {new Date(note.createdAt).toLocaleString("vi-VN", { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                        </div>
                        {visibleLanguages[note.id] && visibleLanguages[note.id] !== 'vi' && (
                          <span className={cn(
                            "text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md self-start sm:self-center",
                            visibleLanguages[note.id] === 'en' ? "bg-indigo-50 text-indigo-650 border border-indigo-150" : "bg-purple-50 text-purple-600 border border-purple-150"
                          )}>
                            Bản dịch {visibleLanguages[note.id] === 'en' ? 'Tiếng Anh' : 'Tiếng Hàn'}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-1.5">
                        {/* Dịch EN */}
                        <button
                          onClick={() => handleTranslate(note.content, note.id, 'en')}
                          disabled={translatingId[note.id] !== undefined && translatingId[note.id] !== null}
                          className={cn(
                            "p-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-1 cursor-pointer",
                            visibleLanguages[note.id] === 'en'
                              ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                              : "border-transparent text-gray-400 hover:text-indigo-600 hover:bg-slate-50"
                          )}
                          title="Dịch ghi chú sang tiếng Anh"
                        >
                          {translatingId[note.id] === 'en' ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                          ) : (
                            <Languages className="w-3.5 h-3.5" />
                          )}
                          <span className="hidden sm:inline">Dịch EN</span>
                        </button>

                        {/* Dịch KO */}
                        <button
                          onClick={() => handleTranslate(note.content, note.id, 'ko')}
                          disabled={translatingId[note.id] !== undefined && translatingId[note.id] !== null}
                          className={cn(
                            "p-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-1 cursor-pointer",
                            visibleLanguages[note.id] === 'ko'
                              ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                              : "border-transparent text-gray-400 hover:text-indigo-600 hover:bg-slate-50"
                          )}
                          title="Dịch ghi chú sang tiếng Hàn"
                        >
                          {translatingId[note.id] === 'ko' ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-550" />
                          ) : (
                            <Languages className="w-3.5 h-3.5" />
                          )}
                          <span className="hidden sm:inline">Dịch KO</span>
                        </button>

                        {/* Bản gốc (Chỉ xuất hiện khi đang xem bản dịch) */}
                        {visibleLanguages[note.id] && visibleLanguages[note.id] !== 'vi' && (
                          <button
                            onClick={() => setVisibleLanguages(prev => ({ ...prev, [note.id]: 'vi' }))}
                            className="p-1.5 rounded-lg border border-rose-150 bg-rose-50 hover:bg-rose-100/70 text-rose-700 text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1 cursor-pointer"
                            title="Quay về bản gốc tiếng Việt"
                          >
                            <Languages className="w-3.5 h-3.5 text-rose-500" />
                            <span className="hidden sm:inline">Gốc VI</span>
                          </button>
                        )}

                        {/* Tóm tắt AI */}
                        <button
                          onClick={() => {
                            const activeText = 
                              visibleLanguages[note.id] === 'en' && translations[note.id]?.en
                                ? translations[note.id].en
                                : visibleLanguages[note.id] === 'ko' && translations[note.id]?.ko
                                  ? translations[note.id].ko
                                  : note.content;
                            triggerSummarize(activeText);
                          }}
                          className="p-1.5 rounded-lg border border-transparent text-gray-400 hover:text-indigo-650 hover:bg-slate-50 text-[9px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-1 cursor-pointer"
                          title="Tóm tắt ngắn ghi chú bằng AI"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-indigo-505" />
                          <span className="hidden sm:inline">Tóm tắt AI</span>
                        </button>

                        <div className="w-[1px] h-4 bg-gray-150 mx-1" />

                        {/* Sao chép */}
                        <button
                          onClick={() => handleCopyText(
                            visibleLanguages[note.id] === 'en' && translations[note.id]?.en
                              ? translations[note.id].en
                              : visibleLanguages[note.id] === 'ko' && translations[note.id]?.ko
                                ? translations[note.id].ko
                                : note.content,
                            note.id
                          )}
                          className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all cursor-pointer"
                          title="Sao chép văn bản đang hiển thị"
                        >
                          {copiedId === note.id ? (
                            <Check className="w-4 h-4 text-emerald-500 animate-bounce" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>

                        {/* Xóa */}
                        {noteIdToDelete === note.id ? (
                          <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-right-2 duration-200">
                            <button
                              onClick={async () => {
                                if (onDeleteNote) {
                                  try {
                                    await onDeleteNote(note.id);
                                  } catch (err) {
                                    console.error("Lỗi xóa ghi chú:", err);
                                  }
                                }
                                setNoteIdToDelete(null);
                              }}
                              className="px-2 py-1 bg-red-650 hover:bg-red-700 text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap"
                            >
                              Xóa
                            </button>
                            <button
                              onClick={() => setNoteIdToDelete(null)}
                              className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap"
                            >
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setNoteIdToDelete(note.id);
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all cursor-pointer animate-in fade-in duration-300"
                            title="Xóa ghi chú"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="prose prose-sm prose-indigo max-w-none break-words font-medium leading-relaxed prose-table:border-collapse prose-table:border prose-table:border-gray-255 prose-th:bg-gray-50 prose-th:p-2 prose-td:p-2 prose-td:border prose-td:border-gray-255">
                      <ReactMarkdown
                        remarkPlugins={[remarkMath, remarkGfm]}
                        rehypePlugins={[rehypeKatex]}
                        components={customMarkdownComponents}
                      >
                        {convertCitationsToLinks(
                          visibleLanguages[note.id] === 'en' && translations[note.id]?.en
                            ? translations[note.id].en
                            : visibleLanguages[note.id] === 'ko' && translations[note.id]?.ko
                              ? translations[note.id].ko
                              : note.content
                        )}
                      </ReactMarkdown>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-50 text-[9px] text-gray-400 font-bold uppercase tracking-widest truncate">
                      📁 Nguồn: {note.fileName}
                    </div>
                  </div>
                ))
              ) : (
                <div className="bg-white rounded-[32px] border border-gray-100 p-12 shadow-sm min-h-[300px] flex flex-col items-center justify-center text-center space-y-4">
                  <div className="bg-indigo-55/40 text-indigo-100 p-5 rounded-full">
                    <Save className="w-12 h-12 text-gray-200 mx-auto" />
                  </div>
                  <div>
                    <h5 className="text-gray-400 text-xs font-black uppercase tracking-widest">Sổ tay ghi chú còn trống</h5>
                    <p className="text-gray-450 text-[9px] uppercase tracking-widest mt-2 max-w-xs leading-relaxed">
                      Lưu trữ các câu trả lời kỹ thuật từ mục "Hỏi đáp" bằng nút <strong>"Lưu ghi chú"</strong>.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : !activeFile ? (
          <div className="flex-1 h-full flex flex-col items-center justify-center p-12 text-center space-y-6">
            <div className="w-16 h-16 rounded-[24px] bg-amber-50 hover:bg-amber-100 border border-amber-100 flex items-center justify-center text-amber-500 shadow-sm mx-auto transition-all">
              <BookOpen className="w-8 h-8" />
            </div>
            <div className="space-y-2 max-w-sm">
              <p className="text-gray-950 text-base font-black uppercase tracking-widest">Hỏi đáp & Tra cứu nâng cao</p>
              <p className="text-gray-450 text-xs sm:text-sm leading-relaxed font-semibold">
                Tính năng này yêu cầu chọn một tài liệu kỹ thuật ở danh sách bên trái để mở khóa khả năng tra cứu tự động, trích xuất dữ liệu, hoặc đối chiếu.
              </p>
            </div>
          </div>
        ) : mode === "chat" ? (
          <>
            <div ref={scrollRef} className="space-y-4">
              {messages.map((msg) => {
                const parsed = msg.role === "ai" ? parseAIResponse(msg.content) : null;
                const isTranslated = visibleLanguages[msg.id] && visibleLanguages[msg.id] !== 'vi' && translations[msg.id]?.[visibleLanguages[msg.id]];
                
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "relative group/msg flex flex-col rounded-3xl p-5 shadow-sm transition-all drop-shadow-sm/80 animate-in fade-in duration-300 overflow-visible",
                      msg.role === "user"
                        ? "bg-indigo-600 text-white ml-auto max-w-[85%] pr-[76px]"
                        : "bg-[#f8fafc] border border-gray-200/50 mr-auto w-full max-w-[100%]"
                    )}
                  >
                    {msg.image && (
                      <div className="mb-3 rounded-2xl overflow-hidden border border-white/20">
                        <img src={msg.image} alt="User upload" className="max-w-full h-auto object-cover max-h-60" />
                      </div>
                    )}
                    
                    {/* Actions Toolbar - COMPACT FLOATING DOCK IN THE TOP-RIGHT CORNER */}
                    <div className="absolute top-3 bottom-3 right-3 w-fit pointer-events-none z-20 flex flex-col justify-start">
                      <div className={cn(
                        "sticky top-3 pointer-events-auto flex items-center gap-1 opacity-80 md:opacity-30 group-hover/msg:opacity-100 focus-within:opacity-100 hover:opacity-100 transition-all duration-300 p-1 rounded-xl shadow-sm border backdrop-blur-md",
                        msg.role === "user" 
                          ? "bg-indigo-750/95 border-indigo-505/35 text-white" 
                          : "bg-white/95 border-gray-150/75 text-gray-400"
                      )}>
                        {/* Tải về */}
                        <button
                          onClick={() => handleDownloadText(
                            isTranslated ? translations[msg.id][visibleLanguages[msg.id]] : msg.content,
                            `cau_tra_loi_${msg.id.slice(0, 5)}.txt`
                          )}
                          className={cn(
                            "flex items-center justify-center rounded-lg transition-all duration-300 pointer-events-auto cursor-pointer h-7 w-7 border border-transparent shadow-xs",
                            msg.role === "user"
                              ? "hover:bg-indigo-650 text-indigo-150 hover:text-white"
                              : "hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 hover:border-emerald-100"
                          )}
                          title="Tải về máy (.txt)"
                        >
                          <Download className="w-3.5 h-3.5 shrink-0" />
                        </button>

                        {/* Tóm tắt AI */}
                        {msg.role !== "user" && (
                          <button
                            onClick={() => triggerSummarize(
                              isTranslated ? translations[msg.id][visibleLanguages[msg.id]] : msg.content
                            )}
                            className="flex items-center justify-center rounded-lg transition-all duration-300 pointer-events-auto cursor-pointer h-7 w-7 bg-white hover:bg-violet-50 text-gray-400 hover:text-violet-600 border border-transparent hover:border-violet-100 shadow-xs"
                            title="Tóm tắt ngắn câu trả lời bằng AI"
                          >
                            <Sparkles className="w-3.5 h-3.5 shrink-0" />
                          </button>
                        )}

                        {/* Xuất Slides / Gamma AI */}
                        {msg.role !== "user" && (
                          <button
                            onClick={() => setPptModalData({ 
                              isOpen: true, 
                              content: isTranslated ? translations[msg.id][visibleLanguages[msg.id]] : msg.content, 
                              messageId: msg.id 
                            })}
                            className="flex items-center justify-center rounded-lg transition-all duration-300 pointer-events-auto cursor-pointer h-7 w-7 bg-white hover:bg-violet-50 text-gray-400 hover:text-violet-650 border border-transparent hover:border-violet-105 shadow-xs"
                            title="Xuất slide thuyết trình (PowerPoint / Gamma AI)"
                          >
                            <Presentation className="w-3.5 h-3.5 shrink-0" />
                          </button>
                        )}

                        {/* Sao chép */}
                        <button
                          onClick={() => handleCopyText(
                            isTranslated ? translations[msg.id][visibleLanguages[msg.id]] : msg.content,
                            msg.id
                          )}
                          className={cn(
                            "flex items-center justify-center rounded-lg transition-all duration-300 pointer-events-auto cursor-pointer h-7 w-7 border border-transparent shadow-xs",
                            msg.role === "user"
                              ? "hover:bg-indigo-600 text-indigo-100 hover:text-white"
                              : "hover:bg-indigo-55 text-gray-400 hover:text-indigo-600 hover:border-indigo-100"
                          )}
                          title="Sao chép câu trả lời"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 shrink-0" />
                          )}
                        </button>

                        {/* Dịch EN / KO / VI */}
                        {msg.role === "ai" && (
                          <div className="flex items-center gap-1 shrink-0 border-l border-gray-150/60 pl-1">
                            {/* Dịch EN */}
                            <button
                              onClick={() => handleTranslate(msg.content, msg.id, 'en')}
                              disabled={translatingId[msg.id] !== undefined && translatingId[msg.id] !== null}
                              className={cn(
                                "flex items-center justify-center rounded-lg p-1 text-[9px] font-black tracking-wider transition-all duration-300 pointer-events-auto cursor-pointer h-7 min-w-[28px] border shadow-xs select-none",
                                visibleLanguages[msg.id] === 'en'
                                  ? "bg-indigo-55 border-indigo-200 text-indigo-700 font-bold"
                                  : "bg-white hover:bg-slate-50 border-transparent text-gray-400 hover:text-indigo-650"
                              )}
                              title="Dịch câu trả lời sang Tiếng Anh"
                            >
                              {translatingId[msg.id] === 'en' ? (
                                <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />
                              ) : (
                                <span>EN</span>
                              )}
                            </button>

                            {/* Dịch KO */}
                            <button
                              onClick={() => handleTranslate(msg.content, msg.id, 'ko')}
                              disabled={translatingId[msg.id] !== undefined && translatingId[msg.id] !== null}
                              className={cn(
                                "flex items-center justify-center rounded-lg p-1 text-[9px] font-black tracking-wider transition-all duration-300 pointer-events-auto cursor-pointer h-7 min-w-[28px] border shadow-xs select-none",
                                visibleLanguages[msg.id] === 'ko'
                                  ? "bg-indigo-55 border-indigo-200 text-indigo-700 font-bold"
                                  : "bg-white hover:bg-slate-50 border-transparent text-gray-400 hover:text-indigo-650"
                              )}
                              title="Dịch câu trả lời sang Tiếng Hàn"
                            >
                              {translatingId[msg.id] === 'ko' ? (
                                <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />
                              ) : (
                                <span>KO</span>
                              )}
                            </button>

                            {/* Quay lại tiếng Việt */}
                            {visibleLanguages[msg.id] && visibleLanguages[msg.id] !== 'vi' && (
                              <button
                                onClick={() => setVisibleLanguages(prev => ({ ...prev, [msg.id]: 'vi' }))}
                                className="flex items-center justify-center rounded-lg p-1 text-[9px] font-black tracking-wider transition-all duration-350 pointer-events-auto cursor-pointer h-7 min-w-[28px] bg-rose-50 hover:bg-rose-100 border border-rose-150 text-rose-700 shadow-xs"
                                title="Quay lại bản gốc tiếng Việt"
                              >
                                <span>Gốc</span>
                              </button>
                            )}
                          </div>
                        )}

                        {/* Lưu vào sổ tay ghi chú */}
                        {msg.role === "ai" && (
                          <button
                            onClick={() => handleSaveMessageToNote(
                              isTranslated ? translations[msg.id][visibleLanguages[msg.id]] : msg.content,
                              msg.id
                            )}
                            disabled={savingId === msg.id}
                            className="flex items-center justify-center rounded-lg transition-all duration-300 pointer-events-auto cursor-pointer h-7 w-7 bg-white hover:bg-blue-50 text-gray-400 hover:text-blue-650 border border-transparent hover:border-blue-105 shadow-xs"
                            title="Lưu vào ghi chú"
                          >
                            {savingId === msg.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />
                            ) : savedIds.includes(msg.id) ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            ) : (
                              <Save className="w-3.5 h-3.5 shrink-0" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Content render body */}
                  {isTranslated ? (
                    <div className="prose prose-sm prose-indigo max-w-none break-words font-medium leading-relaxed prose-table:border-collapse prose-table:border prose-table:border-gray-200 prose-th:bg-gray-50 prose-th:p-2 prose-td:p-2 prose-td:border prose-td:border-gray-200 prose-headings:text-indigo-900 prose-headings:font-black text-left">
                      <ReactMarkdown
                        remarkPlugins={[remarkMath, remarkGfm]}
                        rehypePlugins={[rehypeKatex]}
                        components={customMarkdownComponents}
                      >
                          {convertCitationsToLinks(translations[msg.id][visibleLanguages[msg.id]])}
                        </ReactMarkdown>
                      </div>
                    ) : msg.role === "ai" && parsed && parsed.hasStructure ? (
                      <div className="space-y-5 w-full text-left">
                        {/* Section 1: Tóm tắt */}
                        <div className="bg-white border-l-4 border-l-indigo-600 border border-gray-150/50 rounded-r-2xl rounded-l-md p-5 shadow-sm space-y-2">
                          <div className="flex items-center gap-2 text-indigo-950 font-black uppercase tracking-widest text-[10px]">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-600 fill-indigo-100/30 animate-pulse" />
                            <span>1. Tóm tắt câu trả lời: Trực diện, ngắn gọn</span>
                          </div>
                          <div className="text-gray-800 text-[13px] sm:text-sm font-semibold leading-relaxed prose prose-indigo max-w-none">
                            <ReactMarkdown
                              remarkPlugins={[remarkMath, remarkGfm]}
                              rehypePlugins={[rehypeKatex]}
                              components={customMarkdownComponents}
                            >
                              {convertCitationsToLinks(parsed.summary)}
                            </ReactMarkdown>
                          </div>
                        </div>

                        {/* Section 2: Căn cứ pháp lý */}
                        <div className="bg-white border-l-4 border-l-amber-500 border border-gray-150/50 rounded-r-2xl rounded-l-md p-5 shadow-sm space-y-3">
                          <div className="flex items-center gap-2 text-indigo-950 font-black uppercase tracking-widest text-[10px]">
                            <Scale className="w-3.5 h-3.5 text-amber-500 animate-bounce" />
                            <span>2. Căn cứ pháp lý: Liệt kê tên tiêu chuẩn, điều khoản và trích đoạn gốc</span>
                          </div>
                          <div className="text-gray-800 text-[13px] sm:text-sm leading-relaxed prose prose-indigo max-w-none">
                            <ReactMarkdown
                              remarkPlugins={[remarkMath, remarkGfm]}
                              rehypePlugins={[rehypeKatex]}
                              components={customMarkdownComponents}
                            >
                              {convertCitationsToLinks(parsed.basis)}
                            </ReactMarkdown>
                          </div>
                        </div>

                        {/* Section 3: Ghi chú */}
                        {parsed.notes && (
                          <div className="bg-[#f0f9ff]/30 border-l-4 border-l-sky-500 border border-[#e0f2fe]/60 rounded-r-2xl rounded-l-md p-5 shadow-sm space-y-2">
                            <div className="flex items-center gap-2 text-sky-950 font-black uppercase tracking-widest text-[10px]">
                              <FileText className="w-3.5 h-3.5 text-sky-500" />
                              <span>3. Lưu ý & Ghi chú: Các thông tin bổ trợ</span>
                            </div>
                            <div className="text-gray-700 text-[12px] sm:text-[13px] font-semibold leading-relaxed prose prose-indigo max-w-none">
                              <ReactMarkdown
                                remarkPlugins={[remarkMath, remarkGfm]}
                                rehypePlugins={[rehypeKatex]}
                                components={customMarkdownComponents}
                              >
                                {convertCitationsToLinks(parsed.notes)}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className={cn(
                        "prose prose-sm prose-indigo max-w-none break-words font-medium leading-relaxed prose-table:border-collapse prose-table:border prose-table:border-gray-200 prose-th:bg-gray-50 prose-th:p-2 prose-td:p-2 prose-td:border prose-td:border-gray-200 prose-headings:text-indigo-900 prose-headings:font-black text-left",
                        msg.role === "user" && "prose-invert text-white"
                      )}>
                        <ReactMarkdown
                          remarkPlugins={[remarkMath, remarkGfm]}
                          rehypePlugins={[rehypeKatex]}
                          components={customMarkdownComponents}
                        >
                          {convertCitationsToLinks(msg.content)}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                );
              })}
              {isProcessing && (
                <div className="flex items-center gap-2 text-gray-400 text-[10px] font-black uppercase tracking-widest italic ml-4 text-left">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                  Gemini đang suy nghĩ...
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <ListFilter className="w-4 h-4 text-indigo-600" />
                </div>
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">
                  {isEditingSchema ? "Cấu hình trích xuất" : "Dữ liệu trích xuất kỹ thuật"}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsEditingSchema(!isEditingSchema)}
                  className={cn(
                    "p-2 rounded-lg transition-all",
                    isEditingSchema ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
                  )}
                  title={isEditingSchema ? "Xem kết quả" : "Chỉnh sửa Schema"}
                >
                  {isEditingSchema ? <CheckCircle2 className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
                </button>
                {!isEditingSchema && (
                  <>
                    <button 
                      onClick={handleCopyAllExtractedData}
                      className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"
                      title="Sao chép toàn bộ kết quả"
                    >
                      {copiedId === "extracted_all" ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"><Download className="w-4 h-4" /></button>
                  </>
                )}
              </div>
            </div>

            <div className="h-[1px] bg-gray-100" />

            {isEditingSchema ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">CÁC TRƯỜNG DỮ LIỆU</h4>
                  <button 
                    onClick={handleAddField}
                    className="flex items-center gap-1 text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-800"
                  >
                    <Plus className="w-3 h-3" /> THÊM TRƯỜNG
                  </button>
                </div>
                
                <div className="space-y-3">
                  {schema.map((field, idx) => (
                    <div key={idx} className="bg-white rounded-3xl border border-gray-100 p-5 shadow-sm group relative overflow-hidden">
                      <div className="flex gap-4">
                        <div className="flex-1 space-y-3">
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Tên trường (ID)</label>
                            <input
                              value={field.name}
                              onChange={(e) => updateField(idx, "name", e.target.value)}
                              placeholder="Ví dụ: publisher"
                              className="w-full bg-[#f8f9fc] border-none rounded-xl py-3 px-4 text-xs font-bold text-indigo-600 placeholder:text-gray-300 focus:ring-2 focus:ring-indigo-100 transition-all outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Mô tả nội dung cần lấy</label>
                            <textarea
                              value={field.description}
                              onChange={(e) => updateField(idx, "description", e.target.value)}
                              placeholder="Ví dụ: Cơ quan ban hành tài liệu này là ai?"
                              className="w-full bg-[#f8f9fc] border-none rounded-xl py-3 px-4 text-xs font-medium text-gray-600 placeholder:text-gray-300 focus:ring-2 focus:ring-indigo-100 transition-all outline-none resize-none h-20"
                            />
                          </div>
                        </div>
                        <button 
                          onClick={() => handleDeleteField(idx)}
                          className="self-start p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setIsEditingSchema(false)}
                  className="w-full py-4 bg-indigo-50 text-indigo-600 rounded-[24px] font-black text-[10px] uppercase tracking-[0.2em] hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                >
                  XÁC NHẬN CẤU HÌNH
                </button>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="bg-indigo-600 text-white p-2 rounded-xl">
                      <Zap className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest">KẾT QUẢ PHÂN TÍCH THÔNG MINH</h4>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Logic-based Source Information</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleCopyAllExtractedData}
                      className="p-2.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                      title="Sao chép toàn bộ kết quả"
                    >
                      {copiedId === "extracted_all" ? <Check className="w-5 h-5 text-emerald-500" /> : <Copy className="w-5 h-5" />}
                    </button>
                    <button className="p-2.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"><Download className="w-5 h-5" /></button>
                  </div>
                </div>
                
                {/* Data Blocks based on extraction */}
                {schema.map((field) => (
                  <div key={field.name} className="bg-white rounded-[32px] border border-gray-100 p-8 shadow-sm hover:shadow-xl hover:translate-y-[-4px] transition-all group">
                    <div className="flex justify-between items-start mb-6">
                      <h5 className="text-[12px] font-black text-indigo-600 uppercase tracking-[0.2em]">{field.name.replace(/_/g, ' ')}</h5>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const val = extractedData?.[field.name];
                            const valStr = Array.isArray(val) 
                              ? val.map((item: any) => `- ${item}`).join('\n')
                              : typeof val === 'object'
                              ? JSON.stringify(val, null, 2)
                              : (val || "");
                            handleCopyText(valStr, `field_${field.name}`);
                          }}
                          className="p-1.5 text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                          title="Sao chép trường này"
                        >
                          {copiedId === `field_${field.name}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <div className="bg-gray-55 text-[10px] font-black text-gray-400 px-3 py-1 rounded-full uppercase tracking-widest border border-gray-100 group-hover:bg-indigo-50 group-hover:text-indigo-400 group-hover:border-indigo-100 transition-colors">
                          {field.name.toUpperCase()}
                        </div>
                      </div>
                    </div>
                    <div className="text-[17px] font-bold text-gray-700 leading-relaxed min-h-[50px] opacity-90 group-hover:opacity-100 prose prose-base prose-indigo max-w-none prose-table:border-collapse prose-table:border prose-table:border-gray-150 prose-th:bg-gray-55 prose-th:p-2 prose-td:p-2 prose-td:border prose-td:border-gray-150">
                      <ReactMarkdown
                        remarkPlugins={[remarkMath, remarkGfm]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {Array.isArray(extractedData?.[field.name]) 
                          ? extractedData?.[field.name].map((item: any) => `- ${item}`).join('\n')
                          : typeof extractedData?.[field.name] === 'object'
                          ? `\`\`\`json\n${JSON.stringify(extractedData?.[field.name], null, 2)}\n\`\`\``
                          : (extractedData?.[field.name] || "Dữ liệu đang được phân tích bởi Gemini Core Engine...")
                        }
                      </ReactMarkdown>
                    </div>

                  </div>
                ))}
              </div>
            )}

            {extractStatus !== "success" && (
              <button
                onClick={handleExtract}
                disabled={extractStatus === "loading"}
                className="w-full bg-white border border-gray-105 text-gray-400 py-6 rounded-[32px] font-black text-[10px] uppercase tracking-[0.2em] shadow-sm hover:border-indigo-200 hover:text-indigo-600 transition-all flex items-center justify-center gap-3"
              >
                {extractStatus === "loading" ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                Bắt đầu phân tích kỹ thuật
              </button>
            )}

            <button
              onClick={() => onSync(extractedData)}
              disabled={isSyncing || !extractedData}
              className="w-full bg-gray-900 text-white py-6 rounded-[32px] font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-gray-200 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-4"
            >
              {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="rotate-[-20deg] w-5 h-5" />}
              ĐỒNG BỘ THUVIENNOIBO
            </button>
          </div>
        )}
      </div>

      {((mode === "general_chat" && generalMessages.length > 0) || (activeFile && mode === "chat")) && (
        <>
          {/* Main compact bottom input area (visible only at the bottom/not scrolled, or automatically hidden on scroll) */}
          <div className={cn(
            "absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#f4f7fa] via-[#f4f7fa]/90 to-transparent pointer-events-none flex flex-col z-20 transition-all duration-500 ease-in-out",
            isScrolled 
              ? "translate-y-28 opacity-0 pointer-events-none scale-95" 
              : "translate-y-0 opacity-100"
          )}>
            <div className="bg-white border border-gray-250/80 rounded-2xl p-2 shadow-lg shadow-indigo-100/10 focus-within:ring-2 focus-within:ring-indigo-100 transition-all font-sans flex flex-col gap-1.5 pointer-events-auto">
              {selectedImage && (
                <div className="px-2 pt-1 flex flex-wrap gap-1.5 animate-in fade-in duration-200">
                  <div className="relative w-11 h-11 rounded-lg overflow-hidden border border-gray-150 shadow-sm group">
                    <img src={selectedImage} alt="Selected" className="w-full h-full object-cover" />
                    <button 
                      onClick={removeSelectedImage}
                      className="absolute top-0.5 right-0.5 p-0.5 bg-red-500 text-white rounded-full opacity-100 transition-opacity cursor-pointer"
                    >
                      <X className="w-2 h-2" />
                    </button>
                  </div>
                </div>
              )}
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Đặt câu hỏi tra cứu, tìm thông số chuẩn..."
                className="w-full bg-transparent border-none py-1.5 px-3 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-0 transition-all resize-none h-10 text-gray-800 placeholder:text-gray-400 no-scrollbar overflow-y-auto leading-normal"
              />
              <div className="flex items-center justify-between px-2 pt-1 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleImageChange} 
                    accept="image/*" 
                    className="hidden" 
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all cursor-pointer"
                    title="Thêm hình ảnh"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                  <span className="text-[8px] text-gray-400 font-extrabold uppercase tracking-widest">
                    🔍 Global Engine
                  </span>
                </div>
                <button
                  onClick={handleSend}
                  disabled={(!input.trim() && !selectedImage) || isProcessing}
                  className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 text-white rounded-full shadow-md shadow-indigo-600/10 transition-all cursor-pointer flex items-center justify-center"
                >
                  {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Collapsed floating pill button when scrolled down */}
          {isScrolled && !isComposerExpanded && (
            <button
              onClick={() => setIsComposerExpanded(true)}
              className="absolute bottom-6 right-6 z-30 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold uppercase tracking-widest text-[9px] sm:text-[10px] py-2.5 px-4 rounded-full shadow-2xl transition-all duration-300 hover:scale-[1.05] cursor-pointer animate-in fade-in slide-in-from-bottom-4 border border-indigo-500/30"
            >
              <Sparkles className="w-3.5 h-3.5 text-violet-200 fill-violet-200/20" />
              <span>HỎI THÊM AI</span>
            </button>
          )}

          {/* Elegant floating overlay dialog for easy popup queries */}
          {isComposerExpanded && (
            <QuickComposerOverlay
              onSend={(text, image) => {
                onSendMessage(text, image || undefined, mode === "general_chat", mode === "general_chat" ? selectedGeneralDocIds : undefined);
                setIsComposerExpanded(false);
              }}
              onClose={() => setIsComposerExpanded(false)}
              isProcessing={isProcessing}
            />
          )}
        </>
      )}

      {/* Gemini Quick-Summarizer Assistant Modal */}
      {summarizingText !== null && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[32px] border border-gray-100 max-w-2xl w-full p-8 shadow-2xl space-y-6 animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md">
                  <Sparkles className="w-5 h-5 fill-white/20 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    Trợ lý Tóm tắt Siêu tốc Gemini AI
                  </h3>
                  <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-widest mt-0.5">Rút gọn thông số kỹ thuật tức thì</p>
                </div>
              </div>
              <button 
                onClick={() => setSummarizingText(null)}
                className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-5 pr-2 no-scrollbar">
              {/* Controls */}
              <div className="flex items-center justify-between bg-indigo-50/50 rounded-2xl p-4 border border-indigo-100/40">
                <span className="text-xs font-black text-indigo-950 uppercase tracking-wider">Số ý tóm tắt mong muốn:</span>
                <div className="flex items-center gap-2">
                  {[3, 5, 7].map((num) => (
                    <button
                      key={num}
                      onClick={() => {
                        setBulletCount(num);
                        if (summarizingText) triggerSummarize(summarizingText, num);
                      }}
                      className={cn(
                        "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer",
                        bulletCount === num 
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20" 
                          : "bg-white text-gray-500 hover:text-gray-905 border border-gray-100"
                      )}
                    >
                      {num} Ý
                    </button>
                  ))}
                </div>
              </div>

              {/* Loader or Content */}
              {isSummarizing ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-4">
                  <div className="relative">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
                    <Sparkles className="w-4 h-4 text-purple-500 absolute -top-1 -right-1 animate-pulse" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-xs font-black text-gray-950 uppercase tracking-widest animate-pulse">Sử dụng Gemini 3.5 Flash...</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Đang bóc tách số liệu & làm gọn văn bản</p>
                  </div>
                </div>
              ) : summarizeError ? (
                <div className="bg-rose-50/70 border border-rose-250 rounded-2xl p-5 text-center space-y-2">
                  <span className="text-2xl">⚠️</span>
                  <p className="text-xs font-bold text-rose-600 uppercase tracking-wider">{summarizeError}</p>
                  <button 
                    onClick={() => { if (summarizingText) triggerSummarize(summarizingText); }}
                    className="mt-2 px-4 py-2 bg-rose-600 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-xl hover:bg-rose-700 transition"
                  >
                    Thử lại
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Kết quả tóm tắt bằng AI (Markdown):</span>
                    <div className="bg-slate-50 border border-slate-200/50 rounded-2xl p-5 text-sm font-semibold text-slate-800 leading-relaxed font-sans prose prose-indigo max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5">
                      <ReactMarkdown
                        remarkPlugins={[remarkMath, remarkGfm]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {summaryResult || "Chưa có kết quả tóm tắt."}
                      </ReactMarkdown>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Dữ liệu nguồn gốc kỹ thuật:</span>
                    <div className="bg-gray-50/50 border border-gray-200/50 rounded-2xl p-4 text-xs font-semibold text-gray-500 max-h-32 overflow-y-auto no-scrollbar whitespace-pre-wrap leading-relaxed">
                      {summarizingText}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-100 shrink-0">
              <button 
                onClick={() => setSummarizingText(null)}
                className="px-6 py-4 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-gray-500 rounded-2xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer text-center"
              >
                Hủy bỏ
              </button>

              {onSaveNote && (
                <button
                  disabled={isSummarizing || !summaryResult || isSavingSummaryToNote}
                  onClick={handleSaveSummaryToNote}
                  className={cn(
                    "flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 border shadow-xs active:scale-98",
                    savedSummaryToNote
                      ? "bg-emerald-50 border-emerald-250 text-emerald-700 hover:bg-emerald-100/70"
                      : "bg-white border-gray-200 hover:border-indigo-200 hover:bg-indigo-50/30 text-indigo-750"
                  )}
                >
                  {isSavingSummaryToNote ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-550" />
                      <span>ĐANG LƯU...</span>
                    </>
                  ) : savedSummaryToNote ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-500 animate-bounce" />
                      <span>ĐÃ LƯU SỔ TAY</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>LƯU SỔ TAY GHI CHÚ</span>
                    </>
                  )}
                </button>
              )}

              <button 
                disabled={isSummarizing || !summaryResult}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(cleanLatexForClipboard(summaryResult));
                    setCopiedSummary(true);
                    setTimeout(() => {
                      setCopiedSummary(false);
                      setSummarizingText(null);
                    }, 1200);
                  } catch (err) {
                    console.error(err);
                  }
                }}
                className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-250 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg hover:shadow-indigo-600/15 cursor-pointer flex items-center justify-center gap-2 active:scale-98"
              >
                {copiedSummary ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    <span>ĐÃ SAO CHÉP & ĐÓNG</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>SAO CHÉP TÓM TẮT AI</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* PowerPoint & Gamma AI Presentation Exporter Modal */}
      {pptModalData && pptModalData.isOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[32px] border border-gray-100 max-w-3xl w-full p-8 shadow-2xl space-y-6 animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
                  <Presentation className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    Xuất Bản Thuyết Trình (PowerPoint / Gamma AI)
                  </h3>
                  <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-widest mt-0.5">Biến câu trả lời kỹ thuật thành bài trình chiếu chuyên nghiệp</p>
                </div>
              </div>
              <button 
                onClick={() => setPptModalData(null)}
                className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-6 pr-2 no-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* PPTX Option */}
                <div className="bg-[#f8fafc] rounded-3xl border border-gray-200/60 p-6 flex flex-col justify-between space-y-6 hover:shadow-md transition-all duration-300">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-indigo-900">
                      <Presentation className="w-4 h-4" />
                      <h4 className="text-xs font-black uppercase tracking-wider text-indigo-950">1. Tải PPTX Truyền Thống</h4>
                    </div>
                    <p className="text-[11px] text-gray-500 leading-relaxed font-semibold">
                      Tự động chuyển đổi câu trả lời thành một file PowerPoint (.pptx). Hệ thống sẽ tự động bóc tách các đề mục lớn để định hình cấu trúc slide riêng biệt, bố cục 16:9 phối màu Navy đậm đà tối giản, hoàn hảo cho báo cáo hội nghị.
                    </p>
                    <ul className="text-[10px] text-gray-400 space-y-1 font-bold uppercase tracking-wide">
                      <li>• Thiết kế trang bìa riêng biệt</li>
                      <li>• Thanh điểm nhấn màu Indigo</li>
                      <li>• Cấu trúc gạch đầu dòng lý tưởng</li>
                    </ul>
                  </div>

                  <button
                    disabled={isGeneratingPpt}
                    onClick={() => handleExportToPPTX(pptModalData.content)}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-md shadow-indigo-600/10 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isGeneratingPpt ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>ĐANG KHỞI TẠO FILE PPTX...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        <span>TẢI FILE POWERPOINT (.PPTX)</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Gamma Option */}
                <div className="bg-gradient-to-br from-violet-50/20 to-indigo-50/20 rounded-3xl border border-violet-100/55 p-6 flex flex-col justify-between space-y-6 hover:shadow-md transition-all duration-300">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-violet-700">
                      <Sparkles className="w-4 h-4 animate-pulse" />
                      <h4 className="text-xs font-black uppercase tracking-wider text-violet-950">2. Nhập Sang Gamma AI</h4>
                    </div>
                    <p className="text-[11px] text-gray-500 leading-relaxed font-semibold">
                      Dàn ý (Outline) kỹ thuật được thiết kế tinh giản, tương thích tối đa để nhập trực tiếp vào dịch vụ thiết kế bài giảng thông minh <strong>Gamma (gamma.app)</strong> hỗ trợ AI sinh ảnh và bố cục tự động cao cấp.
                    </p>
                    <div className="bg-white/80 border border-violet-100 rounded-xl p-3 text-[10px] text-gray-400 font-bold space-y-1 uppercase tracking-wider">
                      <p className="text-violet-650 font-black mb-1">Quy trình 3 bước siêu tốc:</p>
                      <p>1. Ấn nút sao chép Dàn ý Markdown</p>
                      <p>2. Mở Gamma.app ➜ Chọn 'Import File or Text'</p>
                      <p>3. Dán mã dàn ý vào và để Gamma AI hoàn thiện bài trình diễn</p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={async () => {
                        try {
                          const outline = generateGammaOutline(pptModalData.content);
                          await navigator.clipboard.writeText(outline);
                          setCopiedGammaOutline(true);
                          setTimeout(() => setCopiedGammaOutline(false), 2000);
                        } catch (err) {
                          console.error(err);
                        }
                      }}
                      className="flex-1 py-4 bg-violet-600 hover:bg-violet-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-md shadow-violet-600/10 cursor-pointer flex items-center justify-center gap-2"
                    >
                      {copiedGammaOutline ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-300 animate-bounce" />
                          <span>ĐÃ SAO CHÉP OUTLINE!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>SAO CHÉP DÀN Ý</span>
                        </>
                      )}
                    </button>

                    <a
                      href="https://gamma.app"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-4 px-5 bg-white hover:bg-violet-50 text-violet-750 border border-violet-200/60 rounded-2xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                    >
                      <span>MỞ GAMMA</span>
                      <ExternalLink className="w-4 h-4 shrink-0" />
                    </a>
                  </div>
                </div>

              </div>

              {/* Collapsible preview box of mapped slide deck */}
              <div className="space-y-2">
                <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest block">Xem thử bố cục Slide ({parseContentToSlides(pptModalData.content).length} trang):</span>
                <div className="bg-slate-50 border border-slate-200/50 rounded-2xl p-4 max-h-40 overflow-y-auto pr-2 no-scrollbar space-y-3">
                  {parseContentToSlides(pptModalData.content).map((slide, sIdx) => (
                    <div key={sIdx} className="border-b border-gray-200/45 pb-3 last:border-0 last:pb-0">
                      <h5 className="text-[11px] font-black text-slate-800 uppercase tracking-wider">{sIdx + 1}. {slide.title}</h5>
                      <ul className="list-disc pl-4 mt-1 text-[10px] text-gray-500 font-semibold space-y-0.5">
                        {slide.bullets.map((b, bIdx) => (
                          <li key={bIdx} className="truncate">{b}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex pt-4 border-t border-gray-100 shrink-0">
              <button 
                onClick={() => setPptModalData(null)}
                className="w-full py-4 bg-gray-55 hover:bg-gray-100 text-gray-500 rounded-2xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer text-center"
              >
                Đóng lại
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

interface QuickComposerOverlayProps {
  onSend: (text: string, image: string | null) => void;
  onClose: () => void;
  isProcessing: boolean;
}

function QuickComposerOverlay({
  onSend,
  onClose,
  isProcessing
}: QuickComposerOverlayProps) {
  const [localInput, setLocalInput] = useState("");
  const [localImage, setLocalImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLocalImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSend = () => {
    if (!localInput.trim() && !localImage) return;
    if (isProcessing) return;
    onSend(localInput, localImage);
    setLocalInput("");
    setLocalImage(null);
  };

  return (
    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs z-30 flex items-end justify-center p-4 sm:p-6 animate-in fade-in duration-200 pointer-events-auto">
      <div className="bg-white border border-gray-200 rounded-[24px] p-4 shadow-2xl w-full max-w-md mb-2 relative animate-in slide-in-from-bottom-6 zoom-in-95 duration-300 flex flex-col gap-2.5">
        <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
          <div className="flex items-center gap-1.5 text-indigo-600">
            <Sparkles className="w-4 h-4 fill-indigo-100 animate-pulse text-indigo-500" />
            <span className="text-[9px] font-black uppercase tracking-[0.15em]">ĐẶT CÂU HỎI NHANH</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all opacity-70 hover:opacity-100"
            title="Đóng popup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {localImage && (
          <div className="px-1 flex flex-wrap gap-1.5 animate-in fade-in duration-200">
            <div className="relative w-11 h-11 rounded-lg overflow-hidden border border-gray-150 shadow-sm group">
              <img src={localImage} alt="Selected" className="w-full h-full object-cover" />
              <button 
                onClick={() => setLocalImage(null)}
                className="absolute top-0.5 right-0.5 p-0.5 bg-red-500 text-white rounded-full cursor-pointer hover:scale-105 transition-all"
              >
                <X className="w-2 h-2" />
              </button>
            </div>
          </div>
        )}
        
        <textarea
          value={localInput}
          onChange={(e) => setLocalInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Hỏi tiếp thông tin hoặc quy định kỹ thuật khác..."
          className="w-full bg-[#f8f9fa] border border-gray-100 rounded-xl py-2 px-3 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all resize-none h-16 text-gray-800 placeholder:text-gray-400 leading-normal"
          autoFocus
        />
        
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImageChange} 
              accept="image/*" 
              className="hidden" 
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all cursor-pointer"
              title="Thêm hình ảnh"
            >
              <Camera className="w-4 h-4" />
            </button>
            <span className="text-[8px] text-gray-400 font-extrabold uppercase tracking-widest leading-none">
              AI Engine
            </span>
          </div>
          
          <div className="flex items-center gap-1.5">
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-lg font-black text-[9px] uppercase tracking-wider transition-all cursor-pointer"
            >
              Thu nhỏ
            </button>
            <button
              onClick={handleSend}
              disabled={(!localInput.trim() && !localImage) || isProcessing}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 text-white rounded-lg font-black text-[9px] uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md shadow-indigo-600/10 cursor-pointer"
            >
              {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              <span>GỬI ĐI</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

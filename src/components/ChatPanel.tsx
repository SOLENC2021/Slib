import React, { useState, useRef, useEffect } from "react";
import { 
  Send, Zap, ListFilter, Save, CheckCircle2, 
  AlertCircle, Loader2, Copy, Maximize2, Download,
  Plus, Trash2, Settings, Sparkles, X, LayoutGrid,
  Check, Scale, Search, ArrowLeftRight, ZoomIn, ZoomOut, RotateCcw, Minimize2, BookOpen, FileText, Camera
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { cn } from "@/lib/utils";
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
    
    sections.summary = content.substring(summaryStart, basisStart).trim();

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
  onTogglePdfViewer
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

  // Gemini Quick-Summarizer Assistant States
  const [summarizingText, setSummarizingText] = useState<string | null>(null);
  const [summaryResult, setSummaryResult] = useState<string>("");
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [bulletCount, setBulletCount] = useState<number>(3);
  const [summarizeError, setSummarizeError] = useState<string | null>(null);
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);

  const triggerSummarize = async (text: string, count = bulletCount) => {
    setSummarizingText(text);
    setIsSummarizing(true);
    setSummaryResult("");
    setSummarizeError(null);
    setCopiedSummary(false);

    try {
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, numBulletPoints: count })
      });
      if (!response.ok) throw new Error("Yêu cầu tóm tắt thất bại");
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
                setMode("compare");
                setSelectedCompareIds(prev => prev.includes(matched.id) ? prev : [...prev, matched.id]);
              } else {
                alert(`Không tìm thấy file tài liệu nào trong thư viện trùng khớp với tiêu chuẩn "${text}". Vui lòng tải file "${text}" lên hệ thống trước.`);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-[12px] font-black text-rose-700 bg-rose-50 border border-rose-200/60 rounded-xl uppercase tracking-wider shadow-sm hover:bg-rose-100 transition-all cursor-pointer active:scale-95 text-left"
            title={matched ? `Click để mở tiêu chuẩn ${matched.name} và bật tab Tra cứu & Đối chiếu` : `Chưa có file tiêu chuẩn "${text}" trong thư viện`}
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
        setSelectedComplianceRefIds(stdF.map(f => f.id));
      }
    }
  }, [mode, activeFile, allFiles]);

  const handleCopyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownloadText = (text: string, defaultFilename: string) => {
    try {
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
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

  const handleCompareExecution = async () => {
    if (selectedCompareIds.length === 0) {
      setCompareError("Vui lòng chọn ít nhất 1 tài liệu để tiến hành so sánh.");
      return;
    }
    
    setIsComparing(true);
    setCompareError(null);
    setCompareResult(null);
    setCompareStep(1); // 1: Connecting

    try {
      const selectedFiles = allFiles.filter(f => selectedCompareIds.includes(f.id));
      
      setCompareStep(2); // Docs Processing / OCR Check representation

      const response = await fetch("/api/compare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          compareFiles: selectedFiles,
          prompt: comparePrompt || "Hãy thực hiện so sánh đối chiếu kỹ thuật chi tiết nhất giữa các tài liệu trên."
        })
      });

      setCompareStep(3); // AI is writing detailed engineering comparison

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

    setIsComplianceAuditing(true);
    setComplianceError(null);
    setComplianceResult(null);
    setComplianceStep(1); // Reading Drawing File

    try {
      const drawingFile = allFiles.find(f => f.id === selectedComplianceDrawingId);
      if (!drawingFile) throw new Error("Không thể định vị được bản vẽ chỉ định.");

      setComplianceStep(2); // Connecting and referencing selected standards from library

      const refFiles = allFiles.filter(f => selectedComplianceRefIds.includes(f.id));

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
      } else {
        ruleDesc = customCompliancePrompt || "Phân tích, đánh giá chi tiết sự phù hợp của tất cả thông số hình học và ghi chú kỹ thuật trên bản vẽ đối với các dòng pháp quy hiện hành.";
      }

      const auditPrompt = `
[YÊU CẦU ĐẶC BIỆT - CHUYÊN GIA THẨM ĐỊNH TUÂN THỦ TCVN/QCVN]
Bạn là GIÁM ĐỐC THẨM ĐỊNH VÀ KIỂM SOÁT THIẾT KẾ XÂY DỰNG. Bạn có năng lực thâm sâu đọc hiểu bản vẽ CAD / bản vẽ kết cấu chi tiết dưới định dạng văn bản số và dữ liệu hình ảnh kỹ thuật để rà soát sự sai lệch tiêu chuẩn hiện hành.

Nhiệm vụ của bạn: Tiến hành THẨM ĐỊNH TOÀN DIỆN Bản vẽ kỹ thuật "${drawingFile.name}" dựa trên hệ quy chuẩn pháp luật hiện hành và các bộ quy tắc tham chiếu trong Thư viện Tài liệu đã chọn:
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

      setComplianceStep(3); // AI Auditing drawing data

      const response = await fetch("/api/compare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          compareFiles: [drawingFile, ...refFiles],
          prompt: auditPrompt
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Sự cố mạng phía AI Server (${response.status})`);
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
        const refFiles = allFiles ? allFiles.filter(f => selectedComplianceRefIds.includes(f.id)) : [];
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
      navigator.clipboard.writeText(formattedText);
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
      const response = await fetch("/api/register-gemini-file", {
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
    const typeValue = typeOverride || mindmapType;
    if (typeOverride) {
      setMindmapType(typeOverride);
    }
    setMindmapStatus("loading");
    try {
      const response = await fetch("/api/generate-mindmap", {
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
          <span>KIỂM TRA BẢN VẼ</span>
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
        {activeFile && mode !== "compare" && mode !== "compliance" && mode !== "general_chat" && (
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
 
              {/* Standards Reference Checkboxes */}
              <div className="pt-2">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-2">
                  2. THƯ VIỆN TIÊU CHUẨN ĐỐI CHIẾU ({selectedComplianceRefIds.length} đã chọn)
                </label>
                <div className="max-h-[195px] overflow-y-auto border border-gray-200/50 rounded-2xl p-4 bg-[#f8fafc] space-y-3 no-scrollbar shadow-xs">
                  {allFiles.filter(f => f.category !== "Bản vẽ thiết kế").length === 0 ? (
                    <p className="text-center text-[10px] py-6 text-gray-400 uppercase font-black tracking-widest bg-white rounded-xl border border-gray-150">Không có file tiêu chuẩn tham chiếu nào đã tải.</p>
                  ) : (
                    allFiles.filter(f => f.category !== "Bản vẽ thiết kế").map(file => {
                      const isChecked = selectedComplianceRefIds.includes(file.id);
                      const handleToggle = () => {
                        setSelectedComplianceRefIds(prev =>
                          isChecked ? prev.filter(id => id !== file.id) : [...prev, file.id]
                        );
                      };
                      return (
                        <label key={file.id} className="flex items-center gap-3.5 p-3.5 bg-white rounded-2xl hover:bg-indigo-50/30 border border-gray-200/50 cursor-pointer transition-all duration-200 shadow-xs">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={handleToggle}
                            className="w-4.5 h-4.5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-black text-gray-800 truncate uppercase tracking-wide">{file.name}</p>
                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">
                              {file.category || "Quy chuẩn"} • {file.size || "0.1 MB"}
                            </span>
                          </div>
                        </label>
                      );
                    })
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

              {/* Scrollable list of files */}
              <div className="max-h-[260px] overflow-y-auto border border-gray-200/50 rounded-2xl p-4 bg-[#f8fafc] space-y-3 no-scrollbar shadow-inner mt-4">
                {allFiles.filter(item => item.name.toLowerCase().includes(compareSearch.toLowerCase())).length === 0 ? (
                  <p className="text-center text-xs text-gray-450 py-8 uppercase tracking-widest font-black bg-white rounded-xl border border-gray-150">Không tìm thấy tài liệu phù hợp</p>
                ) : (
                  allFiles
                    .filter(item => item.name.toLowerCase().includes(compareSearch.toLowerCase()))
                    .map((item) => {
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
                            "flex items-center justify-between p-4.5 bg-white rounded-2xl border transition-all duration-300 cursor-pointer shadow-xs hover:border-indigo-200",
                            isChecked ? "bg-indigo-50/40 border-indigo-400" : "border-gray-200/50 hover:bg-slate-50/45"
                          )}
                        >
                          <div className="flex items-center gap-3.5 min-w-0 flex-1 pr-4">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={handleToggle}
                              onClick={(e) => e.stopPropagation()}
                              className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-extrabold text-gray-850 truncate">{item.name}</p>
                              <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mt-1">
                                {item.category || "Kiến trúc"} • {item.size || "0 MB"}
                              </p>
                            </div>
                          </div>
                          
                          {/* File status badge */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {item.geminiFileUri ? (
                              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-md text-[9px] font-black uppercase tracking-widest border border-emerald-100">CLOUD OK</span>
                            ) : (
                              <span className="px-2.5 py-1 bg-amber-50 text-amber-600 rounded-md text-[9px] font-black uppercase tracking-widest border border-amber-100">TEXT ONLY</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                )}
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
                <div className="max-w-3xl mx-auto w-full py-12 px-5 space-y-8 animate-in fade-in duration-500">
                  {/* Central Welcome Header */}
                  <div className="text-center space-y-3 shrink-0">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center mx-auto text-white shadow-xl shadow-indigo-600/20">
                      <Sparkles className="w-7 h-7 fill-white/15 animate-pulse" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-wider">
                        Trợ lý Thẩm định TCVN/QCVN
                      </h3>
                      <p className="text-[10px] sm:text-xs text-indigo-600 font-extrabold uppercase tracking-widest">
                        StandardCloud AI Engine — Tìm kiếm Toàn diện
                      </p>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-500 leading-relaxed max-w-xl mx-auto font-medium">
                      Chào mừng bạn! Tôi là chuyên viên AI chuyên trách Tra cứu quốc gia quy chuẩn Việt Nam. Hệ thống tự động tìm kiếm trực tiếp và toàn diện trên TOÀN BỘ tư liệu kỹ thuật đã tải.
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
                    
                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          "flex flex-col rounded-3xl p-5 shadow-sm transition-all drop-shadow-sm/80 animate-in fade-in duration-300",
                          msg.role === "user"
                            ? "bg-indigo-600 text-white ml-auto max-w-[85%]"
                            : "bg-[#f8fafc] border border-gray-200/50 mr-auto w-full max-w-[100%]"
                        )}
                      >
                        {msg.image && (
                          <div className="mb-3 rounded-2xl overflow-hidden border border-white/20">
                            <img src={msg.image} alt="User upload" className="max-w-full h-auto object-cover max-h-60" />
                          </div>
                        )}
                        
                        {msg.role === "ai" && parsed && parsed.hasStructure ? (
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

                        {/* Actions Toolbar */}
                        <div className={cn(
                          "flex items-center gap-2 mt-3 pt-3 border-t justify-end shrink-0",
                          msg.role === "user" ? "border-indigo-500/30 text-indigo-100" : "border-gray-50 text-gray-400"
                        )}>
                          <button
                            onClick={() => handleDownloadText(msg.content, `cau_tra_loi_${msg.id.slice(0, 5)}.txt`)}
                            className={cn(
                              "flex items-center gap-1 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all cursor-pointer",
                              msg.role === "user"
                                ? "hover:bg-white/10 text-indigo-100 hover:text-white"
                                : "hover:bg-indigo-50 text-gray-400 hover:text-emerald-600 border border-transparent hover:border-emerald-100"
                            )}
                            title="Tải câu trả lời này về máy (.txt)"
                          >
                            <Download className="w-3 h-3" />
                            <span>TẢI VỀ</span>
                          </button>
                          {msg.role !== "user" && (
                            <button
                              onClick={() => triggerSummarize(msg.content)}
                              className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all cursor-pointer hover:bg-indigo-50 text-indigo-600 border border-transparent hover:border-indigo-100"
                              title="Tóm tắt ngắn gọn câu trả lời này bằng Gemini AI"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>TÓM TẮT AI</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleCopyText(msg.content, msg.id)}
                            className={cn(
                              "flex items-center gap-1 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all cursor-pointer",
                              msg.role === "user"
                                ? "hover:bg-white/10 text-indigo-100 hover:text-white"
                                : "hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 border border-transparent hover:border-indigo-100"
                            )}
                            title="Sao chép câu trả lời"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-500" />
                                <span className={msg.role === "user" ? "text-white" : "text-emerald-600"}>Đã copy</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Sao chép</span>
                              </>
                            )}
                          </button>

                          {msg.role === "ai" && (
                            <button
                              onClick={() => handleSaveMessageToNote(msg.content, msg.id)}
                              disabled={savingId === msg.id}
                              className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 border border-transparent hover:border-indigo-100 cursor-pointer"
                              title="Lưu vào sổ tay ghi chú"
                            >
                              {savingId === msg.id ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />
                                  <span>Đang lưu...</span>
                                </>
                              ) : savedIds.includes(msg.id) ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                  <span className="text-emerald-600">Đã lưu</span>
                                </>
                              ) : (
                                <>
                                  <Save className="w-3 h-3" />
                                  <span>Lưu ghi chú</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
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
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex flex-col rounded-3xl p-5 shadow-sm transition-all drop-shadow-sm/80 animate-in fade-in duration-300",
                      msg.role === "user"
                        ? "bg-indigo-600 text-white ml-auto max-w-[85%]"
                        : "bg-[#f8fafc] border border-gray-200/50 mr-auto w-full max-w-[100%]"
                    )}
                  >
                    {msg.image && (
                      <div className="mb-3 rounded-2xl overflow-hidden border border-white/20">
                        <img src={msg.image} alt="User upload" className="max-w-full h-auto object-cover max-h-60" />
                      </div>
                    )}
                    
                    {msg.role === "ai" && parsed && parsed.hasStructure ? (
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

                  {/* Actions Toolbar (Copy & Save to Note) */}
                  <div className={cn(
                    "flex items-center gap-2 mt-3 pt-3 border-t justify-end shrink-0",
                    msg.role === "user" ? "border-indigo-500/30 text-indigo-100" : "border-gray-50 text-gray-400"
                  )}>
                    <button
                      onClick={() => handleDownloadText(msg.content, `cau_tra_loi_${msg.id.slice(0, 5)}.txt`)}
                      className={cn(
                        "flex items-center gap-1 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all cursor-pointer",
                        msg.role === "user"
                          ? "hover:bg-white/10 text-indigo-100 hover:text-white"
                          : "hover:bg-indigo-50 text-gray-400 hover:text-emerald-600 border border-transparent hover:border-emerald-100"
                      )}
                      title="Tải câu trả lời này về máy (.txt)"
                    >
                      <Download className="w-3 h-3" />
                      <span>TẢI VỀ</span>
                    </button>
                    {msg.role !== "user" && (
                      <button
                        onClick={() => triggerSummarize(msg.content)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all cursor-pointer hover:bg-indigo-50 text-indigo-600 border border-transparent hover:border-indigo-100"
                        title="Tóm tắt ngắn gọn câu trả lời này bằng Gemini AI"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>TÓM TẮT AI</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleCopyText(msg.content, msg.id)}
                      className={cn(
                        "flex items-center gap-1 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all",
                        msg.role === "user"
                          ? "hover:bg-white/10 text-indigo-100 hover:text-white"
                          : "hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 border border-transparent hover:border-indigo-100"
                      )}
                      title="Sao chép câu trả lời"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-500" />
                          <span className={msg.role === "user" ? "text-white" : "text-emerald-600"}>Đã copy</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Sao chép</span>
                        </>
                      )}
                    </button>

                    {msg.role === "ai" && (
                      <button
                        onClick={() => handleSaveMessageToNote(msg.content, msg.id)}
                        disabled={savingId === msg.id}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 border border-transparent hover:border-indigo-100"
                        title="Lưu vào sổ tay ghi chú"
                      >
                        {savingId === msg.id ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />
                            <span>Đang lưu...</span>
                          </>
                        ) : savedIds.includes(msg.id) ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            <span className="text-emerald-600">Đã lưu</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-3 h-3" />
                            <span>Lưu ghi chú</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
                );
              })}
              {isProcessing && (
                <div className="flex items-center gap-2 text-gray-400 text-[10px] font-black uppercase tracking-widest italic ml-4">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                  Gemini đang suy nghĩ...
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
                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">
                    SỔ TAY GHI CHÚ
                  </h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">KNOWLEDGE NOTEBOOK</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {notes && notes.length > 0 ? (
                notes.map((note) => (
                  <div key={note.id} className="bg-white rounded-[32px] border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                    <div className="flex justify-between items-start mb-4">
                      <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                        📅 {new Date(note.createdAt).toLocaleString("vi-VN", { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleCopyText(note.content, note.id)}
                          className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                          title="Sao chép nội dung"
                        >
                          {copiedId === note.id ? (
                            <Check className="w-4 h-4 text-emerald-500 animate-bounce" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm("Bạn có chắc muốn xóa ghi chú này?")) {
                              if (onDeleteNote) {
                                await onDeleteNote(note.id);
                              }
                            }
                          }}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                          title="Xóa ghi chú"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="prose prose-sm prose-indigo max-w-none break-words font-medium leading-relaxed prose-table:border-collapse prose-table:border prose-table:border-gray-250 prose-th:bg-gray-50 prose-th:p-2 prose-td:p-2 prose-td:border prose-td:border-gray-250">
                      <ReactMarkdown
                        remarkPlugins={[remarkMath, remarkGfm]}
                        rehypePlugins={[rehypeKatex]}
                        components={customMarkdownComponents}
                      >
                        {convertCitationsToLinks(note.content)}
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
                    <p className="text-gray-400 text-[9px] uppercase tracking-widest mt-2 max-w-xs leading-relaxed">
                      Lưu trữ các câu trả lời kỹ thuật từ mục "Hỏi đáp" bằng nút <strong>"Lưu ghi chú"</strong>.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
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
        <div className={cn(
          "absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#f4f7fa] via-[#f4f7fa]/95 to-transparent pointer-events-none flex flex-col z-20 transition-all duration-300",
          isScrolled 
            ? "opacity-35 hover:opacity-100 focus-within:opacity-100" 
            : "opacity-100"
        )}>
          <div className="bg-white border border-gray-200 rounded-[24px] p-3 shadow-xl shadow-indigo-100/10 focus-within:ring-2 focus-within:ring-indigo-100 transition-all font-sans flex flex-col gap-2 pointer-events-auto">
            {selectedImage && (
              <div className="px-3 pt-1 flex flex-wrap gap-2 animate-in fade-in duration-200">
                <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-150 shadow-sm group">
                  <img src={selectedImage} alt="Selected" className="w-full h-full object-cover" />
                  <button 
                    onClick={removeSelectedImage}
                    className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <X className="w-2.5 h-2.5" />
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
              placeholder="Nhập câu hỏi kỹ thuật (Ví dụ: Quy định chiều dày lớp bê tông bảo vệ cốt thép dầm sàn hay khoảng cách an toàn PCCC, mật độ xây dựng)..."
              className="w-full bg-transparent border-none py-1.5 px-3 text-sm sm:text-base font-semibold focus:outline-none focus:ring-0 transition-all resize-none h-20 text-gray-800 placeholder:text-gray-400"
            />
            <div className="flex items-center justify-between px-2 pt-1 border-t border-gray-50">
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
                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all cursor-pointer"
                  title="Thêm hình ảnh"
                >
                  <Camera className="w-5 h-5" />
                </button>
                <span className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider">
                  🔍 Global Search
                </span>
              </div>
              <button
                onClick={handleSend}
                disabled={(!input.trim() && !selectedImage) || isProcessing}
                className="p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 text-white rounded-full shadow-lg shadow-indigo-600/15 transition-all cursor-pointer"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gemini Quick-Summarizer Assistant Modal */}
      {summarizingText !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
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
                          : "bg-white text-gray-500 hover:text-gray-900 border border-gray-100"
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
                    <p className="text-xs font-black text-gray-900 uppercase tracking-widest animate-pulse">Sử dụng Gemini 3.5 Flash...</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Đang bóc tách số liệu & làm gọn văn bản</p>
                  </div>
                </div>
              ) : summarizeError ? (
                <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-5 text-center space-y-2">
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

            <div className="flex gap-3 pt-4 border-t border-gray-100 shrink-0">
              <button 
                onClick={() => setSummarizingText(null)}
                className="flex-1 py-4 bg-gray-55 hover:bg-gray-100 text-gray-500 rounded-2xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer text-center"
              >
                Hủy bỏ
              </button>
              <button 
                disabled={isSummarizing || !summaryResult}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(summaryResult);
                    setCopiedSummary(true);
                    setTimeout(() => {
                      setCopiedSummary(false);
                      setSummarizingText(null);
                    }, 1200);
                  } catch (err) {
                    console.error(err);
                  }
                }}
                className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg hover:shadow-indigo-600/15 cursor-pointer flex items-center justify-center gap-2 animate-pulse-duration"
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
        </div>
      )}
    </div>
  );
}

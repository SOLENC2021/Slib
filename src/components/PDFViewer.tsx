import React, { useState, useEffect, useRef } from "react";
import { 
  Maximize2, Minimize2, Download, Search, Printer, 
  Share2, ChevronLeft, ChevronRight, X,
  FileText, AlertCircle, ExternalLink,
  ZoomIn, ZoomOut, Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PDFFile } from "@/types";
import * as pdfjs from "pdfjs-dist";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

// Helper to remove Vietnamese tones/diacritics for diacritic-insensitive search
function removeVietnameseTones(str: string): string {
  if (!str) return "";
  let res = str.normalize("NFD");
  // Remove combining diacritical marks
  res = res.replace(/[\u0300-\u036f]/g, "");
  // Replace remaining special Vietnamese letters
  res = res.replace(/đ/g, "d").replace(/Đ/g, "D");
  
  // Extra mapping in case of legacy composers
  res = res.replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, "a");
  res = res.replace(/[èéẹẻẽêềếệểễ]/g, "e");
  res = res.replace(/[ìíịỉĩ]/g, "i");
  res = res.replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, "o");
  res = res.replace(/[ùúụủũưừứựửữ]/g, "u");
  res = res.replace(/[ỳýỵỷỹ]/g, "y");
  
  res = res.replace(/[ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴ]/g, "A");
  res = res.replace(/[ÈÉẸẺẼÊỀẾỆỂỄ]/g, "E");
  res = res.replace(/[ÌÍỊỈĨ]/g, "I");
  res = res.replace(/[ÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠ]/g, "O");
  res = res.replace(/[ÙÚỤỦŨƯỪỨỰỬỮ]/g, "U");
  res = res.replace(/[ỲÝỴỶỸ]/g, "Y");
  
  return res;
}

// Highly robust Vietnamese & Unicode text match finder with spacing-insensitive mapping
function findMatchInText(fullText: string, query: string): { found: boolean; startIdx: number; matchedLength: number } {
  if (!fullText || !query) return { found: false, startIdx: -1, matchedLength: 0 };
  
  const normTextNFC = fullText.normalize("NFC");
  const normQueryNFC = query.normalize("NFC");
  
  // 1. Direct case-insensitive search (NFC)
  let idx = normTextNFC.toLowerCase().indexOf(normQueryNFC.toLowerCase());
  if (idx !== -1) {
    return { found: true, startIdx: idx, matchedLength: normQueryNFC.length };
  }
  
  // 2. Direct case-insensitive search (NFD)
  const normTextNFD = fullText.normalize("NFD");
  const normQueryNFD = query.normalize("NFD");
  idx = normTextNFD.toLowerCase().indexOf(normQueryNFD.toLowerCase());
  if (idx !== -1) {
    return { found: true, startIdx: idx, matchedLength: normQueryNFD.length };
  }

  // Helper to search and map coordinates ignoring spaces
  const matchIgnoringSpaces = (textStr: string, queryStr: string) => {
    const cleanQ = queryStr.replace(/\s+/g, "").toLowerCase();
    if (!cleanQ) return { startIdx: -1, matchedLength: 0 };
    
    const cleanT = textStr.toLowerCase();
    const indices: number[] = [];
    let cleanTextNoSpaces = "";
    
    for (let i = 0; i < cleanT.length; i++) {
      const char = cleanT[i];
      if (char !== " " && char !== "\t" && char !== "\n" && char !== "\r" && char !== "\xa0") {
        cleanTextNoSpaces += char;
        indices.push(i);
      }
    }
    
    const mIdx = cleanTextNoSpaces.indexOf(cleanQ);
    if (mIdx !== -1) {
      const origStart = indices[mIdx];
      const origEnd = indices[mIdx + cleanQ.length - 1];
      return {
        startIdx: origStart,
        matchedLength: origEnd - origStart + 1
      };
    }
    return { startIdx: -1, matchedLength: 0 };
  };

  // 3. Match ignoring arbitrary spacing (NFC)
  let spaceMatch = matchIgnoringSpaces(normTextNFC, normQueryNFC);
  if (spaceMatch.startIdx !== -1) {
    return { found: true, startIdx: spaceMatch.startIdx, matchedLength: spaceMatch.matchedLength };
  }
  
  // 4. Match ignoring arbitrary spacing (NFD)
  spaceMatch = matchIgnoringSpaces(normTextNFD, normQueryNFD);
  if (spaceMatch.startIdx !== -1) {
    return { found: true, startIdx: spaceMatch.startIdx, matchedLength: spaceMatch.matchedLength };
  }

  // 5. Fallback to unaccented (diacritic-insensitive) match
  const unaccentedText = removeVietnameseTones(normTextNFC);
  const unaccentedQuery = removeVietnameseTones(normQueryNFC);

  idx = unaccentedText.toLowerCase().indexOf(unaccentedQuery.toLowerCase());
  if (idx !== -1) {
    return { found: true, startIdx: idx, matchedLength: unaccentedQuery.length };
  }

  // 6. Fallback to unaccented spacing-insensitive match
  spaceMatch = matchIgnoringSpaces(unaccentedText, unaccentedQuery);
  if (spaceMatch.startIdx !== -1) {
    return { found: true, startIdx: spaceMatch.startIdx, matchedLength: spaceMatch.matchedLength };
  }

  return { found: false, startIdx: -1, matchedLength: 0 };
}

// Parses pages from continuous text structured with page markers
function parsePagesFromText(text: string): { [pageNo: number]: string } {
  const pages: { [pageNo: number]: string } = {};
  if (!text) return pages;

  const regex = /---\s*\[B\s*Ắ\s*T\s*Đ\s*Ầ\s*U\s*T\s*R\s*A\s*N\s*G\s+(\d+)\]\s*---/gi;
  // Support both accented and normalized letters in markers
  const cleanRegex = /---\s*\[BẮT ĐẦU TRANG\s+(\d+)\]\s*---/gi;
  
  let match;
  const matches: { pageNum: number; index: number; headerLength: number }[] = [];
  
  // Try clean regex first, then soft if needed
  while ((match = cleanRegex.exec(text)) !== null) {
    matches.push({
      pageNum: parseInt(match[1], 10),
      index: match.index,
      headerLength: match[0].length
    });
  }

  if (matches.length === 0) {
    const rawRegex = /---\s*\[B\s*A\s*T\s*D\s*A\s*U\s*T\s*R\s*A\s*N\s*G\s+(\d+)\]\s*---/gi;
    while ((match = rawRegex.exec(text)) !== null) {
      matches.push({
        pageNum: parseInt(match[1], 10),
        index: match.index,
        headerLength: match[0].length
      });
    }
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
    pageText = pageText.replace(/---\s*\[KET THUC TRANG\s+\d+\]\s*---/gi, "");
    
    pages[current.pageNum] = pageText.trim();
  }

  return pages;
}

interface PDFViewerProps {
  file: PDFFile | null;
  onPageChange?: (pageNumber: number) => void;
  targetPage?: number | null;
  onClearTargetPage?: () => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  onClose?: () => void;
}

export function PDFViewer({ 
  file, 
  onPageChange, 
  targetPage, 
  onClearTargetPage,
  isMaximized = false,
  onToggleMaximize,
  onClose
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState<string>("1");
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renderedPages, setRenderedPages] = useState<number[]>([]);
  const pdfDocRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync typed input with current observer page
  useEffect(() => {
    setPageInput(currentPage.toString());
  }, [currentPage]);

  const handleJumpToPage = (pageNumStr: string) => {
    const pageNum = parseInt(pageNumStr, 10);
    const maxPages = numPages || (file ? file.numpages : 1) || 1;
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= maxPages) {
      const el = document.querySelector(`[data-page="${pageNum}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        setCurrentPage(pageNum);
      }
    } else {
      setPageInput(currentPage.toString());
    }
  };

  const [pageTexts, setPageTexts] = useState<{ [page: number]: string }>({});
  const [parentPageTexts, setParentPageTexts] = useState<{ [page: number]: string }>({});
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ page: number; text: string }[]>([]);
  const [currentResultIdx, setCurrentResultIdx] = useState(-1);
  const [isIndexing, setIsIndexing] = useState(false);

  // Sync document text from the parent component (Gemini OCR / pdf-parse processed)
  useEffect(() => {
    if (file && file.text) {
      const parsed = parsePagesFromText(file.text);
      setParentPageTexts(parsed);
    } else {
      setParentPageTexts({});
    }
  }, [file?.text, file?.id]);

  // Background text extraction utilizing newly loaded state pdfDoc
  useEffect(() => {
    if (pdfDoc) {
      setPageTexts({});
      setSearchResults([]);
      setCurrentResultIdx(-1);
      setSearchQuery("");
      setIsSearchOpen(false);
      
      const extractAll = async () => {
        setIsIndexing(true);
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          try {
            const page = await pdfDoc.getPage(i);
            const txtContent = await page.getTextContent();
            
            // Map str carefully to avoid undefined errors
            const pageText = txtContent.items
              .map((item: any) => (item && typeof item.str === "string") ? item.str : "")
              .join(" ");
            
            // Incremental page texting allows instant searching as loading goes!
            setPageTexts((prev) => ({
              ...prev,
              [i]: pageText,
            }));
          } catch (err) {
            console.error("Lỗi trích xuất chữ trang " + i, err);
          }
        }
        setIsIndexing(false);
      };
      
      extractAll();
    } else {
      setPageTexts({});
      setSearchResults([]);
      setCurrentResultIdx(-1);
      setSearchQuery("");
      setIsSearchOpen(false);
    }
  }, [pdfDoc]);

  // Reactive Search Effect that recalculates matching pages as pageTexts are indexed or searchQuery is changed
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setCurrentResultIdx(-1);
      return;
    }

    const matches: { page: number; text: string }[] = [];
    const total = numPages || file?.numpages || 0;
    
    for (let p = 1; p <= total; p++) {
      const localText = pageTexts[p] || "";
      const parentText = parentPageTexts[p] || "";
      
      const localMatch = findMatchInText(localText, searchQuery);
      const parentMatch = findMatchInText(parentText, searchQuery);
      
      if (localMatch.found) {
        const start = Math.max(0, localMatch.startIdx - 30);
        const end = Math.min(localText.length, localMatch.startIdx + localMatch.matchedLength + 30);
        const snippet = localText.substring(start, end).replace(/\s+/g, " ").trim();
        matches.push({
          page: p,
          text: `...${snippet}...`
        });
      } else if (parentMatch.found) {
        const start = Math.max(0, parentMatch.startIdx - 30);
        const end = Math.min(parentText.length, parentMatch.startIdx + parentMatch.matchedLength + 30);
        const snippet = parentText.substring(start, end).replace(/\s+/g, " ").trim();
        matches.push({
          page: p,
          text: `...${snippet}...`
        });
      }
    }
    
    setSearchResults(matches);
    
    if (matches.length > 0) {
      if (currentResultIdx === -1 || currentResultIdx >= matches.length) {
        setCurrentResultIdx(0);
      }
    } else {
      setCurrentResultIdx(-1);
    }
  }, [pageTexts, parentPageTexts, searchQuery, numPages, file?.numpages]);

  // Keep track of the last searched query to avoid repeated scrolls when pages load incrementally
  const lastScrollQueryRef = useRef("");

  useEffect(() => {
    if (searchResults.length > 0 && searchQuery !== lastScrollQueryRef.current) {
      lastScrollQueryRef.current = searchQuery;
      setCurrentResultIdx(0);
      const firstMatchPage = searchResults[0].page;
      setTimeout(() => {
        const el = document.querySelector(`[data-page="${firstMatchPage}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          el.classList.add("ring-8", "ring-indigo-500/40", "ring-offset-2");
          setTimeout(() => {
            el.classList.remove("ring-8", "ring-indigo-500/40", "ring-offset-2");
          }, 2000);
        }
      }, 50);
    } else if (searchResults.length === 0) {
      lastScrollQueryRef.current = "";
    }
  }, [searchResults, searchQuery]);

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
  };

  const goToNextResult = () => {
    if (searchResults.length === 0) return;
    const nextIdx = (currentResultIdx + 1) % searchResults.length;
    setCurrentResultIdx(nextIdx);
    const pageNo = searchResults[nextIdx].page;
    const el = document.querySelector(`[data-page="${pageNo}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("ring-8", "ring-indigo-500/40", "ring-offset-2");
      setTimeout(() => {
        el.classList.remove("ring-8", "ring-indigo-500/40", "ring-offset-2");
      }, 2000);
    }
  };

  const goToPrevResult = () => {
    if (searchResults.length === 0) return;
    const prevIdx = (currentResultIdx - 1 + searchResults.length) % searchResults.length;
    setCurrentResultIdx(prevIdx);
    const pageNo = searchResults[prevIdx].page;
    const el = document.querySelector(`[data-page="${pageNo}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("ring-8", "ring-indigo-500/40", "ring-offset-2");
      setTimeout(() => {
        el.classList.remove("ring-8", "ring-indigo-500/40", "ring-offset-2");
      }, 2000);
    }
  };

  // Scroll to target page when it is rendered or targetPage prop changes
  useEffect(() => {
    if (targetPage && renderedPages.includes(targetPage)) {
      const triggerScroll = () => {
        const el = document.querySelector(`[data-page="${targetPage}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          el.classList.add("ring-8", "ring-indigo-500/50", "ring-offset-2", "transition-all", "duration-500");
          setTimeout(() => {
            el.classList.remove("ring-8", "ring-indigo-500/50", "ring-offset-2");
          }, 2500);
          if (onClearTargetPage) {
            onClearTargetPage();
          }
        }
      };

      // Give a brief delay for any layout paints to settle
      const timeoutId = setTimeout(triggerScroll, 150);
      return () => clearTimeout(timeoutId);
    }
  }, [targetPage, renderedPages, onClearTargetPage]);

  // Track page intersection to update current page number
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNo = Number(entry.target.getAttribute("data-page"));
            if (pageNo) {
              setCurrentPage(pageNo);
              if (onPageChange) onPageChange(pageNo);
            }
          }
        });
      },
      {
        root: containerRef.current,
        threshold: 0.5,
      }
    );

    const elements = document.querySelectorAll("[data-page]");
    elements.forEach((el) => observer.observe(el));

    return () => {
      elements.forEach((el) => observer.unobserve(el));
      observer.disconnect();
    };
  }, [renderedPages]);

  useEffect(() => {
    if (file?.url) {
      loadPDF(file.url);
    } else {
      setPdfDoc(null);
      pdfDocRef.current = null;
    }
  }, [file?.url]);

  const loadPDF = async (url: string) => {
    setLoading(true);
    setLoadError(null);
    setRenderedPages([]);
    
    try {
      const loadingTask = pdfjs.getDocument(url);
      const pdf = await loadingTask.promise;
      pdfDocRef.current = pdf;
      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
      
      const pages = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
      setRenderedPages(pages);
    } catch (error: any) {
      console.error("PDF.js loading error:", error);
      setLoadError(error.message || "Không thể tải tài liệu");
    } finally {
      setLoading(false);
    }
  };

  if (!file) {
    return (
      <div className="flex-1 h-full bg-[#1c1f26] rounded-[28px] flex items-center justify-center p-8 text-center border border-slate-800 shadow-[0_24px_55px_rgba(0,0,0,0.12)]">
        <div className="max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="w-24 h-24 bg-gray-800/50 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-2xl ring-1 ring-white/5">
            <Search className="w-10 h-10 text-indigo-500" />
          </div>
          <h2 className="text-xl font-black text-white uppercase tracking-[0.2em]">Chọn tài liệu công trình</h2>
          <p className="text-gray-500 mt-4 text-sm font-bold leading-relaxed uppercase tracking-wider opacity-60">
            Duyệt thư viện và chọn bản vẽ<br/>để bắt đầu tra cứu kỹ thuật
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full flex flex-col bg-[#111318] rounded-[28px] overflow-hidden border border-slate-800/80 shadow-[0_30px_70px_rgba(0,0,0,0.22),0_4px_10px_rgba(0,0,0,0.1)] relative">
      {/* Top Toolbar (Matching the UI Image) */}
      <div className="h-16 bg-[#1a1d26] border-b border-white/5 flex items-center justify-between px-6 shrink-0 z-20">
        <div 
          onClick={onToggleMaximize}
          className="flex items-center gap-4 cursor-pointer hover:bg-white/5 px-3 py-1.5 rounded-2xl transition-all"
          title="Click to Phóng to / Thu nhỏ khu vực đọc PDF"
        >
          <div className="w-10 h-10 bg-indigo-600/20 rounded-xl flex items-center justify-center border border-indigo-500/30">
            <FileText className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="hidden md:block">
            <h2 className="text-[14px] font-black text-white uppercase tracking-widest truncate max-w-[300px]">
              {file.name}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 px-5 py-2 bg-black/20 rounded-2xl border border-white/5 shadow-inner">
            {isSearchOpen ? (
              <div className="flex items-center gap-2.5 animate-in fade-in zoom-in-95 duration-200">
                <Search className="w-4 h-4 text-indigo-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Tìm từ khóa..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="bg-black/30 text-white placeholder-gray-500 text-xs px-2.5 py-1 border border-white/10 rounded-xl focus:outline-none focus:border-indigo-500 w-36 sm:w-48 transition-all"
                  autoFocus
                />
                
                {searchResults.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-bold tracking-wider shrink-0 bg-white/5 px-2 py-1 rounded-lg border border-white/5">
                    <span>{currentResultIdx + 1}/{searchResults.length}</span>
                    <button 
                      onClick={goToPrevResult}
                      className="p-1 hover:bg-white/15 hover:text-white rounded-lg transition-all"
                      title="Kết quả trước"
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </button>
                    <button 
                      onClick={goToNextResult}
                      className="p-1 hover:bg-white/15 hover:text-white rounded-lg transition-all"
                      title="Kết quả tiếp theo"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
                
                {searchQuery && searchResults.length === 0 && !isIndexing && (
                  <span className="text-[10px] text-rose-400 font-black uppercase tracking-wider shrink-0 bg-rose-500/10 px-2 py-1 rounded-lg border border-rose-500/20">Không thấy</span>
                )}

                {isIndexing && (
                  <span className="text-[10px] text-indigo-400 font-black uppercase tracking-wider shrink-0 animate-pulse">Đang nạp...</span>
                )}

                <button 
                  onClick={() => {
                    setIsSearchOpen(false);
                    setSearchQuery("");
                    setSearchResults([]);
                    setCurrentResultIdx(-1);
                  }}
                  className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                  title="Đóng tìm kiếm"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setIsSearchOpen(true)}
                className="text-gray-400 hover:text-indigo-400 transition-all flex items-center gap-1.5 group cursor-pointer"
                title="Bật tính năng tìm kiếm từ khóa trong tài liệu này"
              >
                <Search className="w-4 h-4 transition-transform group-hover:scale-110" />
                <span className="text-[10px] font-black uppercase tracking-widest hidden md:inline opacity-70 group-hover:opacity-100">Tìm kiếm</span>
              </button>
            )}

            <div className="h-4 w-[1px] bg-white/10 shrink-0" />
            
            <div className="flex items-center gap-4 shrink-0">
              <button onClick={() => setScale(s => Math.max(0.2, s - 0.1))} className="text-gray-400 hover:text-white transition-colors" title="Thu nhỏ"><ZoomOut className="w-5 h-5" /></button>
              <div className="text-[12px] font-black text-indigo-400 bg-indigo-500/10 px-4 py-1.5 rounded-lg border border-indigo-500/20 min-w-[70px] text-center">
                {Math.round(scale * 100)}%
              </div>
              <button onClick={() => setScale(s => s + 0.1)} className="text-gray-400 hover:text-white transition-colors" title="Phóng to"><ZoomIn className="w-5 h-5" /></button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {onToggleMaximize && (
            <button 
              onClick={onToggleMaximize}
              className={cn(
                "p-2 py-1.5 px-3.5 rounded-xl border transition-all flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest cursor-pointer shadow-sm active:scale-95",
                isMaximized 
                  ? "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20 hover:bg-indigo-500" 
                  : "bg-white/5 text-indigo-300 border-white/10 hover:bg-white/10 hover:text-white"
              )}
              title={isMaximized ? "Thu nhỏ giao diện chính" : "Phóng to khu vực đọc PDF"}
            >
              {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span>{isMaximized ? "THU NHỎ" : "PHÓNG TO"}</span>
            </button>
          )}

          <div className="hidden lg:flex items-center px-4 py-2 bg-black/20 rounded-xl border border-white/5 text-[10px] font-black text-gray-400 uppercase tracking-widest gap-2">
            <FileText className="w-3.5 h-3.5" />
            {numPages || file.numpages} TRANG
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2.5 bg-white/5 text-gray-400 hover:text-white rounded-xl border border-white/5 transition-all">
              <Download className="w-4 h-4" />
            </button>
            <button className="p-2.5 bg-white/5 text-gray-400 hover:text-white rounded-xl border border-white/5 transition-all">
              <Printer className="w-4 h-4" />
            </button>
          </div>
          <button className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-[10px] tracking-widest uppercase shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition-all">
            <Share2 className="w-4 h-4" />
            CHIA SẺ
          </button>
          {onClose && (
            <button 
              onClick={onClose}
              className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-black text-[10px] tracking-widest uppercase shadow-lg shadow-rose-600/20 transition-all active:scale-95 cursor-pointer"
              title="Đóng trình đọc PDF"
            >
              <X className="w-4 h-4" />
              ĐÓNG
            </button>
          )}
        </div>
      </div>

      {/* Floating Page Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
        <div className="bg-slate-900/40 hover:bg-slate-900/80 backdrop-blur-md px-5 py-2.5 rounded-full border border-white/5 hover:border-white/15 shadow-2xl flex items-center gap-3.5 pointer-events-auto transform transition-all duration-300 hover:scale-[1.02] hover:shadow-indigo-500/10">
          <button 
            onClick={() => {
              const el = document.querySelector(`[data-page="${currentPage - 1}"]`);
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            disabled={currentPage <= 1}
            className="text-white hover:text-indigo-450 disabled:opacity-30 p-1 cursor-pointer transition-colors"
            title="Trang trước"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <div className="text-[12px] font-black text-white uppercase tracking-widest flex items-center gap-1.5 min-w-[130px] justify-center select-none">
            <span className="opacity-80">TRANG</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pageInput}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, "");
                setPageInput(val);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleJumpToPage(pageInput);
                  e.currentTarget.blur();
                }
              }}
              onBlur={() => {
                handleJumpToPage(pageInput);
              }}
              className="w-12 h-6.5 text-center font-black bg-white/10 hover:bg-white/20 focus:bg-white/25 text-white border border-white/10 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-450/40 rounded-lg transition-all text-xs outline-none focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              title="Nhập số trang và nhấn Enter"
            />
            <span className="opacity-30">/</span>
            <span className="opacity-80">{numPages || file.numpages}</span>
          </div>

          <button 
            onClick={() => {
              const el = document.querySelector(`[data-page="${currentPage + 1}"]`);
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            disabled={currentPage >= (numPages || Infinity)}
            className="text-white hover:text-indigo-450 disabled:opacity-30 p-1 cursor-pointer transition-colors"
            title="Trang sau"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Vertical Scroll Area */}
      <div className="flex-1 relative bg-[#1e222d] overflow-y-auto no-scrollbar scroll-smooth p-12 flex flex-col items-center gap-16" ref={containerRef}>
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1e222d] z-50">
            <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
            <p className="text-white font-black text-xs uppercase tracking-widest">Đang tải tài liệu...</p>
          </div>
        )}

        {loadError ? (
          <div className="flex-1 flex flex-col items-center justify-center text-white p-6 sm:p-12 text-center h-full w-full max-w-2xl mx-auto">
            <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500 mb-6 border border-red-500/20">
              <AlertCircle className="w-8 h-8" />
            </div>
            
            <h3 className="text-lg font-black uppercase tracking-widest text-red-400 mb-2">
              Lỗi tải tài liệu PDF
            </h3>

            {loadError.includes("402") ? (
              <div className="bg-slate-900/60 border border-red-500/30 rounded-3xl p-6 text-left space-y-4 mb-8 shadow-lg max-w-xl">
                <div className="flex items-center gap-2 pb-2 border-b border-white/5">
                  <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-xs font-black uppercase tracking-widest text-red-400">
                    Sự Cố Thanh Toán Firebase (Lỗi 402)
                  </span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  Đường dẫn tài liệu trả về mã lỗi <strong>HTTP 402 - Payment Required</strong>. Điều này có nghĩa là dự án Firebase/Google Cloud liên kết (tên miền phụ: <code className="bg-black/30 px-1.5 py-0.5 rounded font-mono text-amber-300 text-[11px]">thuviennoibo</code>) đang gặp vấn đề:
                </p>
                <ul className="text-[11px] text-gray-400 list-disc pl-5 space-y-1">
                  <li>Đã vượt quá hạn ngạch băng thông (bandwidth limits) hoặc dung lượng tải của gói miễn phí Spark.</li>
                  <li>Tài khoản Google Cloud liên quan bị tạm khóa do hết hạn phương thức thanh toán hoặc thiếu thẻ thanh toán hợp lệ.</li>
                </ul>
                <div className="pt-2 text-[11px] text-amber-400/90 font-bold">
                  💡 Hướng dẫn xử lý: Quản lý hoặc Quản trị viên cần đăng nhập vào trang quản trị <strong>Firebase Console</strong> của dự án, kiểm tra mục <em>"Usage & Billing"</em> để nâng cấp gói hoặc cập nhật thông tin hóa đơn.
                </div>
              </div>
            ) : (
              <p className="text-gray-400 text-sm max-w-sm mb-8">{loadError}</p>
            )}

            <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
              <button 
                onClick={() => loadPDF(file.url)} 
                className="px-6 py-3 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all cursor-pointer shadow-md active:scale-95"
              >
                Thử tải lại
              </button>
              
              <a 
                href={file.url} 
                target="_blank" 
                rel="noopener noreferrer" 
                referrerPolicy="no-referrer"
                className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white border border-white/10 rounded-xl font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-95"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Mở trong tab mới
              </a>

              <a 
                href={file.url} 
                download={file.name}
                target="_blank" 
                rel="noopener noreferrer" 
                referrerPolicy="no-referrer"
                className="px-6 py-3 bg-[#0d9488]/90 hover:bg-[#0d9488] text-white border border-[#0d9488]/35 rounded-xl font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                Tải tệp tin
              </a>
            </div>
          </div>
        ) : (
          renderedPages.map(pageNo => (
            <PDFPage 
              key={`${file.id}-page-${pageNo}`} 
              pdfDoc={pdfDocRef.current} 
              pageNo={pageNo} 
              scale={scale} 
            />
          ))
        )}
      </div>
    </div>
  );
}

// Helper component for individual page rendering
function PDFPage({ pdfDoc, pageNo, scale }: { pdfDoc: any, pageNo: number, scale: number }) {
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [rendered, setRendered] = useState(false);
  const renderTaskRef = useRef<any>(null);

  // Use IntersectionObserver to lazy load/render pages
  useEffect(() => {
    // Proactively show the first 2 pages immediately for instant visual feedback on document select
    if (pageNo <= 2) {
      setIsVisible(true);
      return;
    }

    const scrollContainer = pageRef.current?.closest(".overflow-y-auto") || null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); // Once matched and rendered, preserve the canvas to prevent scrolling flicker
        }
      },
      {
        root: scrollContainer, // Match relative to the actual scrollable container
        rootMargin: "800px 0px", // Pre-fetch pages up to 800px before they enter view
        threshold: 0.01,
      }
    );

    if (pageRef.current) {
      observer.observe(pageRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [pageNo]);

  useEffect(() => {
    let isMounted = true;
    
    const render = async () => {
      if (!pdfDoc || !canvasRef.current || !isVisible) return;
      
      try {
        // Cancel existing task if it exists
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        const page = await pdfDoc.getPage(pageNo);
        if (!isMounted || !canvasRef.current) return;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        
        if (!context || !isMounted) return;
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        const renderTask = page.render({
          canvasContext: context,
          viewport: viewport
        });
        
        renderTaskRef.current = renderTask;
        
        await renderTask.promise;
        
        if (isMounted) {
          setRendered(true);
          renderTaskRef.current = null;
        }
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          console.error("Page render error:", err);
        }
      }
    };
    
    render();

    return () => {
      isMounted = false;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [pdfDoc, pageNo, scale, isVisible]);

  const estimatedHeight = scale * 850;

  return (
    <div 
      ref={pageRef}
      data-page={pageNo}
      className="relative group transition-all duration-500"
      style={{ minHeight: rendered ? undefined : `${estimatedHeight}px` }}
    >
      {/* Page Content */}
      <div className="shadow-[0_32px_128px_-16px_rgba(0,0,0,0.6)] rounded-sm bg-white overflow-hidden transition-all duration-300 ring-1 ring-black/5">
        <canvas ref={canvasRef} className="max-w-full h-auto block" style={{ display: rendered ? "block" : "none" }} />
        
        {!rendered && (
          <div className="w-full bg-[#1b1c22] flex flex-col items-center justify-center p-20" style={{ height: estimatedHeight }}>
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Đang kết xuất trang {pageNo}...</p>
          </div>
        )}
      </div>

      {/* Page Number Label (Side) */}
      <div className="absolute -right-24 top-0 h-full hidden xl:flex items-start pointer-events-none">
        <div className="sticky top-10 flex flex-col items-center">
          <div className="w-[2px] h-20 bg-indigo-500/10 rounded-full mb-4" />
          <span className="text-[12px] font-black text-indigo-500/40 vertical-text py-6 px-3 bg-indigo-500/5 rounded-full border border-indigo-500/10 uppercase tracking-widest">
            PG.{pageNo.toString().padStart(2, '0')}
          </span>
        </div>
      </div>
    </div>
  );
}


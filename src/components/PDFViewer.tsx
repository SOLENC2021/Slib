import React, { useState, useEffect, useRef } from "react";
import { 
  Maximize2, Download, Search, Printer, 
  Share2, ChevronLeft, ChevronRight, X,
  FileText, AlertCircle, ExternalLink,
  ZoomIn, ZoomOut, Loader2
} from "lucide-react";
import { PDFFile } from "@/types";
import * as pdfjs from "pdfjs-dist";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

interface PDFViewerProps {
  file: PDFFile | null;
  onPageChange?: (pageNumber: number) => void;
}

export function PDFViewer({ file, onPageChange }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renderedPages, setRenderedPages] = useState<number[]>([]);
  const pdfDocRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
      <div className="flex-1 h-full bg-[#1e222d] rounded-[24px] flex items-center justify-center p-8 text-center border border-gray-800/50">
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
    <div className="flex-1 h-full flex flex-col bg-[#111318] rounded-[24px] overflow-hidden border border-white/5 shadow-2xl relative">
      {/* Top Toolbar (Matching the UI Image) */}
      <div className="h-16 bg-[#1a1d26] border-b border-white/5 flex items-center justify-between px-6 shrink-0 z-20">
        <div className="flex items-center gap-4">
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
          <div className="flex items-center gap-6 px-6 py-2 bg-black/20 rounded-2xl border border-white/5 shadow-inner">
            <button className="text-gray-500 hover:text-white transition-colors group">
              <Search className="w-4 h-4" />
            </button>
            <div className="h-4 w-[1px] bg-white/10" />
            <div className="flex items-center gap-4">
              <button onClick={() => setScale(s => Math.max(0.2, s - 0.1))} className="text-gray-500 hover:text-white"><ZoomOut className="w-5 h-5" /></button>
              <div className="text-[12px] font-black text-indigo-400 bg-indigo-500/10 px-4 py-1.5 rounded-lg border border-indigo-500/20 min-w-[70px] text-center">
                {Math.round(scale * 100)}%
              </div>
              <button onClick={() => setScale(s => s + 0.1)} className="text-gray-500 hover:text-white"><ZoomIn className="w-5 h-5" /></button>
            </div>
            <div className="h-4 w-[1px] bg-white/10" />
            <Search className="w-4 h-4 text-gray-500" />
          </div>
        </div>

        <div className="flex items-center gap-3">
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
        </div>
      </div>

      {/* Floating Page Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
        <div className="bg-black/80 backdrop-blur-md px-6 py-3 rounded-full border border-white/10 shadow-2xl flex items-center gap-4 pointer-events-auto">
          <button 
            onClick={() => {
              const el = document.querySelector(`[data-page="${currentPage - 1}"]`);
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            disabled={currentPage <= 1}
            className="text-white disabled:opacity-30 p-1"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-[13px] font-black text-white uppercase tracking-widest min-w-[100px] text-center">
             TRANG {currentPage} / {numPages || file.numpages}
          </div>
          <button 
            onClick={() => {
              const el = document.querySelector(`[data-page="${currentPage + 1}"]`);
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            disabled={currentPage >= (numPages || Infinity)}
            className="text-white disabled:opacity-30 p-1"
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
          <div className="flex-1 flex flex-col items-center justify-center text-white p-12 text-center h-full w-full">
            <AlertCircle className="w-12 h-12 text-red-500 mb-6" />
            <h3 className="text-xl font-black uppercase tracking-widest mb-4">Lỗi tải PDF</h3>
            <p className="text-gray-500 text-sm max-w-sm font-bold mb-8">{loadError}</p>
            <button onClick={() => loadPDF(file.url)} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest">Thử lại</button>
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;
    
    const render = async () => {
      if (!pdfDoc || !canvasRef.current) return;
      
      try {
        // Cancel existing task if it exists
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        const page = await pdfDoc.getPage(pageNo);
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
  }, [pdfDoc, pageNo, scale]);

  return (
    <div 
      data-page={pageNo}
      className="relative group transition-all duration-500"
    >
      {/* Page Content */}
      <div className="shadow-[0_32px_128px_-16px_rgba(0,0,0,0.6)] rounded-sm bg-white overflow-hidden transition-all duration-300 ring-1 ring-black/5">
        <canvas ref={canvasRef} className="max-w-full h-auto block" />
        
        {!rendered && (
          <div className="w-full bg-white flex flex-col items-center justify-center p-20" style={{ height: 800 }}>
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Đang kết xuất bản vẽ...</p>
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


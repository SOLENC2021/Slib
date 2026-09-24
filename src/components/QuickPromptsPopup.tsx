import React, { useState, useRef, useEffect } from "react";
import { Sparkles, Lightbulb, X, ArrowRight, CornerDownLeft, Edit2, ChevronRight, Check } from "lucide-react";
import { PDFFile } from "@/types";
import { getQuickPromptsForFile, QuickPrompt } from "@/lib/quickPrompts";
import { cn } from "@/lib/utils";

interface QuickPromptsPopupProps {
  file: PDFFile | null;
  onExecutePrompt: (prompt: string, autoSend?: boolean) => void;
  isProcessing?: boolean;
  className?: string;
}

export default function QuickPromptsPopup({
  file,
  onExecutePrompt,
  isProcessing = false,
  className
}: QuickPromptsPopupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const prompts = React.useMemo(() => getQuickPromptsForFile(file), [file]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popupRef.current && 
        !popupRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleSelect = (promptText: string, autoSend: boolean = true) => {
    onExecutePrompt(promptText, autoSend);
    setIsOpen(false);
  };

  return (
    <div className={cn("relative inline-block", className)}>
      {/* Trigger Button - Sits cleanly in the bottom-left toolbar */}
      <button
        ref={buttonRef}
        type="button"
        disabled={isProcessing}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "px-2.5 py-1.5 rounded-xl font-extrabold text-[11px] transition-all flex items-center gap-1.5 cursor-pointer shadow-3xs border",
          isOpen
            ? "bg-amber-500 text-white border-amber-600 shadow-amber-500/20"
            : "bg-amber-50 hover:bg-amber-100/80 text-amber-800 hover:text-amber-900 border-amber-200/80"
        )}
        title="Gợi ý câu hỏi nhanh (Quick Prompts)"
      >
        <Lightbulb className={cn("w-3.5 h-3.5", isOpen ? "fill-white text-white" : "text-amber-600 fill-amber-500/20 animate-pulse")} />
        <span className="tracking-wide">Gợi ý</span>
        <span className="text-[9px] px-1 py-0.2 rounded-full font-black bg-amber-200/70 text-amber-900">
          {prompts.length}
        </span>
      </button>

      {/* Floating Popup Panel positioned above the trigger button */}
      {isOpen && (
        <div
          ref={popupRef}
          className="absolute bottom-full left-0 mb-2 w-[340px] sm:w-[420px] max-w-[90vw] bg-white rounded-2xl shadow-2xl border border-gray-200 p-0 z-50 animate-in fade-in zoom-in-95 duration-150 overflow-hidden"
          style={{ maxHeight: "calc(100vh - 220px)" }}
        >
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-amber-50 via-indigo-50/50 to-white border-b border-gray-150 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center shadow-sm">
                <Lightbulb className="w-4 h-4 fill-white" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <span>Gợi ý câu lệnh nhanh</span>
                  <span className="text-[9px] font-extrabold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">
                    {file ? "Theo tệp" : "Chung"}
                  </span>
                </h4>
                <p className="text-[10px] text-gray-500 font-medium">
                  {file ? `Được cá nhân hóa cho "${file.name}"` : "Các câu hỏi tiêu chuẩn phổ biến"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              title="Đóng popup"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Prompts List */}
          <div className="p-2 space-y-1.5 max-h-[360px] overflow-y-auto overscroll-contain">
            {prompts.map((item) => (
              <div
                key={item.id}
                className="group relative p-2.5 rounded-xl border border-gray-100 hover:border-amber-200/80 bg-white hover:bg-amber-50/40 transition-all flex flex-col gap-1.5 text-left shadow-3xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base shrink-0">{item.icon}</span>
                    <span className="text-xs font-black text-slate-800 group-hover:text-amber-950 truncate">
                      {item.label}
                    </span>
                  </div>
                  {item.badge && (
                    <span className="text-[8.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 group-hover:bg-amber-100 text-gray-600 group-hover:text-amber-800 shrink-0">
                      {item.badge}
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-gray-500 group-hover:text-gray-700 font-medium leading-relaxed line-clamp-2">
                  {item.prompt}
                </p>

                <div className="flex items-center justify-between pt-1 border-t border-gray-100/70 text-[10px]">
                  <span className="text-gray-400 text-[9.5px]">
                    {item.description}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleSelect(item.prompt, false)}
                      className="px-2 py-1 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Chèn vào ô nhập để sửa"
                    >
                      <Edit2 className="w-2.5 h-2.5" />
                      <span>Chèn</span>
                    </button>
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handleSelect(item.prompt, true)}
                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-black flex items-center gap-1 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                      title="Gửi ngay câu hỏi này"
                    >
                      <span>Hỏi ngay</span>
                      <CornerDownLeft className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer note */}
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400 font-semibold flex items-center justify-between">
            <span>💡 Nhấp &quot;Hỏi ngay&quot; để gửi lập tức</span>
            <span className="text-[9px]">Nhấn Esc để đóng</span>
          </div>
        </div>
      )}
    </div>
  );
}

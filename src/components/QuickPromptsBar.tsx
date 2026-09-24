import React from "react";
import { Sparkles, ArrowRight, CornerDownLeft, Edit2 } from "lucide-react";
import { PDFFile } from "@/types";
import { getQuickPromptsForFile, QuickPrompt } from "@/lib/quickPrompts";
import { cn } from "@/lib/utils";

interface QuickPromptsBarProps {
  file: PDFFile | null;
  onExecutePrompt: (prompt: string, autoSend?: boolean) => void;
  isProcessing?: boolean;
  className?: string;
  variant?: "bar" | "grid" | "compact";
}

export default function QuickPromptsBar({
  file,
  onExecutePrompt,
  isProcessing = false,
  className,
  variant = "bar"
}: QuickPromptsBarProps) {
  const prompts = React.useMemo(() => getQuickPromptsForFile(file), [file]);

  if (prompts.length === 0) return null;

  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5", className)}>
        {prompts.slice(0, 3).map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={isProcessing}
            onClick={() => onExecutePrompt(item.prompt, true)}
            className="px-3 py-1.5 bg-white/95 hover:bg-indigo-50 hover:text-indigo-700 text-gray-700 rounded-full font-bold text-[11px] border border-gray-200/90 hover:border-indigo-300 shadow-sm backdrop-blur-sm transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 shrink-0 hover:scale-[1.02] active:scale-95 disabled:opacity-50"
            title={`Hỏi ngay: ${item.prompt}`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    );
  }

  if (variant === "grid") {
    return (
      <div className={cn("space-y-3 pt-2 text-left", className)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">
              Gợi ý câu lệnh nhanh cho tài liệu này:
            </span>
          </div>
          <span className="text-[9.5px] font-bold text-gray-400">
            Nhấp để hỏi ngay lập tức
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {prompts.map((item) => (
            <div
              key={item.id}
              onClick={() => !isProcessing && onExecutePrompt(item.prompt, true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isProcessing) {
                  onExecutePrompt(item.prompt, true);
                }
              }}
              className={cn(
                "p-3.5 bg-white hover:bg-indigo-50/50 border border-gray-150 hover:border-indigo-200 rounded-2xl transition-all shadow-3xs cursor-pointer flex flex-col justify-between gap-2.5 group relative hover:translate-y-[-1px] text-left",
                isProcessing && "opacity-50 pointer-events-none"
              )}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base shrink-0">{item.icon}</span>
                    <span className="text-xs font-black text-slate-800 group-hover:text-indigo-900 transition-colors line-clamp-1">
                      {item.label}
                    </span>
                  </div>
                  {item.badge && (
                    <span className="px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wide bg-indigo-50 text-indigo-700 border border-indigo-100/80 shrink-0">
                      {item.badge}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 font-medium leading-relaxed line-clamp-2">
                  {item.description}
                </p>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-gray-100/80 text-[10px] font-bold text-indigo-600">
                <span className="group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                  <span>Hỏi ngay</span>
                  <ArrowRight className="w-3 h-3" />
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExecutePrompt(item.prompt, false);
                  }}
                  className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-100/50 rounded-lg transition-colors"
                  title="Chèn vào ô nhập để chỉnh sửa trước khi gửi"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Default: "bar" variant (above textarea)
  return (
    <div className={cn("w-full space-y-1 animate-in fade-in duration-200", className)}>
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 px-1">
        <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-100/80 text-indigo-700 text-[10px] font-black uppercase tracking-wider shrink-0 shadow-3xs">
          <Sparkles className="w-3 h-3 text-indigo-600 animate-pulse" />
          <span>Gợi ý:</span>
        </div>

        {prompts.map((item) => (
          <div
            key={item.id}
            className="inline-flex items-center rounded-xl bg-slate-50 hover:bg-indigo-50/70 border border-gray-200/80 hover:border-indigo-200/90 text-slate-700 hover:text-indigo-850 shadow-3xs transition-all shrink-0 overflow-hidden group"
          >
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => onExecutePrompt(item.prompt, true)}
              className="px-2.5 py-1 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
              title={`Hỏi ngay: "${item.prompt}"`}
            >
              <span>{item.icon}</span>
              <span className="whitespace-nowrap">{item.label}</span>
              <CornerDownLeft className="w-2.5 h-2.5 text-gray-400 group-hover:text-indigo-600 opacity-60 group-hover:opacity-100 transition-opacity" />
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={(e) => {
                e.stopPropagation();
                onExecutePrompt(item.prompt, false);
              }}
              className="px-1.5 py-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-100/50 border-l border-gray-200/60 transition-colors cursor-pointer"
              title="Chèn nội dung vào ô nhập để xem/sửa"
            >
              <Edit2 className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

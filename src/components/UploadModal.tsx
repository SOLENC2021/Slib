import React, { useState } from "react";
import { X, FileText, Folder, CheckCircle2, Loader2, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface UploadModalProps {
  file: File;
  onClose: () => void;
  onConfirm: (category: string) => Promise<void>;
  isProcessing: boolean;
  progress?: number;
  stage?: "uploading" | "extracting" | "done" | "idle";
}

const CATEGORIES = [
  { id: "kientruc", name: "Kiến trúc" },
  { id: "ketcau_tcvn", name: "Kết cấu - TCVN" },
  { id: "ketcau_tcnn", name: "Kết cấu - TCNN" },
  { id: "mep", name: "MEP" },
  { id: "qckt", name: "Quy chuẩn kỹ thuật" },
  { id: "vbhh", name: "Văn bản hiện hành" },
  { id: "banve", name: "Bản vẽ thiết kế" },
];

export function UploadModal({ 
  file, 
  onClose, 
  onConfirm, 
  isProcessing,
  progress = 0,
  stage = "idle"
}: UploadModalProps) {
  const [selectedCategory, setSelectedCategory] = useState("banve");

  const formatSize = (bytes: number) => {
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  const getStageLabel = () => {
    switch (stage) {
      case "uploading": return "Đang truyền tải dữ liệu...";
      case "extracting": return "AI đang đọc nội dung vẽ...";
      case "done": return "Hoàn tất xử lý!";
      default: return "";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md transition-all">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-md rounded-[48px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3)] overflow-hidden relative"
      >
        {/* Header */}
        <div className="p-10 pb-4 flex justify-between items-start">
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
              TẢI LÊN TÀI LIỆU
              {isProcessing && <Zap className="w-5 h-5 text-indigo-500 fill-indigo-500 animate-pulse" />}
            </h2>
            <p className="text-gray-400 text-[12px] font-black uppercase tracking-[0.2em]">Hệ thống phân tích kỹ thuật chuẩn</p>
          </div>
          {!isProcessing && (
            <button 
              onClick={onClose}
              className="p-3 hover:bg-gray-100 rounded-2xl transition-all"
            >
              <X className="w-6 h-6 text-gray-400" />
            </button>
          )}
        </div>

        <div className="px-10 pb-10 space-y-8">
          <AnimatePresence mode="wait">
            {isProcessing ? (
              <motion.div 
                key="processing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8 py-4"
              >
                {/* Processing View */}
                <div className="flex flex-col items-center text-center space-y-6">
                  <div className="relative">
                    <div className="w-24 h-24 bg-indigo-50 rounded-[32px] flex items-center justify-center relative z-10">
                      {stage === "done" ? (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", damping: 12 }}
                        >
                          <CheckCircle2 className="w-12 h-12 text-green-500" />
                        </motion.div>
                      ) : (
                        <div className="relative">
                           <FileText className="w-12 h-12 text-indigo-600" />
                           <div className="absolute inset-0 border-2 border-indigo-600 rounded-xl animate-ping opacity-20" />
                        </div>
                      )}
                    </div>
                    
                    {/* Ring progress */}
                    <svg className="absolute inset-0 -rotate-90 w-24 h-24 overflow-visible">
                      <circle
                        cx="48" cy="48" r="44"
                        fill="transparent"
                        stroke="currentColor"
                        strokeWidth="4"
                        className="text-gray-100"
                      />
                      <motion.circle
                        cx="48" cy="48" r="44"
                        fill="transparent"
                        stroke="currentColor"
                        strokeWidth="4"
                        strokeDasharray="276"
                        initial={{ strokeDashoffset: 276 }}
                        animate={{ strokeDashoffset: 276 - (276 * progress) / 100 }}
                        className="text-indigo-600"
                      />
                    </svg>

                    {stage === "done" && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute -top-4 -right-4 bg-green-500 text-white p-2 rounded-full shadow-lg"
                      >
                        <Sparkles className="w-5 h-5 fill-white" />
                      </motion.div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h3 className={cn(
                      "text-xl font-black uppercase tracking-widest transition-colors",
                      stage === "done" ? "text-green-600" : "text-gray-900"
                    )}>
                      {stage === "done" ? "DONE!" : `${progress}%`}
                    </h3>
                    <p className="text-[12px] font-black text-gray-400 uppercase tracking-widest h-4">
                      {getStageLabel()}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                   <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        className={cn(
                          "h-full transition-colors",
                          stage === "done" ? "bg-green-500" : "bg-indigo-600"
                        )}
                      />
                   </div>
                   <div className="flex justify-between text-[10px] font-black text-gray-300 uppercase tracking-widest">
                      <span>{stage === "uploading" ? "UPLOADING" : stage === "extracting" ? "AI ENGINE" : "COMPLETE"}</span>
                      <span>SECURE CONNECTION</span>
                   </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="setup"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-8"
              >
                {/* File Preview */}
                <div className="bg-gray-50 rounded-[32px] p-8 flex items-center gap-6 border border-gray-100 shadow-inner group transition-all hover:bg-indigo-50/30">
                  <div className="relative">
                    <div className="w-20 h-20 bg-white rounded-3xl shadow-sm border border-gray-100 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                      <FileText className="w-10 h-10" />
                    </div>
                    <div className="absolute top-0 right-0 w-4 h-4 bg-indigo-600 rounded-full border-4 border-white translate-x-1/2 -translate-y-1/2 shadow-sm" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-black text-gray-900 truncate tracking-tight">{file.name}</p>
                    <p className="text-[12px] font-black text-gray-400 uppercase tracking-widest mt-1.5 flex items-center gap-2">
                      {formatSize(file.size)} <span className="w-1 h-1 bg-gray-300 rounded-full" /> PDF DOCUMENT
                    </p>
                  </div>
                </div>

                {/* Category Selection */}
                <div className="space-y-5">
                  <h3 className="text-[12px] font-black text-indigo-400 uppercase tracking-[0.25em] px-1">
                    CHỌN KHÔNG GIAN LƯU TRỮ
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {CATEGORIES.map((cat) => {
                      const isSelected = selectedCategory === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            console.log("Selecting category:", cat.id);
                            setSelectedCategory(cat.id);
                          }}
                          className={cn(
                            "flex items-center gap-4 p-5 rounded-3xl border-2 transition-all text-left relative",
                            isSelected
                              ? "border-indigo-600 bg-indigo-600 text-white shadow-xl shadow-indigo-600/20 scale-[1.02]"
                              : "border-gray-100 bg-white hover:border-indigo-200 text-gray-600"
                          )}
                        >
                          <Folder className={cn(
                            "w-6 h-6 shrink-0 transition-colors",
                            isSelected ? "text-white fill-white/20" : "text-gray-300"
                          )} />
                          <span className={cn(
                            "text-[13px] font-black uppercase tracking-wider truncate",
                            isSelected ? "text-white" : "text-gray-600"
                          )}>{cat.name}</span>
                          {isSelected && (
                            <motion.div 
                              layoutId="active-cat"
                              className="absolute inset-0 border-2 border-indigo-600 rounded-3xl"
                              initial={false}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-6 pt-4">
                  <button
                    onClick={onClose}
                    className="flex-1 py-5 text-[13px] font-black text-gray-400 hover:text-gray-600 transition-colors uppercase tracking-[0.2em]"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    onClick={() => onConfirm(selectedCategory)}
                    disabled={isProcessing}
                    className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white py-5 rounded-3xl font-black text-[13px] uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    XÁC NHẬN TẢI LÊN
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

import React, { useState } from "react";
import { X, FileText, Folder, CheckCircle2, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface UploadModalProps {
  file?: File | null;
  files?: File[] | null;
  currentUploadIndex?: number;
  totalUploadCount?: number;
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
  { id: "vatlieu", name: "Vật liệu" },
  { id: "qckt", name: "Quy chuẩn kỹ thuật" },
  { id: "vbhh", name: "Văn bản hiện hành" },
  { id: "banve", name: "Bản vẽ thiết kế" },
];

export function UploadModal({ 
  file, 
  files = null,
  currentUploadIndex = 0,
  totalUploadCount = 1,
  onClose,
  onConfirm,
  isProcessing,
  progress = 0,
  stage = "idle"
}: UploadModalProps) {
  const [selectedCategory, setSelectedCategory] = useState("banve");

  // Build unified file array for representation
  const activeFiles = files && files.length > 0 
    ? files 
    : file 
      ? [file] 
      : [];

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

  const currentProcessingFile = activeFiles[currentUploadIndex] || activeFiles[0] || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-all">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-md rounded-[32px] shadow-[0_24px_48px_-8px_rgba(0,0,0,0.18)] overflow-hidden relative border border-gray-100"
      >
        {/* Header */}
        <div className="p-6 pb-2 flex justify-between items-start">
          <div className="space-y-0.5">
            <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-1.5 uppercase">
              Tải lên tài liệu
              {isProcessing && <Zap className="w-4 h-4 text-indigo-500 fill-indigo-500 animate-pulse" />}
            </h2>
            <p className="text-gray-400 text-[9.5px] font-black uppercase tracking-wider">Hệ thống phân tích kỹ thuật chuẩn</p>
          </div>
          {!isProcessing && (
            <button 
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded-xl transition-all"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>

        <div className="px-6 pb-6 space-y-5">
          <AnimatePresence mode="wait">
            {isProcessing ? (
              <motion.div 
                key="processing"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-6 py-2"
              >
                {/* Processing View */}
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="relative">
                    <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center relative z-10">
                      {stage === "done" ? (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", damping: 12 }}
                        >
                          <CheckCircle2 className="w-8 h-8 text-green-500" />
                        </motion.div>
                      ) : (
                        <div className="relative">
                           <FileText className="w-8 h-8 text-indigo-600 animate-pulse" />
                           <div className="absolute inset-0 border border-indigo-600 rounded-lg animate-ping opacity-25" />
                        </div>
                      )}
                    </div>
                    
                    {/* Ring progress */}
                    <svg className="absolute inset-0 -rotate-90 w-16 h-16 overflow-visible">
                      <circle
                        cx="32" cy="32" r="28"
                        fill="transparent"
                        stroke="currentColor"
                        strokeWidth="3"
                        className="text-gray-100"
                      />
                      <motion.circle
                        cx="32" cy="32" r="28"
                        fill="transparent"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeDasharray="176"
                        initial={{ strokeDashoffset: 176 }}
                        animate={{ strokeDashoffset: 176 - (176 * progress) / 100 }}
                        className="text-indigo-600"
                      />
                    </svg>

                    {stage === "done" && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute -top-1 -right-1 bg-green-500 text-white p-1 rounded-full shadow-md"
                      >
                        <Sparkles className="w-3.5 h-3.5 fill-white" />
                      </motion.div>
                    )}
                  </div>

                  <div className="space-y-1 w-full px-4">
                    <h3 className={cn(
                      "text-base font-black uppercase tracking-wider transition-colors",
                      stage === "done" ? "text-green-600" : "text-gray-900"
                    )}>
                      {stage === "done" ? "HOÀN THÀNH!" : `${progress}%`}
                    </h3>
                    
                    {totalUploadCount > 1 && (
                      <p className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-widest mt-0.5">
                        Tài liệu {currentUploadIndex + 1} / {totalUploadCount}
                      </p>
                    )}
                    
                    <p className="text-[11px] font-bold text-gray-600 truncate max-w-xs mx-auto">
                      {currentProcessingFile?.name}
                    </p>

                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider h-4 mt-0.5">
                      {getStageLabel()}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                   <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        className={cn(
                          "h-full transition-colors",
                          stage === "done" ? "bg-green-500" : "bg-indigo-600"
                        )}
                      />
                   </div>
                   <div className="flex justify-between text-[8px] font-black text-gray-400 uppercase tracking-wider">
                      <span>{stage === "uploading" ? "TẢI LÊN TIẾN TRÌNH" : stage === "extracting" ? "ĐANG PHÂN TÍCH AI" : "ĐÃ LƯU TRỮ"}</span>
                      <span>KẾT NỐI AN TOÀN</span>
                   </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="setup"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-5"
              >
                {/* File Previews Block */}
                {activeFiles.length === 1 ? (
                  <div className="bg-gray-50 rounded-2xl p-4 flex items-center gap-4 border border-gray-100 shadow-inner group transition-all hover:bg-indigo-50/20">
                    <div className="relative">
                      <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center text-indigo-600 group-hover:scale-105 transition-transform">
                        <FileText className="w-6 h-6" />
                      </div>
                      <div className="absolute top-0 right-0 w-3 h-3 bg-indigo-600 rounded-full border-2 border-white translate-x-1/3 -translate-y-1/3 shadow-xs" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-extrabold text-gray-900 truncate tracking-tight">{activeFiles[0].name}</p>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5 flex items-center gap-1.5">
                        {formatSize(activeFiles[0].size)} <span className="w-1 h-1 bg-gray-300 rounded-full" /> PDF DOCUMENT
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 shadow-inner space-y-2.5">
                    <div className="flex items-center justify-between px-0.5">
                      <span className="text-[9px] font-black text-indigo-600 uppercase tracking-wider">
                        Danh sách tệp đã chọn ({activeFiles.length})
                      </span>
                      <span className="text-[8.5px] font-bold text-gray-400 uppercase tracking-wider">
                        TỔNG: {formatSize(activeFiles.reduce((acc, f) => acc + f.size, 0))}
                      </span>
                    </div>
                    <div className="max-h-[120px] overflow-y-auto space-y-1.5 pr-0.5 no-scrollbar">
                      {activeFiles.map((f, idx) => (
                        <div key={idx} className="bg-white rounded-lg p-2.5 border border-gray-100/60 flex items-center gap-2 shadow-xs">
                          <FileText className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span className="text-[11px] font-bold text-gray-800 truncate flex-1">{f.name}</span>
                          <span className="text-[9px] text-gray-400 font-bold shrink-0">{formatSize(f.size)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Category Selection */}
                <div className="space-y-3">
                  <h3 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] px-0.5">
                    CHỌN KHÔNG GIAN LƯU TRỮ CHUNG
                  </h3>
                  <div className="grid grid-cols-2 gap-2.5">
                    {CATEGORIES.map((cat) => {
                      const isSelected = selectedCategory === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            setSelectedCategory(cat.id);
                          }}
                          className={cn(
                            "flex items-center gap-2.5 p-3 rounded-2xl border transition-all text-left relative overflow-hidden",
                            isSelected
                              ? "border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-600/15 scale-[1.01]"
                              : "border-gray-100 bg-white hover:border-indigo-200 text-gray-600"
                          )}
                        >
                          <Folder className={cn(
                            "w-4 h-4 shrink-0 transition-colors",
                            isSelected ? "text-white fill-white/10" : "text-gray-300"
                          )} />
                          <span className={cn(
                            "text-[11px] font-black uppercase tracking-wider truncate",
                            isSelected ? "text-white" : "text-gray-650"
                          )}>{cat.name}</span>
                          {isSelected && (
                            <motion.div 
                              layoutId="active-cat"
                              className="absolute inset-0 border border-indigo-600 rounded-2xl"
                              initial={false}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-4 pt-2">
                  <button
                    onClick={onClose}
                    className="flex-1 py-3 text-[11px] font-black text-gray-400 hover:text-gray-600 transition-colors uppercase tracking-wider"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    onClick={() => onConfirm(selectedCategory)}
                    disabled={isProcessing}
                    className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-2xl font-black text-[11px] uppercase tracking-wider shadow-lg shadow-indigo-600/20 transition-all hover:scale-[1.01] active:scale-[0.99]"
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

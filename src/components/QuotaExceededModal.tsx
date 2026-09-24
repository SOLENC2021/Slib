import React, { useState } from "react";
import { X, ShieldAlert, RefreshCw, CheckCircle2 } from "lucide-react";
import { useAuth } from "./FirebaseProvider";

interface QuotaExceededModalProps {
  isOpen: boolean;
  onClose: () => void;
  limit: number;
}

export function QuotaExceededModal({ isOpen, onClose, limit }: QuotaExceededModalProps) {
  const { resetDailyQuota } = useAuth();
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  if (!isOpen) return null;

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await resetDailyQuota();
      setResetSuccess(true);
      setTimeout(() => {
        setResetSuccess(false);
        onClose();
      }, 1000);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      {/* Content Card */}
      <div className="relative bg-white rounded-[32px] max-w-md w-full shadow-[0_25px_60px_-15px_rgba(0,0,0,0.15)] p-8 border border-slate-200/50 flex flex-col items-center text-center transform transition-all scale-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Shield Alert Icon */}
        <div className="w-16 h-16 bg-amber-50 rounded-[28px] flex items-center justify-center mb-5 border border-amber-100 shadow-sm animate-pulse">
          <ShieldAlert className="w-8 h-8 text-amber-500" />
        </div>

        {/* Headline */}
        <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">
          HẠN MỨC CÂU HỎI ĐÃ ĐẠT {limit} CÂU
        </h2>
        
        {/* Statistics info badge */}
        <div className="px-4 py-1.5 bg-emerald-50 rounded-full border border-emerald-200/60 text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-4">
          Hệ thống mở tự do • Tự làm mới không giới hạn
        </div>

        {/* Message */}
        <p className="text-slate-500 text-xs font-medium leading-relaxed mb-6">
          Bạn đã sử dụng hết {limit} lượt truy vấn hôm nay. Bạn có thể nhấn nút làm mới bên dưới để khôi phục 100% hạn mức câu hỏi và tiếp tục sử dụng ngay!
        </p>

        {/* Action Button: Free Reset */}
        <div className="w-full space-y-3">
          <button 
            onClick={handleReset}
            disabled={isResetting}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-[20px] font-black text-xs uppercase tracking-[0.15em] shadow-lg shadow-indigo-600/20 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isResetting ? "animate-spin text-amber-300" : ""}`} />
            {isResetting ? "Đang khôi phục..." : "✦ Làm mới lượt hỏi ngay (Tiếp tục dùng)"}
          </button>

          {resetSuccess && (
            <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
              Đã khôi phục thành công!
            </div>
          )}

          <button 
            onClick={onClose}
            className="w-full py-2.5 text-slate-400 hover:text-slate-600 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

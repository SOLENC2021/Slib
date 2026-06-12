import React from "react";
import { X, ShieldAlert, Mail } from "lucide-react";

interface QuotaExceededModalProps {
  isOpen: boolean;
  onClose: () => void;
  limit: number;
}

export function QuotaExceededModal({ isOpen, onClose, limit }: QuotaExceededModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      {/* Content Card */}
      <div className="relative bg-white rounded-[32px] max-w-md w-full shadow-[0_25px_60px_-15px_rgba(0,0,0,0.15)] p-10 border border-slate-200/50 flex flex-col items-center text-center transform transition-all scale-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Shield Alert Icon */}
        <div className="w-20 h-20 bg-amber-50 rounded-[32px] flex items-center justify-center mb-6 border border-amber-100 shadow-sm animate-pulse">
          <ShieldAlert className="w-10 h-10 text-amber-500" />
        </div>

        {/* Headline */}
        <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">
          HẠN MỨC TRUY VẤN ĐÃ HẾT
        </h2>
        
        {/* Statistics info badge */}
        <div className="px-4 py-1.5 bg-slate-50 rounded-full border border-slate-200/60 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">
          Hạn mức hàng ngày: {limit} yêu cầu
        </div>

        {/* Message */}
        <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">
          Tài khoản của bạn đã đạt {limit} lượt yêu cầu tới hệ thống trí tuệ nhân tạo Gemini ngày hôm nay. Hạn mức sẽ tự động đặt lại về 0 vào ngày mai.
        </p>

        {/* Instructions */}
        <div className="w-full bg-indigo-50/50 rounded-2xl p-5 border border-indigo-100/30 flex flex-col items-center mb-8">
          <div className="flex items-center gap-2 mb-2 text-indigo-600">
            <Mail className="w-4 h-4" />
            <span className="text-xs font-black uppercase tracking-wider">YÊU CẦU NÂNG HẠN MỨC</span>
          </div>
          <p className="text-slate-600 text-xs font-bold leading-relaxed">
            Để tiếp tục thẩm định tài liệu khẩn cấp hoặc nâng giới hạn, hãy gửi tin nhắn cho Quản trị viên của bạn:
          </p>
          <code className="mt-3 block bg-white px-4 py-1.5 rounded-xl text-xs font-mono font-black text-indigo-600 border border-indigo-150 shadow-sm select-all">
            solenc2021@gmail.com
          </code>
        </div>

        {/* Primary action */}
        <button 
          onClick={onClose}
          className="w-full py-4 bg-slate-800 hover:bg-slate-900 text-white rounded-[20px] font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-slate-800/10 active:scale-[0.98] transition-all cursor-pointer"
        >
          Đồng ý
        </button>
      </div>
    </div>
  );
}

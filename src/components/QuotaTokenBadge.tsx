import React, { useState } from "react";
import { Zap, Sparkles, RefreshCw, X, CheckCircle2, Info } from "lucide-react";
import { useAuth } from "./FirebaseProvider";

export function QuotaTokenBadge() {
  const { profile, resetDailyQuota } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const limit = profile?.apiLimit || 50;
  const usedQuestions = profile?.apiUsageCount || 0;
  const remainingQuestions = Math.max(0, limit - usedQuestions);
  const percentQuestionsLeft = Math.round((remainingQuestions / limit) * 100);

  // Gemini token calculation (~1,000,000 free tokens / daily quota allocation)
  const MAX_DAILY_TOKENS = 1000000;
  const tokensUsed = profile?.tokensUsed || 0;
  const remainingTokens = Math.max(0, MAX_DAILY_TOKENS - tokensUsed);
  const percentTokensLeft = Math.round((remainingTokens / MAX_DAILY_TOKENS) * 100);

  const formatTokens = (val: number) => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${Math.round(val / 1000)}k`;
    return val.toLocaleString("vi-VN");
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await resetDailyQuota();
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 2500);
    } finally {
      setIsResetting(false);
    }
  };

  // Color dynamics based on remaining quota
  const isLow = remainingQuestions <= 5;
  const isMedium = remainingQuestions > 5 && remainingQuestions <= 15;

  const badgeBg = isLow
    ? "bg-rose-50 border-rose-200 text-rose-700"
    : isMedium
    ? "bg-amber-50 border-amber-200 text-amber-700"
    : "bg-emerald-50/80 border-emerald-200/80 text-emerald-800";

  const dotColor = isLow
    ? "bg-rose-500 animate-ping"
    : isMedium
    ? "bg-amber-500"
    : "bg-emerald-500";

  return (
    <div className="relative">
      {/* Compact Header Pill Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2.5 px-3.5 py-1.5 rounded-2xl border text-xs font-bold transition-all duration-200 shadow-xs hover:shadow-md cursor-pointer select-none ${badgeBg}`}
        title="Nhấn để xem chi tiết số lượng câu hỏi và lượng token còn lại"
      >
        <span className="relative flex h-2 w-2">
          <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColor}`} />
          <span className={`relative inline-flex rounded-full h-2 w-2 ${isLow ? "bg-rose-500" : isMedium ? "bg-amber-500" : "bg-emerald-500"}`} />
        </span>

        <Zap className={`w-3.5 h-3.5 ${isLow ? "text-rose-500" : isMedium ? "text-amber-500" : "text-emerald-600"}`} />

        <div className="flex items-center gap-1.5">
          <span className="font-extrabold tracking-tight">
            Còn <span className="underline decoration-current/30">{remainingQuestions}</span> câu
          </span>
          <span className="text-gray-300 font-normal">|</span>
          <span className="font-semibold opacity-90 text-[11px]">
            ~{formatTokens(remainingTokens)} tok
          </span>
        </div>
      </button>

      {/* Detail Popover Card */}
      {isOpen && (
        <div className="absolute right-0 mt-2.5 w-80 sm:w-96 bg-white rounded-3xl shadow-2xl border border-gray-200/80 p-5 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-start justify-between pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-black text-gray-900 leading-tight">
                  Tài nguyên AI & Token
                </h3>
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                  Mở công khai • Sử dụng thoải mái
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {/* Metric 1: Remaining Questions */}
            <div className="bg-gray-50/80 p-3.5 rounded-2xl border border-gray-150/60">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-bold text-gray-700 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  Số lượng câu hỏi còn lại:
                </span>
                <span className="font-black text-gray-900 text-sm">
                  {remainingQuestions} <span className="text-gray-400 font-semibold text-xs">/ {limit} câu</span>
                </span>
              </div>
              <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${
                    percentQuestionsLeft < 20 ? "bg-rose-500" : percentQuestionsLeft < 50 ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, percentQuestionsLeft))}%` }}
                />
              </div>
              <div className="flex justify-between items-center mt-1.5 text-[10px] text-gray-400 font-medium">
                <span>Đã dùng: {usedQuestions} câu</span>
                <span>Khả dụng: {percentQuestionsLeft}%</span>
              </div>
            </div>

            {/* Metric 2: Estimated Tokens */}
            <div className="bg-indigo-50/40 p-3.5 rounded-2xl border border-indigo-100/60">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-bold text-gray-700 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  Lượng Token còn lại:
                </span>
                <span className="font-black text-indigo-900 text-sm">
                  ~{remainingTokens.toLocaleString("vi-VN")} <span className="text-indigo-400 font-semibold text-xs">/ {formatTokens(MAX_DAILY_TOKENS)}</span>
                </span>
              </div>
              <div className="w-full bg-indigo-100 h-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(0, percentTokensLeft))}%` }}
                />
              </div>
              <div className="flex justify-between items-center mt-1.5 text-[10px] text-indigo-400 font-medium">
                <span>Đã sử dụng: ~{tokensUsed.toLocaleString("vi-VN")} tokens</span>
                <span>Khả dụng: {percentTokensLeft}%</span>
              </div>
            </div>

            {/* Note & Model info */}
            <div className="flex items-start gap-2 p-2.5 bg-blue-50/60 border border-blue-100 rounded-xl text-[11px] text-blue-800 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
              <span>
                Hệ thống đang chạy mô hình thế hệ mới <strong className="font-bold">Gemini 3.8 Flash</strong> với tốc độ bóc tách nhanh và hạn mức cao. Mọi người đều có thể gửi câu hỏi và tra cứu tài liệu thoải mái.
              </span>
            </div>

            {/* Reset Quota Button */}
            <div className="pt-1">
              <button
                onClick={handleReset}
                disabled={isResetting}
                className="w-full py-2.5 px-4 bg-gray-900 hover:bg-black active:scale-[0.98] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isResetting ? "animate-spin text-amber-300" : ""}`} />
                {isResetting ? "Đang làm mới..." : "Làm mới lượt hỏi ngay (Reset Quota)"}
              </button>

              {resetSuccess && (
                <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] font-bold text-emerald-600 animate-in fade-in">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Đã khôi phục đầy đủ 100% câu hỏi và token!
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

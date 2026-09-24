import React, { useState } from "react";
import { 
  ShieldCheck, Calculator, Zap, Compass, Bot, Sparkles, 
  Brain, Gauge, RotateCcw, Sliders, ChevronDown, Check, 
  X, HelpCircle, FileText, ArrowRight
} from "lucide-react";
import { ChatbotRoleId, GeminiModelId } from "@/types";
import { CHATBOT_ROLES, GEMINI_MODELS, getChatbotRole, getGeminiModel } from "@/lib/chatbotRoles";
import { cn } from "@/lib/utils";

interface ChatbotRoleSelectorProps {
  selectedRole: ChatbotRoleId;
  onSelectRole: (role: ChatbotRoleId) => void;
  selectedModel: GeminiModelId;
  onSelectModel: (model: GeminiModelId) => void;
  onClearHistory?: () => void;
  customSystemInstruction?: string;
  onUpdateCustomSystemInstruction?: (instruction: string) => void;
  onSelectSamplePrompt?: (prompt: string) => void;
  messageCount?: number;
  className?: string;
}

export default function ChatbotRoleSelector({
  selectedRole,
  onSelectRole,
  selectedModel,
  onSelectModel,
  onClearHistory,
  customSystemInstruction = "",
  onUpdateCustomSystemInstruction,
  onSelectSamplePrompt,
  messageCount = 0,
  className
}: ChatbotRoleSelectorProps) {
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [tempInstruction, setTempInstruction] = useState(customSystemInstruction);

  const activeRoleConfig = getChatbotRole(selectedRole);
  const activeModelConfig = getGeminiModel(selectedModel);

  const getRoleIcon = (iconName: string, className = "w-4 h-4") => {
    switch (iconName) {
      case "ShieldCheck":
        return <ShieldCheck className={className} />;
      case "Calculator":
        return <Calculator className={className} />;
      case "Zap":
        return <Zap className={className} />;
      case "Compass":
        return <Compass className={className} />;
      case "Bot":
      default:
        return <Bot className={className} />;
    }
  };

  const getModelIcon = (iconName: string, className = "w-3.5 h-3.5") => {
    switch (iconName) {
      case "Brain":
        return <Brain className={className} />;
      case "Gauge":
        return <Gauge className={className} />;
      case "Sparkles":
        return <Sparkles className={className} />;
      case "Zap":
      default:
        return <Zap className={className} />;
    }
  };

  const handleSelectRoleWithModel = (roleId: ChatbotRoleId) => {
    onSelectRole(roleId);
    const config = getChatbotRole(roleId);
    if (config?.recommendedModel) {
      onSelectModel(config.recommendedModel);
    }
    setIsRoleModalOpen(false);
  };

  return (
    <div className={cn("w-full space-y-2.5", className)}>
      {/* Top Bar: Active Persona, Model Switcher, and Conversation Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white/95 backdrop-blur-xs p-2.5 sm:p-3 rounded-2xl border border-gray-200/80 shadow-xs">
        {/* Active Role Button */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setIsRoleModalOpen(true)}
            className="group flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50/80 hover:bg-indigo-100/90 text-indigo-900 border border-indigo-200/70 transition-all text-left cursor-pointer active:scale-95"
            title="Nhấp để đổi vai trò chuyên gia AI"
          >
            <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              {getRoleIcon(activeRoleConfig.iconName, "w-3.5 h-3.5")}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[11.5px] font-black uppercase tracking-wide truncate max-w-[130px] sm:max-w-[190px]">
                  {activeRoleConfig.shortTitle}
                </span>
                <ChevronDown className="w-3 h-3 text-indigo-400 group-hover:text-indigo-600 transition-transform group-hover:translate-y-0.5 shrink-0" />
              </div>
              <span className="text-[9px] text-indigo-600 font-extrabold tracking-wider uppercase block -mt-0.5">
                {activeRoleConfig.badge}
              </span>
            </div>
          </button>

          {/* Model Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 hover:text-gray-900 border border-gray-200 transition-all text-[11px] font-bold cursor-pointer"
              title="Chọn mô hình Gemini xử lý"
            >
              <span className={cn("p-1 rounded-md", activeModelConfig.badgeColor)}>
                {getModelIcon(activeModelConfig.icon, "w-3 h-3")}
              </span>
              <span className="font-extrabold text-[10.5px] tracking-tight">{activeModelConfig.name}</span>
              <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
            </button>

            {isModelDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsModelDropdownOpen(false)} 
                />
                <div className="absolute left-0 top-full mt-1.5 z-50 w-72 bg-white rounded-2xl border border-gray-200/90 shadow-xl p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-2.5 py-1.5 border-b border-gray-100 text-[10px] font-black uppercase tracking-wider text-gray-400">
                    Lựa chọn Model Gemini AI
                  </div>
                  {GEMINI_MODELS.map((m) => {
                    const isSelected = selectedModel === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          onSelectModel(m.id);
                          setIsModelDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-start gap-2.5 p-2 rounded-xl text-left transition-all cursor-pointer",
                          isSelected
                            ? "bg-indigo-50/80 text-indigo-950 font-black border border-indigo-200/60"
                            : "hover:bg-gray-50 text-gray-700 font-semibold"
                        )}
                      >
                        <span className={cn("p-1.5 rounded-lg shrink-0 mt-0.5", m.badgeColor)}>
                          {getModelIcon(m.icon, "w-3.5 h-3.5")}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black">{m.name}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                          </div>
                          <p className="text-[10px] text-gray-500 line-clamp-1 mt-0.5">{m.tag}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Action Tools: System Prompt & Clear History */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setTempInstruction(customSystemInstruction || activeRoleConfig.systemInstruction);
              setIsPromptModalOpen(true);
            }}
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-gray-50 hover:bg-indigo-50 text-gray-600 hover:text-indigo-700 border border-gray-200/70 hover:border-indigo-200 transition-all flex items-center gap-1.5 text-[10.5px] font-bold cursor-pointer"
            title="Xem và tùy biến chỉ dẫn hệ thống (System Prompt)"
          >
            <Sliders className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Chỉ dẫn Vai trò</span>
          </button>

          {onClearHistory && (
            <button
              type="button"
              onClick={() => {
                if (messageCount > 0) {
                  if (window.confirm("Bạn có chắc chắn muốn làm mới và xóa lịch sử đoạn hội thoại này để bắt đầu phiên mới?")) {
                    onClearHistory();
                  }
                } else {
                  onClearHistory();
                }
              }}
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-gray-50 hover:bg-red-50 text-gray-500 hover:text-red-600 border border-gray-200/70 hover:border-red-200 transition-all flex items-center gap-1.5 text-[10.5px] font-bold cursor-pointer"
              title="Làm mới cuộc trò chuyện"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
          )}
        </div>
      </div>

      {/* Suggested Quick Sample Prompts for Active Role */}
      {activeRoleConfig.samplePrompts && activeRoleConfig.samplePrompts.length > 0 && onSelectSamplePrompt && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 shrink-0 flex items-center gap-1 pl-1">
            <Sparkles className="w-3 h-3 text-indigo-500" />
            Gợi ý:
          </span>
          {activeRoleConfig.samplePrompts.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectSamplePrompt(prompt)}
              className="shrink-0 px-2.5 py-1 rounded-full bg-white hover:bg-indigo-50/90 text-gray-700 hover:text-indigo-900 border border-gray-200/70 hover:border-indigo-300 text-[10.5px] font-semibold transition-all shadow-3xs hover:shadow-2xs cursor-pointer flex items-center gap-1 active:scale-95 text-left"
              title={prompt}
            >
              <span className="max-w-[220px] sm:max-w-[320px] truncate">{prompt}</span>
              <ArrowRight className="w-2.5 h-2.5 text-indigo-400 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Role Selection Modal */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4.5 border-b border-gray-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900 uppercase tracking-wide">
                    Chọn Vai Trò Trợ Lý Gemini AI
                  </h3>
                  <p className="text-[11px] text-gray-500 font-medium">
                    Tùy chỉnh phong cách phản hồi, góc độ chuyên môn và mô hình AI phù hợp
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRoleModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Roles List */}
            <div className="p-6 overflow-y-auto space-y-3.5 no-scrollbar flex-1">
              {CHATBOT_ROLES.map((role) => {
                const isSelected = selectedRole === role.id;
                const recModel = getGeminiModel(role.recommendedModel);

                return (
                  <div
                    key={role.id}
                    onClick={() => handleSelectRoleWithModel(role.id)}
                    className={cn(
                      "p-4 rounded-2xl border-2 transition-all cursor-pointer text-left relative",
                      isSelected
                        ? "bg-indigo-50/50 border-indigo-600 shadow-md ring-2 ring-indigo-500/10"
                        : "bg-white border-gray-200/80 hover:border-indigo-300 hover:bg-indigo-50/20"
                    )}
                  >
                    <div className="flex items-start gap-3.5">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs",
                        isSelected ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"
                      )}>
                        {getRoleIcon(role.iconName, "w-5 h-5")}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <h4 className="text-sm font-black text-gray-900 tracking-tight">
                            {role.name}
                          </h4>
                          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200">
                            {role.badge}
                          </span>
                        </div>

                        <p className="text-xs text-gray-600 font-medium leading-relaxed mt-1">
                          {role.description}
                        </p>

                        <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-gray-100 text-[10.5px]">
                          <span className="text-gray-400 font-bold uppercase tracking-wider">Mô hình khuyên dùng:</span>
                          <span className={cn("px-2 py-0.5 rounded font-black text-[10px] flex items-center gap-1 border", recModel.badgeColor)}>
                            {getModelIcon(recModel.icon, "w-2.5 h-2.5")}
                            {recModel.name}
                          </span>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-gray-100 bg-gray-50 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsRoleModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-indigo-700 transition-all cursor-pointer shadow-sm"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* System Prompt Customization Modal */}
      {isPromptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4.5 border-b border-gray-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide">
                    Chỉ dẫn Hệ thống (System Prompt)
                  </h3>
                  <p className="text-[10.5px] text-gray-500 font-medium">
                    {activeRoleConfig.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPromptModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-4 no-scrollbar">
              <p className="text-xs text-gray-600 leading-relaxed">
                Bạn có thể giữ nguyên chỉ dẫn mặc định đã được tinh chỉnh chuyên sâu, hoặc bổ sung quy tắc kiểm tra tiêu chuẩn riêng biệt cho doanh nghiệp của bạn:
              </p>

              <textarea
                value={tempInstruction}
                onChange={(e) => setTempInstruction(e.target.value)}
                rows={12}
                className="w-full p-3.5 rounded-2xl bg-gray-50 border border-gray-200 text-xs font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-y leading-relaxed"
                placeholder="Nhập System Instruction..."
              />

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setTempInstruction(activeRoleConfig.systemInstruction)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Khôi phục mặc định vai trò
                </button>
              </div>
            </div>

            <div className="px-6 py-3.5 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsPromptModalOpen(false)}
                className="px-4 py-2 rounded-xl text-gray-600 hover:text-gray-900 text-xs font-bold transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdateCustomSystemInstruction?.(tempInstruction);
                  setIsPromptModalOpen(false);
                }}
                className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-indigo-700 transition-all cursor-pointer shadow-sm"
              >
                Lưu áp dụng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

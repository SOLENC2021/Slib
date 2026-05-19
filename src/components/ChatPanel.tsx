import React, { useState, useRef, useEffect } from "react";
import { 
  Send, Zap, ListFilter, Save, CheckCircle2, 
  AlertCircle, Loader2, Copy, Maximize2, Download,
  Plus, Trash2, Settings, Sparkles, X, LayoutGrid
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { cn } from "@/lib/utils";
import Mermaid from "./Mermaid";
import { Message, ExtractionField, PDFFile } from "@/types";

interface ChatPanelProps {
  messages: Message[];
  activeFile: PDFFile | null;
  onSendMessage: (content: string, image?: string) => void;
  onExtract: (fields: ExtractionField[]) => Promise<any>;
  isProcessing: boolean;
  onSync: (data: any) => Promise<void>;
  isSyncing: boolean;
  onClose?: () => void;
}

export function ChatPanel({
  messages,
  activeFile,
  onSendMessage,
  onExtract,
  isProcessing,
  onSync,
  isSyncing,
  onClose
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [mode, setMode] = useState<"chat" | "extract" | "mindmap">("extract");
  const [extractedData, setExtractedData] = useState<any>(null);
  const [extractStatus, setExtractStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [mindmapCode, setMindmapCode] = useState<string>("");
  const [mindmapStatus, setMindmapStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [isEditingSchema, setIsEditingSchema] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [schema, setSchema] = useState<ExtractionField[]>(() => {
    const saved = localStorage.getItem("extraction_schema");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved schema", e);
      }
    }
    return [
      { name: "publisher", type: "string", description: "Cơ quan ban hành tài liệu" },
      { name: "revision_history", type: "string", description: "Lịch sử sửa đổi của tài liệu" },
      { name: "code", type: "string", description: "Mã hiệu hoặc số hiệu của tài liệu" },
    ];
  });

  useEffect(() => {
    localStorage.setItem("extraction_schema", JSON.stringify(schema));
  }, [schema]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() && !selectedImage) return;
    if (isProcessing) return;
    
    onSendMessage(input, selectedImage || undefined);
    setInput("");
    setSelectedImage(null);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
    // Reset input value to allow selecting same file again
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeSelectedImage = () => {
    setSelectedImage(null);
  };

  const handleExtract = async () => {
    setExtractStatus("loading");
    try {
      const result = await onExtract(schema);
      setExtractedData(result);
      setExtractStatus("success");
    } catch (error) {
      setExtractStatus("error");
    }
  };

  const handleGenerateMindmap = async () => {
    if (!activeFile) return;
    setMindmapStatus("loading");
    try {
      const response = await fetch("/api/generate-mindmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: activeFile.text }),
      });
      if (!response.ok) throw new Error("Failed to generate mind map");
      const data = await response.json();
      setMindmapCode(data.mermaidCode);
      setMindmapStatus("success");
    } catch (error) {
      console.error(error);
      setMindmapStatus("error");
    }
  };

  const handleAddField = () => {
    setSchema([...schema, { name: "", type: "string", description: "" }]);
  };

  const handleDeleteField = (index: number) => {
    const newSchema = schema.filter((_, i) => i !== index);
    setSchema(newSchema);
  };

  const updateField = (index: number, key: keyof ExtractionField, value: string) => {
    const newSchema = [...schema];
    newSchema[index] = { ...newSchema[index], [key]: value };
    setSchema(newSchema);
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#f8f9fc]">
      {/* Panel Header */}
      <div className="bg-white px-8 py-6 flex items-center justify-between border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-100">
            <Sparkles className="w-5 h-5 text-white fill-white" />
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">
              KNOWLEDGE LAB
            </h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Powered by Gemini 2.0 Flash</p>
          </div>
        </div>
        {onClose && (
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-900 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="px-6 pt-6 pb-2 flex gap-2 shrink-0 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setMode("chat")}
          className={cn(
            "px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all",
            mode === "chat" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100" : "bg-white text-gray-400 hover:text-gray-600 border border-gray-100"
          )}
        >
          HỎI ĐÁP
        </button>
        <button
          onClick={() => setMode("extract")}
          className={cn(
            "px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all",
            mode === "extract" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100" : "bg-white text-gray-400 hover:text-gray-600 border border-gray-100"
          )}
        >
          TRÍCH XUẤT
        </button>
        <button
          onClick={() => setMode("mindmap")}
          className={cn(
            "px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all",
            mode === "mindmap" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100" : "bg-white text-gray-400 hover:text-gray-600 border border-gray-100"
          )}
        >
          MIND MAP
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-2 space-y-8 no-scrollbar">
        {!activeFile ? (
          <div className="flex-1 h-full flex flex-col items-center justify-center p-8 text-center">
            <AlertCircle className="w-12 h-12 text-gray-200 mb-4" />
            <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Vui lòng chọn tài liệu</p>
          </div>
        ) : !activeFile.isAIReady && !activeFile.text ? (
          <div className="flex-1 h-full flex flex-col items-center justify-center p-8 text-center space-y-4">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
            <div className="space-y-2">
              <p className="text-gray-900 text-sm font-black uppercase tracking-widest">Đang phân tích cấu trúc tài liệu...</p>
              <p className="text-gray-400 text-[10px] uppercase tracking-widest leading-relaxed">
                Hệ thống đang trích xuất dữ liệu và thực hiện scan OCR nếu cần thiết.<br/>Vui lòng chờ trong giây lát.
              </p>
            </div>
          </div>
        ) : mode === "chat" ? (
          <>
            <div ref={scrollRef} className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex flex-col max-w-[90%] rounded-3xl p-5 shadow-sm transition-all",
                    msg.role === "user"
                      ? "bg-indigo-600 text-white ml-auto"
                      : "bg-white text-gray-800 mr-auto border border-gray-100"
                  )}
                >
                  {msg.image && (
                    <div className="mb-3 rounded-2xl overflow-hidden border border-white/20">
                      <img src={msg.image} alt="User upload" className="max-w-full h-auto object-cover max-h-60" />
                    </div>
                  )}
                  <div className="prose prose-sm prose-indigo max-w-none break-words font-medium leading-relaxed prose-table:border-collapse prose-table:border prose-table:border-gray-200 prose-th:bg-gray-50 prose-th:p-2 prose-td:p-2 prose-td:border prose-td:border-gray-200 prose-headings:text-indigo-900 prose-headings:font-black">
                    <ReactMarkdown
                      remarkPlugins={[remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
              {isProcessing && (
                <div className="flex items-center gap-2 text-gray-400 text-[10px] font-black uppercase tracking-widest italic ml-4">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                  Gemini đang suy nghĩ...
                </div>
              )}
            </div>
          </>
        ) : mode === "mindmap" ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <LayoutGrid className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">
                    MIND MAP TÓM TẮT
                  </h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Visual Knowledge Structure</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-[32px] border border-gray-100 p-8 shadow-sm min-h-[400px] flex flex-col items-center justify-center">
              {mindmapStatus === "loading" ? (
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Đang xây dựng sơ đồ kiến thức...</p>
                </div>
              ) : mindmapStatus === "success" && mindmapCode ? (
                <div className="w-full overflow-x-auto bg-gray-50 rounded-2xl p-4 border border-indigo-50">
                  <Mermaid chart={mindmapCode} />
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <LayoutGrid className="w-16 h-16 text-gray-200 mx-auto" />
                  <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Cần phân tích tài liệu để tạo mindmap</p>
                </div>
              )}
            </div>

            <button
              onClick={handleGenerateMindmap}
              disabled={mindmapStatus === "loading"}
              className="w-full bg-indigo-600 text-white py-6 rounded-[32px] font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
            >
              {mindmapStatus === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {mindmapStatus === "success" ? "CẬP NHẬT MIND MAP" : "TẠO MIND MAP TÓM TẮT"}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <ListFilter className="w-4 h-4 text-indigo-600" />
                </div>
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">
                  {isEditingSchema ? "Cấu hình trích xuất" : "Dữ liệu trích xuất kỹ thuật"}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsEditingSchema(!isEditingSchema)}
                  className={cn(
                    "p-2 rounded-lg transition-all",
                    isEditingSchema ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
                  )}
                  title={isEditingSchema ? "Xem kết quả" : "Chỉnh sửa Schema"}
                >
                  {isEditingSchema ? <CheckCircle2 className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
                </button>
                {!isEditingSchema && (
                  <>
                    <button className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"><Copy className="w-4 h-4" /></button>
                    <button className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"><Download className="w-4 h-4" /></button>
                  </>
                )}
              </div>
            </div>

            <div className="h-[1px] bg-gray-100" />

            {isEditingSchema ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">CÁC TRƯỜNG DỮ LIỆU</h4>
                  <button 
                    onClick={handleAddField}
                    className="flex items-center gap-1 text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-800"
                  >
                    <Plus className="w-3 h-3" /> THÊM TRƯỜNG
                  </button>
                </div>
                
                <div className="space-y-3">
                  {schema.map((field, idx) => (
                    <div key={idx} className="bg-white rounded-3xl border border-gray-100 p-5 shadow-sm group relative overflow-hidden">
                      <div className="flex gap-4">
                        <div className="flex-1 space-y-3">
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Tên trường (ID)</label>
                            <input
                              value={field.name}
                              onChange={(e) => updateField(idx, "name", e.target.value)}
                              placeholder="Ví dụ: publisher"
                              className="w-full bg-[#f8f9fc] border-none rounded-xl py-3 px-4 text-xs font-bold text-indigo-600 placeholder:text-gray-300 focus:ring-2 focus:ring-indigo-100 transition-all outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Mô tả nội dung cần lấy</label>
                            <textarea
                              value={field.description}
                              onChange={(e) => updateField(idx, "description", e.target.value)}
                              placeholder="Ví dụ: Cơ quan ban hành tài liệu này là ai?"
                              className="w-full bg-[#f8f9fc] border-none rounded-xl py-3 px-4 text-xs font-medium text-gray-600 placeholder:text-gray-300 focus:ring-2 focus:ring-indigo-100 transition-all outline-none resize-none h-20"
                            />
                          </div>
                        </div>
                        <button 
                          onClick={() => handleDeleteField(idx)}
                          className="self-start p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setIsEditingSchema(false)}
                  className="w-full py-4 bg-indigo-50 text-indigo-600 rounded-[24px] font-black text-[10px] uppercase tracking-[0.2em] hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                >
                  XÁC NHẬN CẤU HÌNH
                </button>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="bg-indigo-600 text-white p-2 rounded-xl">
                      <Zap className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest">KẾT QUẢ PHÂN TÍCH THÔNG MINH</h4>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Logic-based Source Information</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="p-2.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"><Copy className="w-5 h-5" /></button>
                    <button className="p-2.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"><Download className="w-5 h-5" /></button>
                  </div>
                </div>
                
                {/* Data Blocks based on extraction */}
                {schema.map((field) => (
                  <div key={field.name} className="bg-white rounded-[32px] border border-gray-100 p-8 shadow-sm hover:shadow-xl hover:translate-y-[-4px] transition-all group">
                    <div className="flex justify-between items-start mb-6">
                      <h5 className="text-[12px] font-black text-indigo-600 uppercase tracking-[0.2em]">{field.name.replace(/_/g, ' ')}</h5>
                      <div className="bg-gray-50 text-[10px] font-black text-gray-400 px-3 py-1 rounded-full uppercase tracking-widest border border-gray-100 group-hover:bg-indigo-50 group-hover:text-indigo-400 group-hover:border-indigo-100 transition-colors">
                        {field.name.toUpperCase()}
                      </div>
                    </div>
                    <div className="text-[17px] font-bold text-gray-700 leading-relaxed min-h-[50px] opacity-90 group-hover:opacity-100 prose prose-base prose-indigo max-w-none prose-table:border-collapse prose-table:border prose-table:border-gray-200 prose-th:bg-gray-50 prose-th:p-2 prose-td:p-2 prose-td:border prose-td:border-gray-200">
                      <ReactMarkdown
                        remarkPlugins={[remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {Array.isArray(extractedData?.[field.name]) 
                          ? extractedData?.[field.name].map((item: any) => `- ${item}`).join('\n')
                          : typeof extractedData?.[field.name] === 'object'
                          ? `\`\`\`json\n${JSON.stringify(extractedData?.[field.name], null, 2)}\n\`\`\``
                          : (extractedData?.[field.name] || "Dữ liệu đang được phân tích bởi Gemini Core Engine...")
                        }
                      </ReactMarkdown>
                    </div>
                    <div className="mt-8 flex items-center justify-between">
                      <button className="flex items-center gap-2 px-5 py-2.5 bg-indigo-50 text-indigo-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
                        <Maximize2 className="w-4 h-4" />
                        XEM TẠI TRANG {Math.floor(Math.random() * 5) + 1}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {extractStatus !== "success" && (
              <button
                onClick={handleExtract}
                disabled={extractStatus === "loading"}
                className="w-full bg-white border border-gray-100 text-gray-400 py-6 rounded-[32px] font-black text-[10px] uppercase tracking-[0.2em] shadow-sm hover:border-indigo-200 hover:text-indigo-600 transition-all flex items-center justify-center gap-3"
              >
                {extractStatus === "loading" ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                Bắt đầu phân tích kỹ thuật
              </button>
            )}

            <button
              onClick={() => onSync(extractedData)}
              disabled={isSyncing || !extractedData}
              className="w-full bg-gray-900 text-white py-6 rounded-[32px] font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-gray-200 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-4"
            >
              {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="rotate-[-20deg] w-5 h-5" />}
              ĐỒNG BỘ THUVIENNOIBO
            </button>
          </div>
        )}
      </div>

      {activeFile && mode === "chat" && (
        <div className="px-6 pb-6 pt-2 shrink-0 bg-[#f8f9fc]">
          <div className="relative bg-white border border-gray-100 rounded-[32px] p-2 shadow-xl shadow-gray-100 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
            {selectedImage && (
              <div className="px-4 pt-2 flex flex-wrap gap-2">
                <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-100 shadow-sm group">
                  <img src={selectedImage} alt="Selected" className="w-full h-full object-cover" />
                  <button 
                    onClick={removeSelectedImage}
                    className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
            <div className="flex items-end gap-2 pr-4">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Yêu cầu AI..."
                className="flex-1 bg-transparent border-none py-6 pl-6 pr-2 text-base font-medium focus:outline-none focus:ring-0 transition-all resize-none h-28"
              />
              <div className="pb-4 flex gap-2">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageChange} 
                  accept="image/*" 
                  className="hidden" 
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl hover:bg-indigo-100 transition-all"
                  title="Thêm hình ảnh"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={handleSend}
                  disabled={(!input.trim() && !selectedImage) || isProcessing}
                  className="p-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 disabled:bg-gray-200 shadow-lg shadow-indigo-600/20 transition-all"
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

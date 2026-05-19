import React, { useState } from "react";
import { 
  FileText, Plus, Loader2, Database, 
  ChevronRight, ChevronDown, Folder, 
  FolderOpen, Building2, Hammer, Zap,
  Compass, CheckCircle2, Share2, Trash2, Edit3
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PDFFile } from "@/types";

interface SidebarProps {
  files: PDFFile[];
  activeFileId: string | null;
  onSelectFile: (file: PDFFile) => void;
  onUpload: (file: File) => void;
  onDeleteFile: (file: PDFFile) => void;
  onEditFile: (file: PDFFile) => void;
  isUploading: boolean;
}

const NAV_STRUCTURE = [
  {
    id: "tckt",
    name: "Tiêu chuẩn kỹ thuật",
    subfolders: [
      { id: "kientruc", name: "Kiến trúc", icon: Building2 },
      { id: "ketcau", name: "Kết cấu", icon: Hammer },
      { id: "mep", name: "MEP", icon: Compass },
    ],
  },
  { id: "qckt", name: "Quy chuẩn kỹ thuật" },
  { id: "vbhh", name: "Văn bản hiện hành" },
];

export function Sidebar({ 
  files, 
  activeFileId, 
  onSelectFile, 
  onUpload, 
  onDeleteFile,
  onEditFile,
  isUploading 
}: SidebarProps) {
  const [dragActive, setDragActive] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<string[]>(["tckt"]);
  const [selectedCategory, setSelectedCategory] = useState<string>("kientruc");
  const [searchTerm, setSearchTerm] = useState("");

  const getCategoryName = (id: string) => {
    if (id === "kientruc") return "Kiến trúc";
    if (id === "ketcau") return "Kết cấu";
    if (id === "mep") return "MEP";
    if (id === "qckt") return "Quy chuẩn kỹ thuật";
    if (id === "vbhh") return "Văn bản hiện hành";
    return "";
  };

  const toggleFolder = (id: string, hasSubfolders: boolean) => {
    if (hasSubfolders) {
      setExpandedFolders(prev => 
        prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
      );
    } else {
      setSelectedCategory(id);
    }
  };

  const filteredFiles = files.filter(file => {
    const matchesSearch = file.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = file.category === getCategoryName(selectedCategory);
    return matchesSearch && matchesCategory;
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0]);
    }
  };

  return (
    <div className="w-[400px] h-full border-r border-gray-100 bg-white flex flex-col font-sans shrink-0">
      <div className="p-6 pb-2 space-y-4">
        {/* Search Bar */}
        <div className="relative group">
          <input
            type="text"
            placeholder="TẤT CẢ TÀI LIỆU"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#f8f9fc] border-none rounded-2xl py-4 px-6 text-[12px] font-black tracking-widest text-gray-500 placeholder:text-gray-300 focus:ring-2 focus:ring-indigo-100 transition-all outline-none"
          />
        </div>

        {/* Upload Button */}
        <label
          className={cn(
            "relative group flex items-center justify-center gap-3 w-full py-4 bg-gray-900 rounded-2xl transition-all cursor-pointer shadow-lg shadow-gray-100 hover:scale-[1.02] active:scale-[0.98]",
            isUploading && "opacity-50 cursor-wait"
          )}
        >
          {isUploading ? (
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          ) : (
            <>
              <Plus className="w-5 h-5 text-white" />
              <span className="text-sm font-black text-white uppercase tracking-wider">Tải tệp PDF mới</span>
            </>
          )}
          <input
            type="file"
            className="hidden"
            accept=".pdf"
            onChange={handleFileInput}
            disabled={isUploading}
          />
        </label>
      </div>

      <div className="p-6 flex-1 overflow-y-auto no-scrollbar">
        <h2 className="text-[13px] font-black text-gray-400 uppercase tracking-[0.15em] mb-6">
          CƠ SỞ DỮ LIỆU
        </h2>

        <div className="space-y-1">
          {NAV_STRUCTURE.map((folder) => {
            const isExpanded = expandedFolders.includes(folder.id);
            const isSelected = !folder.subfolders && selectedCategory === folder.id;
            
            return (
              <div key={folder.id} className="space-y-1">
                <button
                  onClick={() => toggleFolder(folder.id, !!folder.subfolders)}
                  className={cn(
                    "w-full flex items-center gap-3 py-3 px-4 rounded-2xl text-base font-bold transition-all group",
                    isSelected 
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100" 
                      : "text-gray-600 hover:text-indigo-600 hover:bg-gray-50"
                  )}
                >
                  {folder.subfolders ? (
                    isExpanded ? <ChevronDown className={cn("w-4 h-4", isSelected ? "text-white" : "text-gray-300")} /> : <ChevronRight className={cn("w-4 h-4", isSelected ? "text-white" : "text-gray-300")} />
                  ) : (
                    <ChevronRight className={cn("w-4 h-4 opacity-0")} />
                  )}
                  {isExpanded ? (
                    <FolderOpen className={cn("w-5 h-5", isSelected ? "text-white/80" : "text-gray-400 fill-gray-50")} />
                  ) : (
                    <Folder className={cn("w-5 h-5", isSelected ? "text-white/80" : "text-gray-400 fill-gray-50")} />
                  )}
                  <span className="flex-1 text-left">{folder.name}</span>
                </button>

                {folder.subfolders && isExpanded && (
                  <div className="ml-4 pl-4 border-l border-gray-100 space-y-1 py-1">
                    {folder.subfolders.map((sub) => {
                      const isSubSelected = selectedCategory === sub.id;
                      const Icon = sub.icon;
                      return (
                        <button
                          key={sub.id}
                          onClick={() => setSelectedCategory(sub.id)}
                          className={cn(
                            "w-full flex items-center gap-4 p-3 rounded-2xl text-left transition-all",
                            isSubSelected 
                              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100 scale-105" 
                              : "text-gray-500 hover:bg-gray-50"
                          )}
                        >
                          <div className={cn(
                            "p-2 rounded-lg",
                            isSubSelected ? "bg-indigo-500" : "bg-gray-100"
                          )}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <span className="text-[14px] font-bold tracking-wide">{sub.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8">
          <h2 className="text-[13px] font-black text-gray-400 uppercase tracking-[0.15em] mb-6">
            {getCategoryName(selectedCategory).toUpperCase()}
          </h2>
          
          <div className="space-y-4">
            {filteredFiles.map((file) => (
              <div
                key={file.id}
                onClick={() => onSelectFile(file)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    onSelectFile(file);
                  }
                }}
                className={cn(
                  "w-full relative p-4 rounded-3xl border transition-all text-left group overflow-hidden cursor-pointer outline-none",
                  activeFileId === file.id
                    ? "bg-white border-indigo-200 shadow-xl shadow-indigo-50 ring-1 ring-indigo-50"
                    : "bg-white border-gray-100 hover:border-indigo-100"
                )}
              >
                {file.isAIReady !== false && (
                  <div className={cn(
                    "absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                    file.extractionMethod === "gemini-ocr" 
                      ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20" 
                      : "bg-[#00BFA5] text-white"
                  )}>
                    <Zap className={cn("w-3 h-3 fill-white", file.extractionMethod === "gemini-ocr" && "animate-pulse")} />
                    {file.extractionMethod === "gemini-ocr" ? "AI OCR READY" : "AI READY"}
                  </div>
                )}
                
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
                    activeFileId === file.id ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-600"
                  )}>
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-black text-gray-900 truncate pr-16">{file.name}</p>
                    <p className="text-[12px] text-gray-400 mt-1 font-bold uppercase tracking-wider">
                      {file.size || "0 MB"} • {file.category || "Kiến trúc"}
                    </p>
                  </div>
                </div>

                {/* File Actions */}
                <div className="absolute right-4 bottom-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0 duration-300">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditFile(file);
                    }}
                    className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                    title="Chỉnh sửa tên"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteFile(file);
                    }}
                    className="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm"
                    title="Xóa tệp"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-6 mt-auto">
        <div className="p-6 rounded-[32px] bg-gray-900 border border-gray-800 shadow-xl shadow-gray-200 group relative overflow-hidden">
          <div className="relative z-10 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-900/20">
                <CheckCircle2 className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-base font-black text-white uppercase tracking-widest">KỸ SƯ TRẠM</h3>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed font-bold">
              Hệ thống tra cứu tiêu chuẩn & quy chuẩn dựa trên trí tuệ nhân tạo.
            </p>
            <div className="absolute bottom-2 right-2 opacity-20 transition-opacity group-hover:opacity-40">
              <Share2 className="w-4 h-4 text-white" />
            </div>
          </div>
          {/* Decorative element */}
          <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-indigo-600/10 rounded-full blur-3xl group-hover:bg-indigo-600/20 transition-all" />
        </div>
      </div>
    </div>
  );
}

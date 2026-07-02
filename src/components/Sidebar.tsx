import React, { useState } from "react";
import { 
  FileText, Plus, Loader2, Database, 
  ChevronRight, ChevronDown, Folder, 
  FolderOpen, Building2, Hammer, Zap,
  Compass, CheckCircle2, Share2, Trash2, Edit3,
  Scale, Info, Package
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PDFFile } from "@/types";
import { useAuth } from "./FirebaseProvider";

const CATEGORY_META: Record<string, { icon: React.ComponentType<any>; bg: string; text: string }> = {
  tckt: { icon: Database, bg: "bg-indigo-50/80 border border-indigo-100/50", text: "text-indigo-650" },
  qckt: { icon: Scale, bg: "bg-amber-50/80 border border-amber-100/50", text: "text-amber-600" },
  vbhh: { icon: CheckCircle2, bg: "bg-emerald-50/80 border border-emerald-100/50", text: "text-emerald-600" },
  banve: { icon: Compass, bg: "bg-rose-50/80 border border-rose-100/50", text: "text-rose-600" },
  kientruc: { icon: Building2, bg: "bg-sky-50/80 border border-sky-100/50", text: "text-sky-600" },
  ketcau: { icon: Hammer, bg: "bg-violet-50/80 border border-violet-100/50", text: "text-violet-600" },
  ketcau_tcvn: { icon: Folder, bg: "bg-teal-50/80 border border-teal-100/50", text: "text-teal-600" },
  ketcau_tcnn: { icon: Folder, bg: "bg-orange-50/80 border border-orange-100/50", text: "text-orange-600" },
  mep: { icon: Zap, bg: "bg-fuchsia-50/80 border border-fuchsia-100/50", text: "text-fuchsia-600" },
  vatlieu: { icon: Package, bg: "bg-rose-50/80 border border-rose-100/50", text: "text-rose-600" },
};

interface SidebarProps {
  files: PDFFile[];
  activeFileId: string | null;
  onSelectFile: (file: PDFFile) => void;
  onUpload: (files: File[]) => void;
  onDeleteFile: (file: PDFFile) => void;
  onEditFile: (file: PDFFile) => void;
  isUploading: boolean;
  viewMode?: "admin" | "member";
}

const NAV_STRUCTURE = [
  {
    id: "tckt",
    name: "Tiêu chuẩn kỹ thuật",
    subfolders: [
      { id: "kientruc", name: "Kiến trúc", icon: Building2 },
      { 
        id: "ketcau", 
        name: "Kết cấu", 
        icon: Hammer,
        subfolders: [
          { id: "ketcau_tcvn", name: "TCVN", icon: Folder },
          { id: "ketcau_tcnn", name: "TCNN", icon: Folder },
        ]
      },
      { id: "mep", name: "MEP", icon: Compass },
      { id: "vatlieu", name: "Vật liệu", icon: Package },
    ],
  },
  { id: "qckt", name: "Quy chuẩn kỹ thuật" },
  { id: "vbhh", name: "Văn bản hiện hành" },
  { id: "banve", name: "Bản vẽ thiết kế" },
];

export function Sidebar({ 
  files, 
  activeFileId, 
  onSelectFile, 
  onUpload, 
  onDeleteFile,
  onEditFile,
  isUploading,
  viewMode = "admin"
}: SidebarProps) {
  const { profile, user: authUser } = useAuth();
  const isAdmin = profile?.role === "admin" || authUser?.email === "solenc2021@gmail.com";
  const isMemberMode = viewMode === "member";
  const isEffectiveAdmin = isAdmin && !isMemberMode;
  
  const [dragActive, setDragActive] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<string[]>(["tckt"]);
  const [selectedCategory, setSelectedCategory] = useState<string>("banve");
  const [searchTerm, setSearchTerm] = useState("");

  const getCategoryName = (id: string) => {
    if (id === "banve") return "Bản vẽ thiết kế";
    if (id === "kientruc") return "Kiến trúc";
    if (id === "ketcau") return "Kết cấu";
    if (id === "ketcau_tcvn") return "TCVN";
    if (id === "ketcau_tcnn") return "TCNN";
    if (id === "mep") return "MEP";
    if (id === "vatlieu") return "Vật liệu";
    if (id === "qckt") return "Quy chuẩn kỹ thuật";
    if (id === "vbhh") return "Văn bản hiện hành";
    return "";
  };

  const toggleFolder = (id: string, hasSubfolders: boolean) => {
    if (hasSubfolders) {
      setExpandedFolders(prev => 
        prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
      );
    }
    setSelectedCategory(id);
  };

  const filteredFiles = files.filter(file => {
    const matchesSearch = file.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Improved category matching to include subcategories
    let matchesCategory = false;
    const catName = getCategoryName(selectedCategory);
    
    if (selectedCategory === "ketcau") {
      matchesCategory = file.category === "Kết cấu" || file.category === "TCVN" || file.category === "TCNN";
    } else {
      matchesCategory = file.category === catName;
    }
    
    return matchesSearch && matchesCategory;
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isEffectiveAdmin) return;
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
    if (!isEffectiveAdmin) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const selectedFiles = Array.from(e.dataTransfer.files).filter(file => file.name.toLowerCase().endsWith('.pdf'));
      if (selectedFiles.length > 0) {
        onUpload(selectedFiles);
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files).filter(file => file.name.toLowerCase().endsWith('.pdf'));
      if (selectedFiles.length > 0) {
        onUpload(selectedFiles);
      }
    }
  };

  return (
    <div className="w-[295px] h-full border-l border-gray-200/60 bg-white/95 flex flex-col font-sans shrink-0">
      <div className="p-6 pb-2 space-y-4">
        {/* Search Bar */}
        <div className="relative group">
          <input
            type="text"
            placeholder="TẤT CẢ TÀI LIỆU"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#f1f4f8] border border-gray-250/20 rounded-2xl py-4 px-6 text-[12px] font-black tracking-widest text-[#2c3e50] placeholder:text-gray-400 focus:bg-white focus:ring-4 focus:ring-indigo-150/15 focus:border-indigo-405 transition-all outline-none shadow-sm"
          />
        </div>

        {/* Upload Button */}
        {isEffectiveAdmin ? (
          <label
            className={cn(
              "relative group flex items-center justify-center gap-3 w-full py-4.5 bg-indigo-600 rounded-2xl transition-all duration-300 cursor-pointer shadow-md hover:shadow-[0_12px_24px_-4px_rgba(79,70,229,0.25)] hover:bg-indigo-700 hover:scale-[1.01] active:translate-y-[1px]",
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
              multiple
              onChange={handleFileInput}
              disabled={isUploading}
            />
          </label>
        ) : null}
      </div>

      <div className="p-6 flex-1 overflow-y-auto no-scrollbar">
        <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
          CƠ SỞ DỮ LIỆU
        </h2>

        <div className="space-y-3">
          {NAV_STRUCTURE.map((folder) => {
            const isExpanded = expandedFolders.includes(folder.id);
            const isSelected = !folder.subfolders && selectedCategory === folder.id;
            const meta = CATEGORY_META[folder.id];
            
            return (
              <div key={folder.id} className="space-y-1.5">
                <button
                  onClick={() => toggleFolder(folder.id, !!folder.subfolders)}
                  className={cn(
                    "w-full flex items-center gap-2.5 py-2 px-3 rounded-xl text-sm font-extrabold transition-all group border shadow-xs duration-200",
                    isSelected 
                      ? "bg-white border-indigo-600 text-indigo-950 shadow-[0_6px_16px_rgba(79,70,229,0.06)] ring-1 ring-indigo-600/10 scale-[1.01]" 
                      : "bg-[#f8fafc] border-gray-200/50 text-gray-700 hover:text-indigo-600 hover:border-indigo-200/50 hover:bg-white"
                  )}
                >
                  {folder.subfolders ? (
                    isExpanded ? <ChevronDown className={cn("w-3.5 h-3.5 text-gray-400")} /> : <ChevronRight className={cn("w-3.5 h-3.5 text-gray-400")} />
                  ) : (
                    <ChevronRight className={cn("w-3.5 h-3.5 opacity-0")} />
                  )}
                  <div className={cn(
                    "p-1 rounded-lg shrink-0 transition-all shadow-xs/30",
                    meta ? `${meta.bg} ${meta.text}` : "bg-gray-100 text-gray-500"
                  )}>
                    {meta ? <meta.icon className="w-3.5 h-3.5" /> : (isExpanded ? <FolderOpen className="w-3.5 h-3.5" /> : <Folder className="w-3.5 h-3.5" />)}
                  </div>
                  <span className="flex-1 text-left uppercase tracking-wider text-[10.5px] font-bold">{folder.name}</span>
                </button>

                {folder.subfolders && isExpanded && (
                  <div className="ml-2.5 pl-2.5 border-l border-gray-200/80 space-y-2 py-1.5">
                    {folder.subfolders.map((sub: any) => {
                      const isSubSelected = selectedCategory === sub.id;
                      const isSubExpanded = expandedFolders.includes(sub.id);
                      const subMeta = CATEGORY_META[sub.id];
                      const Icon = sub.icon || (subMeta ? subMeta.icon : Folder);
                      
                      return (
                        <div key={sub.id} className="space-y-1.5">
                          <button
                            onClick={() => toggleFolder(sub.id, !!sub.subfolders)}
                            className={cn(
                              "w-full flex items-center gap-2.5 p-2 px-2.5 rounded-xl text-left border shadow-xs transition-all duration-200",
                              isSubSelected 
                                ? "bg-white border-indigo-600 text-indigo-950 font-black shadow-[0_6px_16px_rgba(79,70,229,0.06)] ring-1 ring-indigo-600/10 scale-[1.01]" 
                                : "bg-[#f8fafc] border-gray-200/50 text-gray-650 hover:text-indigo-600 hover:border-indigo-200/50 hover:bg-white"
                            )}
                          >
                            <div className={cn(
                              "p-1 rounded-lg transition-all shadow-xs/30",
                              subMeta ? `${subMeta.bg} ${subMeta.text}` : "bg-gray-100 text-gray-500"
                            )}>
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <span className="flex-1 text-[10px] font-black tracking-wider uppercase">{sub.name}</span>
                            {sub.subfolders && (
                              isSubExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                            )}
                          </button>

                          {sub.subfolders && isSubExpanded && (
                            <div className="ml-2.5 pl-2.5 border-l border-gray-200/80 space-y-1.5 py-1">
                              {sub.subfolders.map((nested: any) => {
                                const isNestedSelected = selectedCategory === nested.id;
                                const nestedMeta = CATEGORY_META[nested.id];
                                const NestedIcon = nested.icon || (nestedMeta ? nestedMeta.icon : Folder);
                                return (
                                  <button
                                    key={nested.id}
                                    onClick={() => setSelectedCategory(nested.id)}
                                    className={cn(
                                      "w-full flex items-center gap-2 p-1.5 px-2 rounded-lg text-left transition-all border shadow-xs",
                                      isNestedSelected 
                                        ? "bg-white border-indigo-600 text-indigo-700 font-extrabold shadow-xs ring-1 ring-indigo-600/10" 
                                        : "bg-[#f8fafc] hover:bg-white border-gray-200/50 text-gray-550 hover:text-indigo-600 font-bold"
                                    )}
                                  >
                                    <div className={cn(
                                      "p-0.5 rounded-md shrink-0 transition-all",
                                      nestedMeta ? `${nestedMeta.bg} ${nestedMeta.text}` : "bg-gray-100 text-gray-400"
                                    )}>
                                      <NestedIcon className="w-3 h-3" />
                                    </div>
                                    <span className="text-[9.5px] tracking-wider uppercase">{nested.name}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
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
          
          <div className="space-y-2">
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
                  "w-full relative p-2.5 rounded-xl border transition-all duration-300 text-left group overflow-hidden cursor-pointer outline-none shadow-xs",
                  activeFileId === file.id
                    ? "bg-white border-indigo-500 shadow-[0_8px_16px_rgba(79,70,229,0.03)] ring-1 ring-indigo-500/20 scale-[1.005]"
                    : "bg-white border-gray-200/60 hover:border-indigo-350 hover:shadow-[0_6px_12px_-2px_rgba(0,0,0,0.02)]"
                )}
              >
                <div className="flex items-start gap-2">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors mt-0.5",
                    activeFileId === file.id ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-600"
                  )}>
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11.5px] font-extrabold text-gray-850 leading-normal break-words line-clamp-3 pr-4 group-hover:text-indigo-650 transition-colors">
                      {file.name}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      <span className="text-[9px] text-gray-400 font-bold tracking-wider">
                        {file.size || "0 MB"}
                      </span>
                      {file.isAIReady !== false && (
                        <span className={cn(
                          "inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[8px] font-extrabold uppercase tracking-wide",
                          file.extractionMethod === "gemini-ocr" 
                            ? "bg-amber-500/10 text-amber-700 border border-amber-500/10" 
                            : "bg-[#00BFA5]/10 text-[#009688] border border-[#00BFA5]/10"
                        )}>
                          <Zap className={cn("w-2 h-2 fill-current", file.extractionMethod === "gemini-ocr" && "animate-pulse")} />
                          {file.extractionMethod === "gemini-ocr" ? "AI OCR READY" : "AI READY"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* File Actions */}
                {isEffectiveAdmin && (
                  <div className="absolute right-2 bottom-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity translate-y-1 group-hover:translate-y-0 duration-300">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditFile(file);
                      }}
                      className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-all shadow-xs"
                      title="Chỉnh sửa tên"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteFile(file);
                      }}
                      className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all shadow-xs"
                      title="Xóa tệp"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Signature Footer */}
      <div className="p-4 border-t border-gray-150/40 bg-slate-50/30 text-center shrink-0">
        <p className="text-[10px] font-black text-slate-800 tracking-wider uppercase">
          Designed by SOL E&C Design Team
        </p>
      </div>
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { PDFViewer } from "./components/PDFViewer";
import { ChatPanel } from "./components/ChatPanel";
import { UploadModal } from "./components/UploadModal";
import { PDFFile, Message, ExtractionField, OperationType, PageData } from "./types";
import { chatWithDocument, extractDataFromText } from "./lib/gemini";
import { LayoutGrid, Sparkles, LogOut, Loader2, X } from "lucide-react";
import { useAuth } from "./components/FirebaseProvider";
import { db } from "./lib/firebase";
import { cn } from "./lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  orderBy 
} from "firebase/firestore";
import { 
  ref, 
  uploadBytes, 
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "firebase/storage";
import { handleFirestoreError } from "./lib/firestoreUtils";
import { storage } from "./lib/firebase";
import { DeleteConfirmModal } from "./components/DeleteConfirmModal";
import { EditFileModal } from "./components/EditFileModal";

export default function App() {
  const { user, loading, login, logout } = useAuth();
  const [files, setFiles] = useState<PDFFile[]>([]);
  const [activeFile, setActiveFile] = useState<PDFFile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<"uploading" | "extracting" | "done" | "idle">("idle");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<PDFFile | null>(null);
  const [fileToEdit, setFileToEdit] = useState<PDFFile | null>(null);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);

  // Sync files from Firestore
  useEffect(() => {
    if (!user) {
      setFiles([]);
      return;
    }

    const q = query(
      collection(db, "files"),
      where("ownerId", "==", user.uid),
      orderBy("uploadDate", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedFiles = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as PDFFile[];
      setFiles(fetchedFiles);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "files");
    });

    return () => unsubscribe();
  }, [user]);

  const getCategoryLabel = (id: string) => {
    switch (id) {
      case "kientruc": return "Kiến trúc";
      case "ketcau": return "Kết cấu";
      case "mep": return "MEP";
      case "qckt": return "Quy chuẩn kỹ thuật";
      default: return "Văn bản hiện hành";
    }
  };

  const safeFetch = async (url: string, options: RequestInit) => {
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type");
    
    if (!response.ok) {
      if (contentType && contentType.includes("application/json")) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.details || `Request failed with status ${response.status}`);
      } else {
        const text = await response.text();
        // If it's HTML, it might be an Express/Vite error page
        if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
          throw new Error(`Server error (${response.status}). Vui lòng kiểm tra lại cấu hình hoặc thử lại sau.`);
        }
        throw new Error(text || `Request failed with status ${response.status}`);
      }
    }
    
    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    }
    return await response.text();
  };

  const processFile = async (fileId: string, url: string) => {
    try {
      console.log(`Đang phân tích metadata cho file ${fileId}...`);
      const extractionData = await safeFetch("/api/extract-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl: url }),
      });
      
      await updateDoc(doc(db, "files", fileId), {
        text: extractionData.text || "", 
        numpages: extractionData.numpages,
        isAIReady: true,
        extractionMethod: extractionData.extractionMethod,
        processedPages: extractionData.extractionMethod === "pdf-parse" ? Array.from({length: extractionData.numpages}, (_, i) => i + 1) : []
      });
      console.log(`Đã hoàn tất phân tích metadata cho file ${fileId}.`);
    } catch (error: any) {
      console.error(`Lỗi trích xuất file ${fileId}:`, error);
    }
  };

  const processSpecificPage = async (fileId: string, url: string, pageNumber: number) => {
    if (!activeFile || activeFile.processedPages?.includes(pageNumber)) return;
    
    try {
      console.log(`Lazy loading OCR for page ${pageNumber}...`);
      const data = await safeFetch("/api/extract-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl: url, pages: [pageNumber] }),
      });

      const pageResult = data.pages[0];

      if (pageResult && pageResult.text) {
        // 1. Save to sub-collection
        const pageId = `${fileId}_p${pageNumber}`;
        const pageData: PageData = {
          fileId,
          pageNumber,
          text: pageResult.text,
          processedDate: Date.now()
        };
        await setDoc(doc(db, "files", fileId, "pages", pageNumber.toString()), pageData);

        // 2. Update processedPages array in main doc
        const updatedProcessed = [...(activeFile.processedPages || []), pageNumber];
        await updateDoc(doc(db, "files", fileId), {
          processedPages: updatedProcessed,
          // Accumulate some text for global search if needed
          text: (activeFile.text + "\n\n" + pageResult.text).substring(0, 50000) 
        });
        
        console.log(`Page ${pageNumber} OCR completed.`);
      }
    } catch (error) {
      console.error(`Error processing page ${pageNumber}:`, error);
    }
  };

  const handlePageChange = useCallback((pageNumber: number) => {
    if (activeFile && activeFile.extractionMethod === "hybrid-lazy") {
      processSpecificPage(activeFile.id, activeFile.url, pageNumber);
    }
  }, [activeFile]);

  const handleConfirmUpload = async (category: string) => {
    if (!pendingFile || !user) return;
    
    setIsUploading(true);
    setUploadProgress(0);
    setUploadStage("uploading");
    
    try {
      // 1. Upload to Firebase Storage with progress tracking
      const fileId = Math.random().toString(36).substr(2, 9);
      const storageRef = ref(storage, `pdfs/${user.uid}/${fileId}-${pendingFile.name}`);
      
      console.log("Đang tải tệp lên Firebase Storage...");
      
      const uploadTask = uploadBytesResumable(storageRef, pendingFile);
      
      const downloadURL = await new Promise<string>((resolve, reject) => {
        uploadTask.on(
          "state_changed",
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(Math.round(progress));
          },
          (error) => {
            console.error("Storage upload error:", error);
            reject(error);
          },
          async () => {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          }
        );
      });

      // 2. Initial save to Firestore (without text yet)
      const newFile: PDFFile = {
        id: fileId,
        name: pendingFile.name,
        text: "",
        numpages: 0,
        uploadDate: Date.now(),
        url: downloadURL,
        size: (pendingFile.size / (1024 * 1024)).toFixed(2) + " MB",
        category: getCategoryLabel(category),
        isAIReady: false,
        ownerId: user.uid
      };

      console.log("Đang lưu thông tin ban đầu vào Firestore...");
      await setDoc(doc(db, "files", fileId), newFile);
      
      setUploadStage("done");
      setUploadProgress(100);
      
      // Close modal and set active file after a short delay
      setTimeout(() => {
        setPendingFile(null);
        setIsUploading(false);
        setUploadStage("idle");
        setActiveFile(newFile);
        setMessages([]);
        
        // Trigger background processing
        processFile(fileId, downloadURL);
      }, 1000);

      console.log("Tải lên thành công. Hệ thống đang tiến hành phân tích nội dung.");
    } catch (error) {
      console.error("Lỗi quy trình tải lên:", error);
      handleFirestoreError(error, OperationType.WRITE, "files");
      setIsUploading(false);
      setUploadStage("idle");
    }
  };

  const handleSendMessage = useCallback(async (content: string, image?: string) => {
    if (!activeFile) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: Date.now(),
      image, // Add image to Message type if needed, or just use content
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);

    try {
      const history = messages.map(m => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }]
      }));

      const aiResponse = await chatWithDocument(activeFile.text, content, history, image);
      
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: aiResponse || "Xin lỗi, tôi gặp trục trặc khi suy nghĩ.",
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (error: any) {
      console.error("Lỗi AI:", error);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: `❌ LỖI HỆ THỐNG: ${error.message || "Không thể kết nối với dịch vụ AI."}\n\n*Gợi ý: Nếu lỗi liên quan đến API Key, hãy kiểm tra bảng Secrets trong AI Studio.*`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
    }
  }, [activeFile, messages]);

  const handleExtract = useCallback(async (fields: ExtractionField[]) => {
    if (!activeFile) return null;
    return await extractDataFromText(activeFile.text, fields);
  }, [activeFile]);

  const handleSync = useCallback(async (data: any) => {
    if (!activeFile || !user) return;
    setIsSyncing(true);
    try {
      // Update data in Firestore
      const fileRef = doc(db, "files", activeFile.id);
      await updateDoc(fileRef, {
        extractedData: data
      });

      // Also call internal API if needed for secondary systems
      await safeFetch("/api/sync-internal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data,
          filename: activeFile.name,
          timestamp: Date.now()
        }),
      });

      alert(`Đã đồng bộ thành công lên Cloud Firestore!`);
    } catch (error: any) {
      console.error("Sync error:", error);
      handleFirestoreError(error, OperationType.UPDATE, `files/${activeFile.id}`);
    } finally {
      setIsSyncing(false);
    }
  }, [activeFile, user]);

  const handleDeleteFile = async () => {
    if (!fileToDelete || !user) return;
    setIsActionPending(true);
    try {
      // 1. Delete from Firestore
      await deleteDoc(doc(db, "files", fileToDelete.id));

      // 2. Delete from Storage (if url exists and is internal)
      if (fileToDelete.url && fileToDelete.url.includes("firebasestorage.googleapis.com")) {
        // Extract storage path from download URL or use a structured path if known
        // Since we know the structure: `pdfs/${user.uid}/${fileId}-${pendingFile.name}`
        const storagePath = `pdfs/${user.uid}/${fileToDelete.id}-${fileToDelete.name}`;
        const fileRef = ref(storage, storagePath);
        await deleteObject(fileRef).catch(err => console.error("Storage delete failed:", err));
      }

      if (activeFile?.id === fileToDelete.id) {
        setActiveFile(null);
        setMessages([]);
      }
      setFileToDelete(null);
    } catch (error) {
      console.error("Delete error:", error);
      handleFirestoreError(error, OperationType.DELETE, `files/${fileToDelete.id}`);
    } finally {
      setIsActionPending(false);
    }
  };

  const handleRenameFile = async (newName: string) => {
    if (!fileToEdit || !user) return;
    setIsActionPending(true);
    try {
      const fileRef = doc(db, "files", fileToEdit.id);
      await updateDoc(fileRef, {
        name: newName
      });
      
      if (activeFile?.id === fileToEdit.id) {
        setActiveFile({ ...activeFile, name: newName });
      }
      setFileToEdit(null);
    } catch (error) {
      console.error("Rename error:", error);
      handleFirestoreError(error, OperationType.UPDATE, `files/${fileToEdit.id}`);
    } finally {
      setIsActionPending(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-50 font-sans">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
          <p className="text-sm font-black text-gray-400 uppercase tracking-widest">Đang kết nối thư viện...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#f8f9fc] font-sans p-6">
        <div className="max-w-md w-full bg-white rounded-[48px] shadow-2xl p-12 border border-gray-100 flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-gray-900 rounded-[32px] flex items-center justify-center mb-8 shadow-xl">
            <LayoutGrid className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight mb-4">
            Library Engine <span className="text-indigo-600">v3</span>
          </h1>
          <p className="text-gray-400 text-sm font-bold uppercase tracking-widest leading-relaxed mb-10">
            Hệ thống quản lý tài liệu kỹ thuật<br/>thế hệ mới của Kỹ sư trạm
          </p>
          <button 
            onClick={login}
            className="w-full py-5 bg-indigo-600 text-white rounded-[24px] font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-4 group"
          >
            ĐĂNG NHẬP VỚI GOOGLE
          </button>
          <p className="mt-8 text-[10px] text-gray-300 font-bold uppercase tracking-widest">
            BẢO MẬT BỞI GOOGLE CLOUD PLATFORM
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-[#f8f9fc] overflow-hidden">
      {/* Top Header */}
      <header className="h-20 bg-white border-b border-gray-100 flex items-center justify-between px-8 shrink-0 z-30">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center">
            <LayoutGrid className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black text-gray-900 leading-none">StandardCloud</h1>
            <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-tighter">
              ENGINEERING ENGINE <span className="text-gray-300 ml-1">• V3.1.0</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end mr-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-700">{user.displayName}</span>
              <div className="w-10 h-10 rounded-full bg-gray-200 border-2 border-white shadow-sm overflow-hidden">
                <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}&background=4f46e5&color=fff`} alt="Avatar" className="w-full h-full object-cover" />
              </div>
            </div>
            <button 
              onClick={logout}
              className="text-[10px] font-black text-red-500 uppercase tracking-widest mt-1 flex items-center gap-1 hover:text-red-700 transition-colors"
            >
              <LogOut className="w-3 h-3" /> ĐĂNG XUẤT
            </button>
          </div>

          <button 
            onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}
            className={cn(
              "border-2 px-8 py-3.5 rounded-2xl font-black text-sm flex items-center gap-3 transition-all shadow-sm",
              isAiPanelOpen 
                ? "bg-indigo-600 border-indigo-600 text-white" 
                : "bg-white border-indigo-600 text-indigo-600 hover:bg-indigo-50"
            )}
          >
            <Sparkles className={cn("w-5 h-5", isAiPanelOpen ? "fill-white" : "fill-indigo-600")} />
            PHÂN TÍCH KỸ THUẬT AI
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          files={files}
          activeFileId={activeFile?.id ?? null}
          onSelectFile={(file) => {
            setActiveFile(file);
            setMessages([]);
          }}
          onUpload={(file) => setPendingFile(file)}
          onDeleteFile={(file) => setFileToDelete(file)}
          onEditFile={(file) => setFileToEdit(file)}
          isUploading={isUploading}
        />
        
        {pendingFile && (
          <UploadModal
            file={pendingFile}
            onClose={() => setPendingFile(null)}
            onConfirm={handleConfirmUpload}
            isProcessing={isUploading}
            progress={uploadProgress}
            stage={uploadStage}
          />
        )}

        <DeleteConfirmModal 
          isOpen={!!fileToDelete}
          fileName={fileToDelete?.name || ""}
          onClose={() => setFileToDelete(null)}
          onConfirm={handleDeleteFile}
          isDeleting={isActionPending}
        />

        <EditFileModal 
          isOpen={!!fileToEdit}
          fileName={fileToEdit?.name || ""}
          onClose={() => setFileToEdit(null)}
          onSave={handleRenameFile}
          isSaving={isActionPending}
        />
        
        <main className="flex-1 flex flex-row overflow-hidden p-6 pl-0 gap-6">
          <motion.div 
            layout
            className="flex-1 flex flex-col overflow-hidden min-w-0"
          >
            <PDFViewer file={activeFile} onPageChange={handlePageChange} />
          </motion.div>
          
          <AnimatePresence>
            {isAiPanelOpen && (
              <motion.div
                layout
                initial={{ width: 0, opacity: 0, x: 20 }}
                animate={{ width: "650px", opacity: 1, x: 0 }}
                exit={{ width: 0, opacity: 0, x: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="flex flex-col shrink-0 h-full"
              >
                <div className="flex-1 bg-white rounded-[40px] shadow-2xl border border-gray-100 flex flex-col overflow-hidden overflow-y-auto no-scrollbar">
                  <ChatPanel
                    messages={messages}
                    activeFile={activeFile}
                    onSendMessage={handleSendMessage}
                    onExtract={handleExtract}
                    isProcessing={isProcessing}
                    onSync={handleSync}
                    isSyncing={isSyncing}
                    onClose={() => setIsAiPanelOpen(false)}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}


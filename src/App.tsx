/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { Sidebar } from "./components/Sidebar";
import { PDFViewer } from "./components/PDFViewer";
import { ChatPanel } from "./components/ChatPanel";
import { UploadModal } from "./components/UploadModal";
import { PDFFile, Message, ExtractionField, OperationType, PageData, Note } from "./types";
import { chatWithDocument, extractDataFromText } from "./lib/gemini";
import { LayoutGrid, Sparkles, LogOut, Loader2, X, FileText } from "lucide-react";
import { useAuth } from "./components/FirebaseProvider";
import { db } from "./lib/firebase";
import { cn, getApiUrl } from "./lib/utils";
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
import { handleFirestoreError, withFirestoreRetry } from "./lib/firestoreUtils";
import { storage } from "./lib/firebase";
import { DeleteConfirmModal } from "./components/DeleteConfirmModal";
import { EditFileModal } from "./components/EditFileModal";
import { AdminPanelModal } from "./components/AdminPanelModal";
import { QuotaExceededModal } from "./components/QuotaExceededModal";
import { ShieldCheck } from "lucide-react";

export default function App() {
  const { user, profile, loading, loginError, login, logout, incrementApiUsage, setLoginError } = useAuth();
  const [viewMode, setViewMode] = useState<'admin' | 'member'>('member');
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isQuotaExceededModalOpen, setIsQuotaExceededModalOpen] = useState(false);
  const [quotaLimitValue, setQuotaLimitValue] = useState(30);

  const [files, setFiles] = useState<PDFFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const activeFile = files.find(f => f.id === activeFileId) || null;
  const [messages, setMessages] = useState<Message[]>([]);
  const [generalMessages, setGeneralMessages] = useState<Message[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<"uploading" | "extracting" | "done" | "idle">("idle");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<PDFFile | null>(null);
  const [fileToEdit, setFileToEdit] = useState<PDFFile | null>(null);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(true);
  const [isPdfMaximized, setIsPdfMaximized] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);
  const [openedFileIds, setOpenedFileIds] = useState<string[]>([]);
  const [targetPage, setTargetPage] = useState<number | null>(null);
  const [isPdfViewerOpen, setIsPdfViewerOpen] = useState(false);

  // Resizable Slider layout states
  const [chatWidthPercent, setChatWidthPercent] = useState<number>(45); // default 45% for Chat Panel, 55% for PDF Viewer
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Tracking pages currently being processed to prevent duplicate concurrent network fetch operations
  const processingPagesRef = useRef<Set<string>>(new Set());
  const pageChangeTimeoutRef = useRef<any>(null);

  // Set view mode when user / profile loads
  useEffect(() => {
    if (user) {
      const isUserAdmin = profile?.role === 'admin' || user?.email === 'solenc2021@gmail.com';
      setViewMode(isUserAdmin ? 'admin' : 'member');
    }
  }, [profile, user]);

  useEffect(() => {
    if (pageChangeTimeoutRef.current) {
      clearTimeout(pageChangeTimeoutRef.current);
    }
    processingPagesRef.current.clear();
  }, [activeFileId]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newPercent = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      
      // Keep it within reasonable bounds (e.g., 20% to 80%)
      if (newPercent >= 20 && newPercent <= 80) {
        setChatWidthPercent(newPercent);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // Keep activeFileId and files in sync with openedFileIds
  useEffect(() => {
    if (activeFileId && !openedFileIds.includes(activeFileId)) {
      setOpenedFileIds(prev => {
        if (prev.includes(activeFileId)) return prev;
        return [...prev, activeFileId];
      });
    }
  }, [activeFileId, openedFileIds]);

  // Remove files that were deleted or no longer exist in the raw files list
  useEffect(() => {
    if (files.length > 0) {
      const fileIds = files.map(f => f.id);
      setOpenedFileIds(prev => {
        const filtered = prev.filter(id => fileIds.includes(id));
        // Only update state if the array content actually changed
        if (filtered.length === prev.length && filtered.every((val, index) => val === prev[index])) {
          return prev;
        }
        return filtered;
      });
    } else {
      setOpenedFileIds(prev => prev.length === 0 ? prev : []);
    }
  }, [files]);

  // Sync files from Firestore
  useEffect(() => {
    if (!user) {
      setFiles([]);
      return;
    }

    const isAdminUser = profile?.role === "admin" || user?.email === "solenc2021@gmail.com";
    // If Admin and in Admin View Mode, query their own uploaded assets.
    // Otherwise, query public assets (which isPublic == true).
    const q = (isAdminUser && viewMode === "admin")
      ? query(
          collection(db, "files"),
          where("ownerId", "==", user.uid)
        )
      : query(
          collection(db, "files"),
          where("isPublic", "==", true)
        );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedFiles = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as PDFFile[];
      
      // Sort in memory to avoid Firestore composite index requirements
      fetchedFiles.sort((a, b) => (b.uploadDate || 0) - (a.uploadDate || 0));
      
      setFiles(fetchedFiles);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "files");
    });

    return () => unsubscribe();
  }, [user, profile, viewMode]);

  // Self-healing: Ensure existing documents have isPublic = true so they are visible to members
  useEffect(() => {
    const isAdminUser = profile?.role === "admin" || user?.email === "solenc2021@gmail.com";
    if (isAdminUser && files.length > 0 && viewMode === "admin") {
      files.forEach(async (file) => {
        if (file.isPublic === undefined) {
          try {
            const docRef = doc(db, "files", file.id);
            await updateDoc(docRef, { isPublic: true });
            console.log(`[Self-Healing] Automatically marked file as public for members: ${file.name}`);
          } catch (err) {
            console.warn(`[Self-Healing] Failed to set public flag for ${file.name}:`, err);
          }
        }
      });
    }
  }, [files, profile, user, viewMode]);

  const [notes, setNotes] = useState<Note[]>([]);

  // Sync notes from Firestore
  useEffect(() => {
    if (!user) {
      setNotes([]);
      return;
    }

    const q = query(
      collection(db, "notes"),
      where("ownerId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedNotes = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Note[];
      setNotes(fetchedNotes);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "notes");
    });

    return () => unsubscribe();
  }, [user]);

  const getCategoryLabel = (id: string) => {
    switch (id) {
      case "banve": return "Bản vẽ thiết kế";
      case "kientruc": return "Kiến trúc";
      case "ketcau": return "Kết cấu";
      case "ketcau_tcvn": return "TCVN";
      case "ketcau_tcnn": return "TCNN";
      case "mep": return "MEP";
      case "vatlieu": return "Vật liệu";
      case "qckt": return "Quy chuẩn kỹ thuật";
      default: return "Văn bản hiện hành";
    }
  };

  const handleClearTargetPage = useCallback(() => {
    setTargetPage(null);
  }, []);

  const handleToggleMaximize = useCallback(() => {
    setIsAiPanelOpen(prev => !prev);
  }, []);

  const handleClosePdfViewer = useCallback(() => {
    setIsPdfViewerOpen(false);
  }, []);

  const safeFetch = async (url: string, options: RequestInit) => {
    const response = await fetch(getApiUrl(url), options);
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
      
      let textUrl = "";
      if (extractionData.text && user) {
        try {
          console.log("Uploading full plain text to Firebase Storage...");
          const textBlob = new Blob([extractionData.text], { type: "text/plain;charset=utf-8" });
          const textStorageRef = ref(storage, `pdfs/${user.uid}/${fileId}-text.txt`);
          await uploadBytes(textStorageRef, textBlob);
          textUrl = await getDownloadURL(textStorageRef);
          console.log("Uploaded full text to Firebase Storage under URL:", textUrl);
        } catch (storageErr) {
          console.error("Failed to upload full text to Storage:", storageErr);
        }
      }

      await withFirestoreRetry(
        () => updateDoc(doc(db, "files", fileId), {
          text: (extractionData.text || "").substring(0, 100000), 
          textUrl: textUrl || null,
          numpages: extractionData.numpages,
          isAIReady: true,
          extractionMethod: extractionData.extractionMethod,
          geminiFileUri: extractionData.geminiFileUri || null,
          geminiFileName: extractionData.geminiFileName || null,
          // Only mark all pages as processed if we got a good amount of text (at least 150 chars per page on average)
          processedPages: (extractionData.extractionMethod === "pdf-parse" && (extractionData.text?.length || 0) > extractionData.numpages * 150) 
            ? Array.from({length: extractionData.numpages}, (_, i) => i + 1) : []
        }),
        OperationType.UPDATE,
        `files/${fileId}`
      );
      console.log(`Đã hoàn tất phân tích metadata cho file ${fileId}.`);
    } catch (error: any) {
      console.error(`Lỗi trích xuất file ${fileId}:`, error);
    }
  };

  const processSpecificPage = async (fileId: string, url: string, pageNumber: number) => {
    if (!activeFile) return;
    
    // Check if both pageNumber and pageNumber + 1 need processing
    const pagesToProcess = [pageNumber];
    if (pageNumber + 1 <= (activeFile.numpages || 0)) {
      pagesToProcess.push(pageNumber + 1);
    }

    for (const p of pagesToProcess) {
      // Re-check Firestore state for each page to avoid double processing
      if (activeFile.processedPages?.includes(p)) continue;
      
      const pageKey = `${fileId}-${p}`;
      if (processingPagesRef.current.has(pageKey)) {
        console.log(`Page ${p} is already in the processing queue or being processed`);
        continue;
      }
      
      // Lock this page
      processingPagesRef.current.add(pageKey);
      
      try {
        console.log(`Lazy loading OCR for page ${p}...`);
        
        let success = false;
        let pResult: any = null;
        let retries = 3;
        let delayMs = 1000;
        
        while (retries > 0 && !success) {
          try {
            const data = await safeFetch("/api/extract-pages", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fileUrl: url, pages: [p] }),
            });
            
            pResult = data?.pages?.[0];
            if (pResult) {
              success = true;
            } else {
              throw new Error("No page data returned");
            }
          } catch (fetchErr: any) {
            retries--;
            console.warn(`Request to extract page ${p} failed. Retries left: ${retries}. Error: ${fetchErr.message}`);
            if (retries > 0) {
              await new Promise((resolve) => setTimeout(resolve, delayMs));
              delayMs *= 2; 
            } else {
              throw fetchErr; 
            }
          }
        }

        if (pResult && pResult.text) {
          // 1. Save to sub-collection with retry
          const pageData: PageData = {
            fileId,
            pageNumber: p,
            text: pResult.text,
            processedDate: Date.now()
          };
          await withFirestoreRetry(
            () => setDoc(doc(db, "files", fileId, "pages", p.toString()), pageData),
            OperationType.CREATE,
            `files/${fileId}/pages/${p}`
          );

          // 2. Update processedPages and text in main doc with retry
          const docRef = doc(db, "files", fileId);
          const updatedProcessed = Array.from(new Set([...(activeFile.processedPages || []), p]));
          
          await withFirestoreRetry(
            () => updateDoc(docRef, {
              processedPages: updatedProcessed,
              // Appending with markers. Note: This still has race condition risk but better than before.
              text: (activeFile.text + `\n\n--- [BẮT ĐẦU TRANG ${p}] ---\n\n` + pResult.text + `\n\n--- [KẾT THÚC TRANG ${p}] ---\n\n`).substring(0, 1000000) 
            }),
            OperationType.UPDATE,
            `files/${fileId}`
          );
          
          console.log(`Page ${p} OCR completed.`);
        }
      } catch (error: any) {
        console.error(`Error processing page ${p}:`, error.message || error);
      } finally {
        // Unlock this page
        processingPagesRef.current.delete(pageKey);
      }
    }
  };

  const handlePageChange = useCallback((pageNumber: number) => {
    if (!activeFile || activeFile.extractionMethod !== "hybrid-lazy") return;
    
    // Clear any existing page trigger timeout
    if (pageChangeTimeoutRef.current) {
      clearTimeout(pageChangeTimeoutRef.current);
    }
    
    // Debounce processing to handle fast scrolling safely without hammering the network/server
    pageChangeTimeoutRef.current = setTimeout(() => {
      if (!activeFile.processedPages?.includes(pageNumber)) {
        processSpecificPage(activeFile.id, activeFile.url, pageNumber);
      }
    }, 450);
  }, [activeFile, activeFileId]);

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
        ownerId: user.uid,
        isPublic: true
      };

      console.log("Đang lưu thông tin ban đầu vào Firestore...");
      await withFirestoreRetry(
        () => setDoc(doc(db, "files", fileId), newFile),
        OperationType.CREATE,
        `files/${fileId}`
      );
      
      setUploadStage("done");
      setUploadProgress(100);
      
      // Close modal and set active file after a short delay
      setTimeout(() => {
        setPendingFile(null);
        setIsUploading(false);
        setUploadStage("idle");
        setActiveFileId(newFile.id);
        setMessages([]);
        
        // Trigger background processing
        processFile(fileId, downloadURL);
        processSpecificPage(fileId, downloadURL, 1);
      }, 1000);

      console.log("Tải lên thành công. Hệ thống đang tiến hành phân tích nội dung.");
    } catch (error) {
      console.error("Lỗi quy trình tải lên:", error);
      handleFirestoreError(error, OperationType.WRITE, "files");
      setIsUploading(false);
      setUploadStage("idle");
    }
  };

  const handleSendMessage = useCallback(async (content: string, image?: string, isGeneral?: boolean, referencedFileIds?: string[]) => {
    const allowed = await incrementApiUsage();
    if (!allowed) {
      setQuotaLimitValue(profile?.apiLimit || 30);
      setIsQuotaExceededModalOpen(true);
      return;
    }

    if (isGeneral) {
      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        content,
        timestamp: Date.now(),
        image,
      };

      setGeneralMessages((prev) => [...prev, userMsg]);
      setIsProcessing(true);

      try {
        const history = generalMessages.map(m => ({
          role: m.role === "user" ? "user" : "model",
          parts: [{ text: m.content }]
        }));

        let referencedFilesPayload: any[] = [];
        const targetIds = (referencedFileIds && referencedFileIds.length > 0)
          ? referencedFileIds
          : files.map(f => f.id);

        if (targetIds && targetIds.length > 0) {
          referencedFilesPayload = files
            .filter((f) => targetIds.includes(f.id))
            .map((f) => {
              const isExpired = f.uploadDate && (Date.now() - f.uploadDate > 40 * 60 * 60 * 1000);
              return {
                id: f.id,
                geminiFileUri: (f.geminiFileUri && !isExpired) ? f.geminiFileUri : null,
                text: f.text || "",
                textUrl: f.textUrl || null,
                name: f.name,
                url: f.url,
                uploadDate: f.uploadDate
              };
            });
        }

        const result = await chatWithDocument("", content, history, image, undefined, true, referencedFilesPayload);
        const aiResponse = result?.text;

        if (result?.upgradedReferencedFiles && Array.isArray(result.upgradedReferencedFiles)) {
          console.log("[Auto Self-Healing] Received upgraded referenced files. Storing in Firestore...");
          result.upgradedReferencedFiles.forEach((upRef: any) => {
            updateDoc(doc(db, "files", upRef.id), {
              geminiFileUri: upRef.geminiFileUri,
              geminiFileName: upRef.geminiFileName,
              uploadDate: Date.now()
            }).catch((e) => console.error("Auto self-healing database write failed:", e));
          });
        }
        
        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "ai",
          content: aiResponse || "Xin lỗi, tôi gặp trục trặc khi suy nghĩ.",
          timestamp: Date.now(),
        };

        setGeneralMessages((prev) => [...prev, aiMsg]);
      } catch (error: any) {
        console.error("Lỗi AI Chung:", error);
        
        const isQuotaErr = 
          error.message?.includes("HẾT HẠN MỨC") ||
          error.message?.includes("Quota") ||
          error.message?.includes("quota") ||
          error.message?.includes("Billing/Quota") ||
          error.message?.includes("quota exceeded") ||
          error.message?.includes("limit exceeded") ||
          error.message?.includes("429");

        if (isQuotaErr) {
          setQuotaLimitValue(profile?.apiLimit || 30);
          setIsQuotaExceededModalOpen(true);
        }

        const isPermError = 
          error.message?.includes("hết hạn lưu trữ") ||
          error.message?.includes("You do not have permission to access the File") ||
          error.message?.includes("PERMISSION_DENIED") ||
          error.message?.includes("403") ||
          error.message?.includes("permission");

        if (isPermError) {
          const targetIds = (referencedFileIds && referencedFileIds.length > 0)
            ? referencedFileIds
            : files.map(f => f.id);
          
          if (targetIds && targetIds.length > 0) {
            targetIds.forEach(id => {
              updateDoc(doc(db, "files", id), {
                geminiFileUri: null,
                geminiFileName: null
              }).catch(err => console.error(`Failed to clear geminiFileUri for fileId ${id} in Firestore:`, err));
            });
            setFiles(prev => prev.map(f => targetIds.includes(f.id) ? { ...f, geminiFileUri: undefined } : f));
          }
        }

        const errorMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "ai",
          content: isQuotaErr
            ? "⚠️ Hệ thống đã HẾT HẠN MỨC (Quota) yêu cầu tới trí tuệ nhân tạo Gemini ngày hôm nay hoặc chưa cấu hình thanh toán. Vui lòng bấm vào thông báo nâng hạn mức hiển thị trên màn hình hoặc liên hệ Quản trị viên của bạn."
            : isPermError 
              ? "⚠️ Liên kết đệm tạm của Google Gemini đối với tài liệu đã hết hạn (40 giờ). Hệ thống đang tự động khôi phục chạy ngầm từ cơ sở dữ liệu Firebase của bạn. Vui lòng thử lại sau 2-3 giây, bạn HOÀN TOÀN KHÔNG CẦN tải lại tệp từ máy tính."
              : `❌ LỖI HỆ THỐNG: ${error.message || "Không thể kết nối với dịch vụ AI."}\n\n*Gợi ý: Nếu lỗi liên quan đến API Key, hãy kiểm tra bảng Secrets trong AI Studio.*`,
          timestamp: Date.now(),
        };
        setGeneralMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

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

      // On-demand registration if geminiFileUri is missing or expired (> 40h)
      const isExpired = activeFile.uploadDate && (Date.now() - activeFile.uploadDate > 40 * 60 * 60 * 1000);
      let fileUri = (activeFile.geminiFileUri && !isExpired) ? activeFile.geminiFileUri : null;
      if (!fileUri && activeFile.url) {
        try {
          console.log("File is missing or expired Gemini File API representation. Registering/refreshing on-demand...");
          const registration = await safeFetch("/api/register-gemini-file", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileUrl: activeFile.url, filename: activeFile.name })
          });
          if (registration && registration.uri) {
            fileUri = registration.uri;
            // Background update firestore
            updateDoc(doc(db, "files", activeFile.id), {
              geminiFileUri: registration.uri,
              geminiFileName: registration.name || null,
              uploadDate: Date.now()
            }).catch(e => console.error("Failed to update firestore with registered gemini files uri:", e));
          }
        } catch (regErr) {
          console.warn("Failed to register file with Gemini Files API, falling back to text representation:", regErr);
        }
      }

      const result = await chatWithDocument(
        activeFile.text,
        content,
        history,
        image,
        fileUri,
        false,
        undefined,
        activeFile.url,
        activeFile.name,
        activeFile.id,
        activeFile.textUrl
      );
      
      const aiResponse = result?.text;

      if (result?.upgradedFile) {
        console.log("[Auto Self-Healing] Received upgraded active file. Storing in Firestore...");
        const up = result.upgradedFile;
        updateDoc(doc(db, "files", up.fileId), {
          geminiFileUri: up.geminiFileUri,
          geminiFileName: up.geminiFileName,
          uploadDate: Date.now()
        }).catch(e => console.error("Auto self-healing database write failed:", e));
      }
      
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: aiResponse || "Xin lỗi, tôi gặp trục trặc khi suy nghĩ.",
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (error: any) {
      console.error("Lỗi AI:", error);

      const isQuotaErr = 
        error.message?.includes("HẾT HẠN MỨC") ||
        error.message?.includes("Quota") ||
        error.message?.includes("quota") ||
        error.message?.includes("Billing/Quota") ||
        error.message?.includes("quota exceeded") ||
        error.message?.includes("limit exceeded") ||
        error.message?.includes("429");

      if (isQuotaErr) {
        setQuotaLimitValue(profile?.apiLimit || 30);
        setIsQuotaExceededModalOpen(true);
      }

      const isPermError = 
        error.message?.includes("hết hạn lưu trữ") ||
        error.message?.includes("You do not have permission to access the File") ||
        error.message?.includes("PERMISSION_DENIED") ||
        error.message?.includes("403") ||
        error.message?.includes("permission");

      if (isPermError && activeFile) {
        updateDoc(doc(db, "files", activeFile.id), {
          geminiFileUri: null,
          geminiFileName: null
        }).catch(err => console.error(`Failed to clear geminiFileUri for single fileId ${activeFile.id} in Firestore:`, err));

        setFiles(prev => prev.map(f => f.id === activeFile.id ? { ...f, geminiFileUri: undefined } : f));
      }

      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: isQuotaErr
          ? "⚠️ Hệ thống đã HẾT HẠN MỨC (Quota) yêu cầu tới trí tuệ nhân tạo Gemini ngày hôm nay hoặc chưa cấu hình thanh toán. Vui lòng bấm vào thông báo nâng hạn mức hiển thị trên màn hình hoặc liên hệ Quản trị viên của bạn."
          : isPermError 
            ? "⚠️ Liên kết đệm tạm của Google Gemini đối với tài liệu đã hết hạn (40 giờ). Hệ thống đang tự động khôi phục chạy ngầm từ cơ sở dữ liệu Firebase của bạn. Vui lòng thử lại sau 2-3 giây, bạn HOÀN TOÀN KHÔNG CẦN tải lại tệp từ máy tính."
            : `❌ LỖI HỆ THỐNG: ${error.message || "Không thể kết nối với dịch vụ AI."}\n\n*Gợi ý: Nếu lỗi liên quan đến API Key, hãy kiểm tra bảng Secrets trong AI Studio.*`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
    }
  }, [activeFile, messages, generalMessages, files, incrementApiUsage, profile]);

  const handleExtract = useCallback(async (fields: ExtractionField[]) => {
    if (!activeFile) return null;

    const allowed = await incrementApiUsage();
    if (!allowed) {
      setQuotaLimitValue(profile?.apiLimit || 30);
      setIsQuotaExceededModalOpen(true);
      return null;
    }

    // On-demand registration if geminiFileUri is missing or expired (> 40h)
    const isExpired = activeFile.uploadDate && (Date.now() - activeFile.uploadDate > 40 * 60 * 60 * 1000);
    let fileUri = (activeFile.geminiFileUri && !isExpired) ? activeFile.geminiFileUri : null;
    if (!fileUri && activeFile.url) {
      try {
        console.log("File is missing or expired Gemini File API representation during extraction. Registering/refreshing on-demand...");
        const registration = await safeFetch("/api/register-gemini-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileUrl: activeFile.url, filename: activeFile.name })
        });
        if (registration && registration.uri) {
          fileUri = registration.uri;
          // Background update firestore
          updateDoc(doc(db, "files", activeFile.id), {
            geminiFileUri: registration.uri,
            geminiFileName: registration.name || null
          }).catch(e => console.error("Failed to update firestore with registered gemini files uri:", e));
        }
      } catch (regErr) {
        console.warn("Failed to register file with Gemini Files API for extraction, falling back to text:", regErr);
      }
    }

    const result = await extractDataFromText(activeFile.text, fields, fileUri, activeFile.id, activeFile.url, activeFile.name);
    if (result && result.upgradedFile) {
      console.log("[Auto Self-Healing] Received upgraded active file during extract. Storing in Firestore...");
      const up = result.upgradedFile;
      updateDoc(doc(db, "files", up.fileId), {
        geminiFileUri: up.geminiFileUri,
        geminiFileName: up.geminiFileName
      }).catch(e => console.error("Auto self-healing database write failed:", e));
    }
    return result?.data || result;
  }, [activeFile, incrementApiUsage, profile, safeFetch]);

  const handleCheckQuota = useCallback(async (): Promise<boolean> => {
    const allowed = await incrementApiUsage();
    if (!allowed) {
      setQuotaLimitValue(profile?.apiLimit || 30);
      setIsQuotaExceededModalOpen(true);
      return false;
    }
    return true;
  }, [incrementApiUsage, profile]);

  const handleSync = useCallback(async (data: any) => {
    if (!activeFile || !user) return;
    setIsSyncing(true);
    try {
      // Update data in Firestore with retry
      const fileRef = doc(db, "files", activeFile.id);
      await withFirestoreRetry(
        () => updateDoc(fileRef, {
          extractedData: data
        }),
        OperationType.UPDATE,
        `files/${activeFile.id}`
      );

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

  const handleRegisterGeminiFile = useCallback(async (geminiFileUri: string, geminiFileName: string) => {
    if (!activeFileId) return;
    try {
      await withFirestoreRetry(
        () => updateDoc(doc(db, "files", activeFileId), {
          geminiFileUri,
          geminiFileName,
          isAIReady: true
        }),
        OperationType.UPDATE,
        `files/${activeFileId}`
      );
      console.log(`Đã cập nhật Gemini File API URI thành công cho file ${activeFileId}`);
    } catch (err) {
      console.error("Lỗi cập nhật Firestore Gemini File API URI:", err);
    }
  }, [activeFileId]);

  const handleUpdateFile = useCallback(async (fileId: string, data: Partial<PDFFile>) => {
    try {
      await withFirestoreRetry(
        () => updateDoc(doc(db, "files", fileId), data as any),
        OperationType.UPDATE,
        `files/${fileId}`
      );
      console.log(`Đã cập nhật trạng thái đồng bộ cho file ${fileId}`);
    } catch (err) {
      console.error("Lỗi cập nhật Firestore cho file:", err);
    }
  }, []);

  const handleSaveNote = useCallback(async (content: string) => {
    if (!user) return;
    const noteId = "note_" + Date.now();
    try {
      const noteData: Note = {
        id: noteId,
        content,
        fileId: activeFile ? activeFile.id : "general",
        fileName: activeFile ? activeFile.name : "Hỏi đáp chung",
        ownerId: user.uid,
        createdAt: Date.now()
      };
      await withFirestoreRetry(
        () => setDoc(doc(db, "notes", noteId), noteData),
        OperationType.CREATE,
        `notes/${noteId}`
      );
      console.log(`Đã lưu ghi chú thành công: ${noteId}`);
    } catch (err: any) {
      console.error("Lỗi khi lưu ghi chú vào Firestore:", err);
      handleFirestoreError(err, OperationType.CREATE, `notes/${noteId}`);
    }
  }, [user, activeFile]);

  const handleDeleteNote = useCallback(async (noteId: string) => {
    if (!user) return;
    try {
      await withFirestoreRetry(
        () => deleteDoc(doc(db, "notes", noteId)),
        OperationType.DELETE,
        `notes/${noteId}`
      );
      console.log(`Đã xóa ghi chú thành công: ${noteId}`);
    } catch (err: any) {
      console.error("Lỗi khi xóa ghi chú trong Firestore:", err);
      handleFirestoreError(err, OperationType.DELETE, `notes/${noteId}`);
    }
  }, [user]);

  const handleDeleteFile = async () => {
    if (!fileToDelete || !user) return;
    setIsActionPending(true);
    try {
      // 1. Delete from Firestore with retry
      await withFirestoreRetry(
        () => deleteDoc(doc(db, "files", fileToDelete.id)),
        OperationType.DELETE,
        `files/${fileToDelete.id}`
      );

      // 2. Delete from Storage (if url exists and is internal)
      if (fileToDelete.url && fileToDelete.url.includes("firebasestorage.googleapis.com")) {
        // Extract storage path from download URL or use a structured path if known
        // Since we know the structure: `pdfs/${user.uid}/${fileId}-${pendingFile.name}`
        const storagePath = `pdfs/${user.uid}/${fileToDelete.id}-${fileToDelete.name}`;
        const fileRef = ref(storage, storagePath);
        await deleteObject(fileRef).catch(err => console.error("Storage delete failed:", err));
      }

      if (activeFileId === fileToDelete.id) {
        setActiveFileId(null);
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
      await withFirestoreRetry(
        () => updateDoc(fileRef, {
          name: newName
        }),
        OperationType.UPDATE,
        `files/${fileToEdit.id}`
      );
      
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
    const isUnauthorizedDomain = loginError?.includes("unauthorized-domain") || loginError?.includes("Tên miền");

    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#ebeff4] font-sans p-6 overflow-y-auto">
        <div className="max-w-md w-full bg-white rounded-[32px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.08)] p-10 border border-gray-200/60 flex flex-col items-center text-center my-8">
          <div className="w-20 h-20 bg-gray-900 rounded-[32px] flex items-center justify-center mb-8 shadow-xl">
            <LayoutGrid className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight mb-4">
            Library Engine <span className="text-indigo-600">v3</span>
          </h1>
          <p className="text-gray-400 text-sm font-bold uppercase tracking-widest leading-relaxed mb-8">
            Hệ thống quản lý tài liệu kỹ thuật<br/>thế hệ mới của Kỹ sư trạm
          </p>

          <button 
            onClick={login}
            className="w-full py-5 bg-indigo-600 text-white rounded-[24px] font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-4 group cursor-pointer"
          >
            ĐĂNG NHẬP VỚI GOOGLE
          </button>

          {loginError && (
            <div className="mt-6 w-full text-left bg-red-50 border border-red-200/60 rounded-[20px] p-5 shadow-inner">
              <div className="flex items-center gap-2 text-red-600 font-black text-[10px] uppercase tracking-widest mb-2.5">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                LỖI ĐĂNG NHẬP FIREBASE
              </div>
              <p className="text-red-700 text-xs font-bold leading-relaxed mb-4">
                {loginError}
              </p>

              {isUnauthorizedDomain && (
                <div className="bg-white/60 p-4 rounded-xl border border-red-150/50 text-[11px] text-slate-600 leading-relaxed font-medium">
                  <p className="font-extrabold text-slate-800 uppercase text-[10px] tracking-wider mb-2 text-indigo-600">
                    Cách khắc phục nhanh (Chỉ Thêm 1 Lần):
                  </p>
                  <ol className="list-decimal pl-4.5 space-y-1.5 font-semibold text-slate-700">
                    <li>Vào <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-indigo-600 underline font-bold">Firebase Console</a> dứ án <code className="bg-slate-100 px-1 rounded">thuviennoibo</code>.</li>
                    <li>Vào mục <span className="font-bold text-slate-800">Authentication</span> → Chọn tab <span className="font-bold text-slate-800">Settings</span>.</li>
                    <li>Chọn dòng <span className="font-bold text-slate-800">Authorized domains (Miền được ủy quyền)</span>.</li>
                    <li>Nhấn <span className="font-bold text-slate-800">Add domain</span> và thêm miền sau:</li>
                  </ol>
                  <div className="mt-2.5 flex flex-col gap-1">
                    <code className="block bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg text-[10px] font-bold font-mono border border-indigo-100 select-all">
                      solenc2021.github.io
                    </code>
                    {window.location.hostname && window.location.hostname !== "solenc2021.github.io" && (
                      <code className="block bg-amber-50 text-amber-600 px-3 py-1 rounded-lg text-[10px] font-bold font-mono border border-amber-100 select-all">
                        {window.location.hostname}
                      </code>
                    )}
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 mt-2.5 italic">
                    * Sau khi Thêm xong, hãy tải lại trang này và thử Đăng nhập lại!
                  </p>
                </div>
              )}
            </div>
          )}

          <p className="mt-8 text-[10px] text-gray-300 font-bold uppercase tracking-widest">
            BẢO MẬT BỞI GOOGLE CLOUD PLATFORM
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-[#ebeff4] overflow-hidden">
      {/* Top Header */}
      <header className="h-20 bg-white border-b border-gray-200/60 flex items-center justify-between px-8 shrink-0 z-30 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
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
          {/* Segmented Mode Picker for Admin previewing */}
          {(profile?.role === 'admin' || user?.email === 'solenc2021@gmail.com') ? (
            <div className="flex bg-[#f1f4f8] p-1.5 rounded-2xl border border-gray-200/50 gap-1 select-none shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.03)] mr-2">
              <button
                onClick={() => {
                  setViewMode('admin');
                  setActiveFileId(null);
                  setMessages([]);
                }}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 flex items-center gap-1.5 cursor-pointer",
                  viewMode === 'admin'
                    ? "bg-white text-gray-900 border border-gray-200/60 shadow-xs"
                    : "text-gray-400 hover:text-gray-650"
                )}
                title="Xem giao diện và thao tác Quản trị viên"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                Quản trị viên
              </button>
              <button
                onClick={() => {
                  setViewMode('member');
                  setActiveFileId(null);
                  setMessages([]);
                }}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 flex items-center gap-1.5 cursor-pointer",
                  viewMode === 'member'
                    ? "bg-white text-emerald-700 border border-emerald-100 shadow-xs"
                    : "text-gray-400 hover:text-gray-650"
                )}
                title="Xem giao diện cổng Thành viên"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-500" />
                Thành viên
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3.5 py-2.5 bg-emerald-50/70 border border-emerald-150/40 rounded-2xl text-[10px] font-black uppercase tracking-widest text-[#009688] mr-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              CỔNG THÀNH VIÊN
            </div>
          )}

          {viewMode === 'admin' && (profile?.role === 'admin' || user?.email === 'solenc2021@gmail.com') && (
            <button
              onClick={() => setIsAdminModalOpen(true)}
              className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl font-extrabold text-[11px] uppercase tracking-wider flex items-center gap-2 transition-all duration-300 border border-amber-600 shadow-sm cursor-pointer"
              title="Mở bảng điều khiển kiểm soát nội bộ"
            >
              <ShieldCheck className="w-4 h-4" />
              QUẢN TRỊ VIÊN ✦
            </button>
          )}

          <button 
            onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}
            className={cn(
              "px-4 py-2 rounded-xl font-extrabold text-[11px] uppercase tracking-wider flex items-center gap-2 transition-all duration-300 border shadow-sm cursor-pointer",
              isAiPanelOpen 
                ? "bg-indigo-600 border-indigo-600 text-white shadow-[0_4px_12px_rgba(79,70,229,0.18)] hover:bg-indigo-700 hover:border-indigo-700" 
                : "bg-white border-gray-200 text-indigo-600 hover:bg-indigo-50/40"
            )}
            title="Bật/Tắt khung phân tích AI"
          >
            <Sparkles className={cn("w-4 h-4", isAiPanelOpen ? "fill-white text-white" : "fill-indigo-600 text-indigo-600")} />
            {isAiPanelOpen ? "ẨN PHÂN TÍCH AI ✦" : "HIỂN THỊ TRUY VẤN AI ✦"}
          </button>

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
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
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
        
        <main className="flex-1 flex flex-col overflow-hidden p-6 gap-4">
          {/* Opened Document Tabs Bar on top of main workspace */}
          {openedFileIds.length > 0 && (
            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-1 shrink-0 select-none animate-in fade-in duration-300">
              {openedFileIds.map((fileId) => {
                const tabFile = files.find((f) => f.id === fileId);
                if (!tabFile) return null;
                const isActive = activeFileId === fileId;
                return (
                  <div
                    key={fileId}
                    onClick={() => {
                      setActiveFileId(fileId);
                      setMessages([]);
                      setIsPdfViewerOpen(true); // Click selects and pops open PDF
                    }}
                    className={cn(
                      "flex items-center gap-2.5 px-5 py-2.5 rounded-2xl border transition-all duration-250 cursor-pointer text-xs font-bold shrink-0 shadow-sm",
                      isActive
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-600/15"
                        : "bg-white text-gray-500 hover:text-gray-950 hover:bg-gray-50 border-gray-150"
                    )}
                  >
                    <FileText className={cn("w-4 h-4 shrink-0", isActive ? "text-indigo-200" : "text-gray-400")} />
                    <span className="max-w-[200px] truncate">{tabFile.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const index = openedFileIds.indexOf(fileId);
                        const newOpened = openedFileIds.filter((id) => id !== fileId);
                        setOpenedFileIds(newOpened);
                        if (isActive) {
                          if (newOpened.length > 0) {
                            const nextActiveIndex = Math.min(index, newOpened.length - 1);
                            setActiveFileId(newOpened[nextActiveIndex]);
                          } else {
                            setActiveFileId(null);
                          }
                          setMessages([]);
                        }
                      }}
                      className={cn(
                        "p-0.5 rounded-md hover:bg-black/10 transition-colors shrink-0 ml-1",
                        isActive ? "text-indigo-200 hover:text-white" : "text-gray-400 hover:text-gray-700"
                      )}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div ref={containerRef} className="flex-1 flex flex-row overflow-hidden min-h-0 relative">
            <AnimatePresence>
              {isAiPanelOpen && (
                <motion.div
                  layout
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ 
                    width: isPdfViewerOpen && activeFile ? `${chatWidthPercent}%` : "100%", 
                    minWidth: isPdfViewerOpen && activeFile ? "280px" : "100%",
                    opacity: 1 
                  }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={isDragging ? { type: "tween", duration: 0 } : { type: "spring", damping: 25, stiffness: 180 }}
                  className="bg-white rounded-[28px] shadow-[0_24px_55px_rgba(0,0,0,0.07),0_2px_6px_rgba(0,0,0,0.02)] border border-gray-200/70 flex flex-col overflow-hidden h-full relative z-30"
                >
                  <ChatPanel
                    messages={messages}
                    generalMessages={generalMessages}
                    activeFile={activeFile}
                    onSendMessage={handleSendMessage}
                    onExtract={handleExtract}
                    isProcessing={isProcessing}
                    onSync={handleSync}
                    isSyncing={isSyncing}
                    onRegisterGeminiFile={handleRegisterGeminiFile}
                    notes={notes}
                    onSaveNote={handleSaveNote}
                    onDeleteNote={handleDeleteNote}
                    allFiles={files}
                    onUpdateFile={handleUpdateFile}
                    onSelectFile={(fileId, pageNum) => {
                      setActiveFileId(fileId);
                      if (pageNum) {
                        setTargetPage(pageNum);
                      }
                      setIsPdfViewerOpen(true); // Open inline panel on chat select or snippet click
                    }}
                    onClose={() => setIsAiPanelOpen(false)}
                    isPdfViewerOpen={isPdfViewerOpen}
                    onTogglePdfViewer={() => setIsPdfViewerOpen(!isPdfViewerOpen)}
                    onCheckQuota={handleCheckQuota}
                    viewMode={viewMode}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Floating button to restore AI panel if user closed it */}
            <AnimatePresence>
              {!isAiPanelOpen && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8, x: -10 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.8, x: -10 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsAiPanelOpen(true)}
                  className="absolute bottom-6 left-6 z-40 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3.5 rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center gap-2 shadow-xl shadow-indigo-600/30 transition-all border border-indigo-500 cursor-pointer animate-pulse"
                  title="Mở rộng khung truy vấn AI"
                >
                  <Sparkles className="w-4 h-4 fill-white" />
                  MỞ RỘNG TRUY VẤN AI ✦
                </motion.button>
              )}
            </AnimatePresence>

            {/* Draggable slider resizer bar between Chat and PDF */}
            {isAiPanelOpen && isPdfViewerOpen && activeFile && (
              <div
                onMouseDown={() => setIsDragging(true)}
                className={cn(
                  "w-2 hover:w-3 bg-gray-100/50 hover:bg-indigo-400 cursor-col-resize flex items-center justify-center transition-all shrink-0 h-full rounded-2xl group select-none relative z-20 border-l border-r border-gray-100",
                  isDragging && "bg-indigo-500 w-3"
                )}
                title="Kéo sang trái hoặc phải để điều chỉnh kích thước"
              >
                <div className="w-1.5 h-10 bg-gray-300 group-hover:bg-white rounded-full transition-colors flex flex-col items-center justify-between py-1.5 shadow-sm">
                  <div className="w-1 h-1 bg-gray-400 group-hover:bg-indigo-500 rounded-full"></div>
                  <div className="w-1 h-1 bg-gray-400 group-hover:bg-indigo-500 rounded-full"></div>
                  <div className="w-1 h-1 bg-gray-400 group-hover:bg-indigo-500 rounded-full"></div>
                </div>
              </div>
            )}

            <AnimatePresence>
              {isPdfViewerOpen && activeFile && (
                <motion.div
                  layout
                  initial={{ width: 0, opacity: 0, x: 60 }}
                  animate={{ 
                    width: isAiPanelOpen ? `${100 - chatWidthPercent}%` : "100%", 
                    opacity: 1, 
                    x: 0 
                  }}
                  exit={{ width: 0, opacity: 0, x: 60 }}
                  transition={isDragging ? { type: "tween", duration: 0 } : { type: "spring", damping: 25, stiffness: 180 }}
                  className="h-full flex flex-col overflow-hidden min-w-[280px] relative z-20"
                >
                  <PDFViewer 
                    file={activeFile} 
                    onPageChange={handlePageChange} 
                    targetPage={targetPage}
                    onClearTargetPage={handleClearTargetPage}
                    isMaximized={!isAiPanelOpen}
                    onToggleMaximize={handleToggleMaximize}
                    onClose={handleClosePdfViewer}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        <Sidebar
          files={files}
          activeFileId={activeFileId}
          onSelectFile={(file) => {
            setActiveFileId(file.id);
            setMessages([]);
            setIsPdfViewerOpen(true); // Open inline screen on sidebar click
          }}
          onUpload={(file) => setPendingFile(file)}
          onDeleteFile={(file) => setFileToDelete(file)}
          onEditFile={(file) => setFileToEdit(file)}
          isUploading={isUploading}
          viewMode={viewMode}
        />
      </div>

      <AdminPanelModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        currentAdminEmail={user?.email || ""}
      />

      <QuotaExceededModal
        isOpen={isQuotaExceededModalOpen}
        onClose={() => setIsQuotaExceededModalOpen(false)}
        limit={quotaLimitValue}
      />
    </div>
  );
}


import React, { useState, useEffect } from "react";
import { 
  X, ShieldCheck, Mail, Sliders, Users, 
  RefreshCcw, ArrowUp, ArrowDown, UserPlus, 
  Search, Check, ShieldAlert, Award
} from "lucide-react";
import { 
  collection, query, orderBy, getDocs, 
  doc, updateDoc 
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { UserProfile } from "./FirebaseProvider";
import { cn } from "../lib/utils";

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAdminEmail: string;
}

export function AdminPanelModal({ isOpen, onClose, currentAdminEmail }: AdminPanelModalProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    const fetchUsers = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
        console.log("[AdminPanelModal] Fetching system users list via getDocs ONE-TIME...");
        const snapshot = await getDocs(q);
        const uList = snapshot.docs.map(doc => ({
          ...doc.data(),
          uid: doc.id
        })) as UserProfile[];
        setUsers(uList);
      } catch (error) {
        console.error("Failed to fetch department users:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [isOpen, trigger]);

  if (!isOpen) return null;

  // Filter users based on search
  const filteredUsers = users.filter(usr => {
    const term = searchTerm.toLowerCase();
    return (
      (usr.displayName || "").toLowerCase().includes(term) ||
      (usr.email || "").toLowerCase().includes(term)
    );
  });

  // Calculate statistics
  const totalUsersCount = users.length;
  const totalRequestsToday = users.reduce((sum, u) => sum + (u.apiUsageCount || 0), 0);
  const adminUsersCount = users.filter(u => u.role === "admin").length;

  // Handler functions to talk to Firestore
  const handleUpdateLimit = async (userId: string, newLimit: number) => {
    try {
      setUpdatingId(userId);
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        apiLimit: newLimit
      });
      setTrigger(prev => prev + 1); // Refresh user list immediately after change succeeds
    } catch (err) {
      console.error("API Limit update failed:", err);
      alert("Không có quyền cập nhật hoặc gặp lỗi kết nối.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleResetCount = async (userId: string) => {
    try {
      setUpdatingId(userId);
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        apiUsageCount: 0
      });
      setTrigger(prev => prev + 1); // Refresh user list immediately after change succeeds
    } catch (err) {
      console.error("API Usage reset failed:", err);
      alert("Không có quyền đặt lại.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleToggleRole = async (userId: string, currentRole: 'admin' | 'user') => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    const newLimit = newRole === 'admin' ? 999999 : 30; // Auto-set limits based on role
    
    try {
      setUpdatingId(userId);
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        role: newRole,
        apiLimit: newLimit
      });
      setTrigger(prev => prev + 1); // Refresh user list immediately after change succeeds
    } catch (err) {
      console.error("Role toggle failed:", err);
      alert("Lỗi khi chuyển đổi vai trò.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      {/* Content Container */}
      <div className="relative bg-[#f8fafc] rounded-[32px] max-w-4xl w-full h-[85vh] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.18)] border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 font-sans">
        
        {/* Header */}
        <div className="px-8 py-6 bg-white border-b border-slate-150 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-md shadow-indigo-600/10">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight leading-none">KIỂM SOÁT HẠN MỨC NỘI BỘ</h2>
              <p className="text-[10px] font-bold text-indigo-600 mt-1.5 uppercase tracking-wider">Hệ thống phân quyền & quản trị Gemini AI phòng ban</p>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4 px-8 py-5 bg-white border-b border-slate-100 shrink-0">
          <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-150/40 flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center border border-indigo-100/30">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">THÀNH VIÊN</p>
              <p className="text-lg font-black text-slate-800 mt-0.5">{totalUsersCount}</p>
            </div>
          </div>

          <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-150/40 flex items-center gap-4">
            <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center border border-amber-100/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">QUẢN TRI VIÊN</p>
              <p className="text-lg font-black text-slate-800 mt-0.5">{adminUsersCount}</p>
            </div>
          </div>

          <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-150/40 flex items-center gap-4">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center border border-emerald-100/30">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">YÊU CẦU HÔM NAY</p>
              <p className="text-lg font-black text-slate-800 mt-0.5">{totalRequestsToday} lượt</p>
            </div>
          </div>
        </div>

        {/* Content Action / Search */}
        <div className="px-8 py-4 bg-white border-b border-slate-100 flex items-center gap-4 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-4.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
            <input 
              type="text"
              placeholder="TÌM KIẾM THÀNH VIÊN THEO TÊN HOẶC EMAIL..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#f1f5f9] border border-transparent rounded-2xl py-3.5 pl-12 pr-6 text-xs font-bold tracking-wider text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-indigo-400 transition-all outline-none"
            />
          </div>
        </div>

        {/* List Areas */}
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
          {loading ? (
            <div className="h-48 w-full flex flex-col items-center justify-center gap-3">
              <RefreshCcw className="w-8 h-8 text-indigo-600 animate-spin" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Đang kết nối danh sách nội bộ...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="h-48 w-full bg-white rounded-[24px] border border-slate-200/80 flex flex-col items-center justify-center p-8 text-center shadow-xs">
              <ShieldAlert className="w-10 h-10 text-slate-400 mb-2" />
              <p className="text-slate-500 font-bold text-sm">Không tìm thấy thành viên nào khớp với từ khóa.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredUsers.map((usr) => {
                const isAdmin = usr.role === "admin";
                const isSuperAdmin = usr.email === "solenc2021@gmail.com";
                const usageRatio = Math.min((usr.apiUsageCount || 0) / (usr.apiLimit || 30), 1) * 100;
                const isOverLimit = (usr.apiUsageCount || 0) >= (usr.apiLimit || 30) && !isAdmin;
                const isUpdating = updatingId === usr.uid;

                return (
                  <div 
                    key={usr.uid} 
                    className={cn(
                      "bg-white rounded-[24px] border p-6 transition-all shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-[0_8px_20px_-4px_rgba(0,0,0,0.03)] duration-200 relative overflow-hidden",
                      isOverLimit ? "border-amber-200/80 bg-amber-50/5" : "border-slate-150"
                    )}
                  >
                    {/* Inline loader shield */}
                    {isUpdating && (
                      <div className="absolute inset-0 bg-white/70 backdrop-blur-xs flex items-center justify-center z-10 transition-all">
                        <RefreshCcw className="w-6 h-6 text-indigo-600 animate-spin" />
                      </div>
                    )}

                    {/* Left: User Metadata Info */}
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="w-12 h-12 rounded-full border-2 border-white shadow-sm overflow-hidden shrink-0 bg-slate-100">
                        <img 
                          src={usr.photoURL || `https://ui-avatars.com/api/?name=${usr.displayName || "Admin"}&background=4f46e5&color=fff`} 
                          alt="Avatar" 
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover" 
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-slate-800 text-sm truncate max-w-[200px]">{usr.displayName || "Thành viên"}</span>
                          {isAdmin ? (
                            <span className="px-2 py-0.5 bg-amber-500 text-white text-[8px] font-black uppercase tracking-widest rounded-md flex items-center gap-0.5 shadow-sm shadow-amber-500/10">
                              <Award className="w-2.5 h-2.5 fill-white" />
                              AD
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[8px] font-black uppercase tracking-widest rounded-md border border-slate-205/35">
                              MEMBER
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold tracking-tight mt-1 truncate">{usr.email}</p>
                      </div>
                    </div>

                    {/* Middle: Quota details & Progress indicators */}
                    <div className="flex-1 max-w-sm shrink-0">
                      <div className="flex items-center justify-between mb-1.5 font-sans">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">TIẾN TRÌNH YÊU CẦU</span>
                        <span className={cn(
                          "text-[10px] font-black uppercase tracking-wider",
                          isOverLimit ? "text-red-500" : (isAdmin ? "text-amber-500" : "text-indigo-600")
                        )}>
                          {isAdmin ? "VÔ HẠN" : `${usr.apiUsageCount || 0} / ${usr.apiLimit || 30}`}
                        </span>
                      </div>
                      
                      {/* Bar indicator */}
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-150/40">
                        <div 
                          className={cn(
                            "h-full rounded-full transition-all duration-305",
                            isAdmin 
                              ? "w-full bg-slate-400" 
                              : (isOverLimit ? "bg-red-500" : "bg-indigo-600")
                          )}
                          style={{ width: isAdmin ? "100%" : `${usageRatio}%` }}
                        />
                      </div>
                    </div>

                    {/* Right: Controller tools */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      
                      {/* Quota adjustments */}
                      {!isAdmin && (
                        <div className="flex items-center p-1 bg-slate-50 border border-slate-150 rounded-xl shadow-xs">
                          <button 
                            onClick={() => handleUpdateLimit(usr.uid, Math.max(1, (usr.apiLimit || 30) - 10))}
                            className="p-1.5 hover:bg-white text-slate-500 hover:text-slate-700 rounded-lg transition-all border border-transparent hover:border-slate-150 cursor-pointer active:scale-95"
                            title="Giảm 10 hạn mức"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          
                          <span className="px-3 text-xs font-black font-mono text-slate-750">
                            {usr.apiLimit || 30}
                          </span>

                          <button 
                            onClick={() => handleUpdateLimit(usr.uid, (usr.apiLimit || 30) + 15)}
                            className="p-1.5 hover:bg-white text-slate-500 hover:text-slate-705 rounded-lg transition-all border border-transparent hover:border-slate-150 cursor-pointer active:scale-95"
                            title="Tăng 15 hạn mức"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Presets if they are not admin */}
                      {!isAdmin && (
                        <select 
                          value={usr.apiLimit || 30}
                          onChange={(e) => handleUpdateLimit(usr.uid, Number(e.target.value))}
                          className="px-2 py-2 text-xs font-extrabold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl outline-none cursor-pointer tracking-wider"
                          title="Hạn mức chuẩn"
                        >
                          <option value="15">15 (Mặc định)</option>
                          <option value="30">30 (Ổn định)</option>
                          <option value="50">50 (Bận rộn)</option>
                          <option value="100">100 (Power)</option>
                        </select>
                      )}

                      {/* Reset Daily Counter to 0 */}
                      <button 
                        onClick={() => handleResetCount(usr.uid)}
                        disabled={usr.apiUsageCount === 0}
                        className={cn(
                          "p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center active:scale-95",
                          usr.apiUsageCount === 0 
                            ? "bg-slate-50 text-slate-300 border-slate-150 opacity-40 cursor-not-allowed" 
                            : "bg-indigo-50 border-indigo-150 text-indigo-600 hover:bg-indigo-600 hover:text-white"
                        )}
                        title="Đặt lại lượt yêu cầu hôm nay về 0"
                      >
                        <RefreshCcw className="w-4 h-4 animate-spin-hover" />
                      </button>

                      {/* Toggle Admin role */}
                      <button 
                        onClick={() => handleToggleRole(usr.uid, usr.role)}
                        disabled={isSuperAdmin} // Super Admin cannot demote themselves to avoid locking room
                        className={cn(
                          "px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl border transition-all cursor-pointer",
                          isSuperAdmin 
                            ? "bg-slate-105 border-slate-150 text-slate-300 cursor-not-allowed" 
                            : (isAdmin 
                                ? "bg-red-50 border-red-150 text-red-500 hover:bg-red-600 hover:text-white" 
                                : "bg-amber-50 border-amber-150 text-amber-500 hover:bg-amber-500 hover:text-white"
                              )
                        )}
                        title={isAdmin ? "Hạ quyền xuống thành viên" : "Thăng quyền Quản trị viên"}
                      >
                        {isAdmin ? "Hạ quyền" : "Thăng Admin"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Footer info badge */}
        <div className="px-8 py-4 bg-slate-50 border-t border-slate-150 flex items-center justify-between shrink-0 font-sans">
          <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">TỰ ĐỘNG LƯU TRÊN FIREBASE FIRESTORE CLOUD</p>
          <span className="text-[10px] text-slate-400 font-bold">Quản trị cấp cao: {currentAdminEmail}</span>
        </div>
      </div>
    </div>
  );
}

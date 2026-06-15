import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User 
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { withFirestoreRetry } from '../lib/firestoreUtils';
import { OperationType } from '../types';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  createdAt: string;
  role: 'admin' | 'user';
  apiLimit: number;
  apiUsageCount: number;
  lastRequestDate: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  loginError: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  incrementApiUsage: () => Promise<boolean>;
  setLoginError: (err: string | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          // Sync user to Firestore using the retry mechanism
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await withFirestoreRetry(
            () => getDoc(userRef),
            OperationType.GET,
            `users/${firebaseUser.uid}`
          );
          
          const isDefaultAdmin = firebaseUser.email === 'solenc2021@gmail.com';
          const todayStr = new Date().toLocaleDateString('vi-VN');
          
          if (!userSnap.exists()) {
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || 'Kỹ sư',
              photoURL: firebaseUser.photoURL || '',
              createdAt: new Date().toISOString(),
              role: isDefaultAdmin ? 'admin' : 'user',
              apiLimit: isDefaultAdmin ? 999999 : 30, // Default daily limit of 30 requests
              apiUsageCount: 0,
              lastRequestDate: todayStr
            };
            
            await withFirestoreRetry(
              () => setDoc(userRef, newProfile),
              OperationType.CREATE,
              `users/${firebaseUser.uid}`
            );
            setProfile(newProfile);
          } else {
            // Self-healing migration checking and updating
            const existingData = userSnap.data() as any;
            let needsUpdate = false;
            const updatedPayload: Partial<UserProfile> = {};

            if (!existingData.role) {
              updatedPayload.role = isDefaultAdmin ? 'admin' : 'user';
              needsUpdate = true;
            }
            if (existingData.apiLimit === undefined) {
              updatedPayload.apiLimit = isDefaultAdmin ? 999999 : 30;
              needsUpdate = true;
            }
            if (existingData.apiUsageCount === undefined) {
              updatedPayload.apiUsageCount = 0;
              needsUpdate = true;
            }
            if (existingData.lastRequestDate === undefined) {
              updatedPayload.lastRequestDate = todayStr;
              needsUpdate = true;
            }

            if (needsUpdate) {
              await withFirestoreRetry(
                () => updateDoc(userRef, updatedPayload),
                OperationType.UPDATE,
                `users/${firebaseUser.uid}`
              );
              setProfile({ ...existingData, ...updatedPayload } as UserProfile);
            } else {
              setProfile(existingData as UserProfile);
            }
          }

          // 1. Load settings for dynamic backend API URL (For all users)
          try {
            const apiRef = doc(db, 'settings', 'api');
            const apiSnap = await getDoc(apiRef);
            if (apiSnap.exists()) {
              const apiData = apiSnap.data();
              if (apiData.url) {
                const loadedUrl = apiData.url;
                // Only load and cache if the loaded URL is a valid public container URL belonging to this project
                if (
                  loadedUrl && 
                  loadedUrl.includes("rcoaoicqj56hwshueq7jte") &&
                  !loadedUrl.includes("localhost") && 
                  !loadedUrl.includes("127.0.0.1") && 
                  !loadedUrl.includes("-dev-")
                ) {
                  const { setDynamicApiUrl } = await import('../lib/utils');
                  setDynamicApiUrl(loadedUrl);
                  console.log("[Dynamic API] Loaded active backend API URL from Firestore settings:", loadedUrl);
                } else {
                  console.warn("[Dynamic API] Ignored loaded api.url due to mismatch with current project instance:", loadedUrl);
                }
              }
            }
          } catch (apiErr) {
            console.warn("[Dynamic API] Failed to fetch settings/api from Firestore:", apiErr);
          }

          // 2. If Admin logs in from workspace, auto-heal and publish active PUBLIC container backend URL
          const isAdminUser = isDefaultAdmin || (userSnap.exists() && (userSnap.data() as any).role === 'admin');
          if (isAdminUser && typeof window !== 'undefined') {
            const hostname = window.location.hostname || "";
            const isPublishableOrigin = hostname.includes("run.app");
              
            if (isPublishableOrigin) {
              try {
                let cleanPublicOrigin = window.location.origin;
                if (cleanPublicOrigin.includes("-dev-")) {
                  cleanPublicOrigin = cleanPublicOrigin.replace("-dev-", "-pre-");
                }
                
                const apiRef = doc(db, 'settings', 'api');
                await setDoc(apiRef, {
                  url: cleanPublicOrigin,
                  updatedAt: Date.now()
                }, { merge: true });
                console.log("[Dynamic API] Auto-healed and updated active backend API URL in Firestore settings as:", cleanPublicOrigin);
              } catch (setApiErr) {
                console.warn("[Dynamic API] Failed to update backend URL in Firestore settings:", setApiErr);
              }
            }
          }
        } catch (syncError) {
          console.warn("Gracefully bypassed non-blocking user sync to Firestore due to transient database service unavailability:", syncError);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    setLoginError(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login failed:", error);
      let errorMsg = error.message || "Lỗi đăng nhập không xác định.";
      if (error.code === 'auth/unauthorized-domain') {
        errorMsg = "Tên miền hiện tại chưa được cấp quyền truy cập trong Firebase Console (Authorized domains). Hãy thêm 'solenc2021.github.io' vào Firebase Console của bạn.";
      } else if (error.code === 'auth/popup-blocked') {
        errorMsg = "Trình duyệt đã chặn cửa sổ Popup. Vui lòng cho phép hiện Popup để tiếp tục đăng nhập.";
      } else if (error.code === 'auth/popup-closed-by-user') {
        errorMsg = "Cửa sổ đăng nhập đã bị đóng trước khi hoàn tất.";
      }
      setLoginError(errorMsg);
    }
  };

  const logout = async () => {
    try {
      setLoginError(null);
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const refreshProfile = async () => {
    if (!user) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        setProfile(userSnap.data() as UserProfile);
      }
    } catch (err) {
      console.error("Failed to refresh profile:", err);
    }
  };

  const incrementApiUsage = async (): Promise<boolean> => {
    if (!user) return false;
    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) return false;
      
      const p = userSnap.data() as UserProfile;
      const todayStr = new Date().toLocaleDateString('vi-VN');
      
      // Admin bypass checks (both role and actual default email for fail-safety)
      const isAdminUser = p.role === 'admin' || user.email === 'solenc2021@gmail.com';
      
      if (p.lastRequestDate !== todayStr) {
        // Daily reset: clear the counter to 1 and update request date to today
        await updateDoc(userRef, {
          apiUsageCount: 1,
          lastRequestDate: todayStr
        });
        setProfile((prev: any) => ({ ...prev, apiUsageCount: 1, lastRequestDate: todayStr }));
        return true;
      } else {
        // Enforce quota limit only for normal users
        if (!isAdminUser && p.apiUsageCount >= (p.apiLimit || 30)) {
          return false; // Quota limit reached
        }
        
        const newCount = (p.apiUsageCount || 0) + 1;
        await updateDoc(userRef, {
          apiUsageCount: newCount
        });
        setProfile((prev: any) => ({ ...prev, apiUsageCount: newCount }));
        return true;
      }
    } catch (error) {
      console.warn("Non-blocking fallback enabled for incrementApiUsage during DB issue:", error);
      return true; // Bypass to avoid fully breaking app experience if Db is briefly offline
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, loginError, login, logout, refreshProfile, incrementApiUsage, setLoginError }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within a FirebaseProvider');
  }
  return context;
};

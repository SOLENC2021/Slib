import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signInAnonymously,
  GoogleAuthProvider, 
  signOut, 
  User 
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { withFirestoreRetry, isFirestoreSuspended } from '../lib/firestoreUtils';
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
  tokensUsed: number;
  lastRequestDate: string;
  isGuest?: boolean;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  loginError: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  incrementApiUsage: (estimatedTokens?: number) => Promise<boolean>;
  resetDailyQuota: () => Promise<void>;
  setLoginError: (err: string | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const setupAuth = async () => {
      // 1. Listen to Firebase auth changes
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (!isMounted) return;

        if (firebaseUser) {
          setUser(firebaseUser);
          try {
            const isDefaultAdmin = firebaseUser.email === 'solenc2021@gmail.com';
            const todayStr = new Date().toLocaleDateString('vi-VN');

            if (isFirestoreSuspended()) {
              console.warn("[FirebaseProvider] Firestore is suspended, initializing mock offline profile.");
              const mockProfile: UserProfile = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                displayName: firebaseUser.displayName || (firebaseUser.isAnonymous ? 'Kỹ sư Khách' : 'Kỹ sư'),
                photoURL: firebaseUser.photoURL || '',
                createdAt: new Date().toISOString(),
                role: 'user',
                apiLimit: 50,
                apiUsageCount: 0,
                tokensUsed: 0,
                lastRequestDate: todayStr,
                isGuest: firebaseUser.isAnonymous
              };
              setProfile(mockProfile);
              setLoading(false);
              return;
            }

            // Sync user to Firestore
            const userRef = doc(db, 'users', firebaseUser.uid);
            const userSnap = await withFirestoreRetry(
              () => getDoc(userRef),
              OperationType.GET,
              `users/${firebaseUser.uid}`
            );
            
            if (!userSnap || !userSnap.exists()) {
              const newProfile: UserProfile = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                displayName: firebaseUser.displayName || (firebaseUser.isAnonymous ? 'Kỹ sư Khách' : 'Kỹ sư'),
                photoURL: firebaseUser.photoURL || '',
                createdAt: new Date().toISOString(),
                role: 'user',
                apiLimit: 50,
                apiUsageCount: 0,
                tokensUsed: 0,
                lastRequestDate: todayStr,
                isGuest: firebaseUser.isAnonymous
              };
              
              await withFirestoreRetry(
                () => setDoc(userRef, newProfile),
                OperationType.CREATE,
                `users/${firebaseUser.uid}`
              );
              setProfile(newProfile);
            } else {
              const existingData = userSnap.data() as any;
              let needsUpdate = false;
              const updatedPayload: Partial<UserProfile> = {};

              if (existingData.apiLimit === undefined) {
                updatedPayload.apiLimit = 50;
                needsUpdate = true;
              }
              if (existingData.apiUsageCount === undefined) {
                updatedPayload.apiUsageCount = 0;
                needsUpdate = true;
              }
              if (existingData.tokensUsed === undefined) {
                updatedPayload.tokensUsed = 0;
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

            // Load settings for dynamic backend API URL
            try {
              const apiRef = doc(db, 'settings', 'api');
              const apiSnap = await getDoc(apiRef);
              if (apiSnap.exists()) {
                const apiData = apiSnap.data();
                if (apiData.url) {
                  const loadedUrl = apiData.url;
                  if (
                    loadedUrl && 
                    (loadedUrl.startsWith("https://") || loadedUrl.startsWith("http://")) &&
                    !loadedUrl.includes("localhost") && 
                    !loadedUrl.includes("127.0.0.1")
                  ) {
                    const { setDynamicApiUrl } = await import('../lib/utils');
                    setDynamicApiUrl(loadedUrl);
                  }
                }
              }
            } catch (apiErr) {
              console.warn("[Dynamic API] Failed to fetch settings/api from Firestore:", apiErr);
            }

            // Auto-heal active public container backend URL
            if (typeof window !== 'undefined') {
              const hostname = window.location.hostname || "";
              if (hostname.includes("run.app")) {
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
                } catch (setApiErr) {
                  // Non-blocking
                }
              }
            }
          } catch (syncError) {
            console.warn("Gracefully bypassed non-blocking user sync to Firestore:", syncError);
          }
          setLoading(false);
        } else {
          // If not signed in: try anonymous sign in first to get a valid Firebase user
          try {
            await signInAnonymously(auth);
          } catch (anonErr) {
            console.warn("[FirebaseProvider] Anonymous sign-in unavailable, initializing guest profile:", anonErr);
            const todayStr = new Date().toLocaleDateString('vi-VN');
            const guestId = localStorage.getItem("solenc_guest_id") || `guest_${Math.random().toString(36).substring(2, 9)}`;
            localStorage.setItem("solenc_guest_id", guestId);
            
            const savedCount = parseInt(localStorage.getItem(`solenc_usage_${todayStr}`) || "0", 10);
            const savedTokens = parseInt(localStorage.getItem(`solenc_tokens_${todayStr}`) || "0", 10);

            const guestUser: any = {
              uid: guestId,
              displayName: "Kỹ sư Khách",
              email: "",
              photoURL: "",
              isAnonymous: true
            };
            setUser(guestUser);
            setProfile({
              uid: guestId,
              email: "",
              displayName: "Kỹ sư Khách",
              photoURL: "",
              createdAt: new Date().toISOString(),
              role: "user",
              apiLimit: 50,
              apiUsageCount: savedCount,
              tokensUsed: savedTokens,
              lastRequestDate: todayStr,
              isGuest: true
            });
            setLoading(false);
          }
        }
      });

      return unsubscribe;
    };

    const unsubPromise = setupAuth();

    return () => {
      isMounted = false;
      unsubPromise.then(unsub => unsub && unsub());
    };
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
        const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'tên miền của bạn';
        errorMsg = `Tên miền hiện tại (${currentHost}) chưa được thêm vào Authorized domains trong Firebase Console.`;
      } else if (error.code === 'auth/popup-blocked') {
        errorMsg = "Trình duyệt đã chặn cửa sổ Popup. Vui lòng cho phép hiện Popup để tiếp tục.";
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
      // Auto sign back in anonymously to keep open access for everyone
      try {
        await signInAnonymously(auth);
      } catch (e) {
        // Fallback handled in auth listener
      }
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

  const incrementApiUsage = async (estimatedTokens: number = 1200): Promise<boolean> => {
    const todayStr = new Date().toLocaleDateString('vi-VN');
    const currentLimit = profile?.apiLimit || 50;
    let currentCount = profile?.apiUsageCount || 0;
    let currentTokens = profile?.tokensUsed || 0;

    // Daily reset if date changed
    if (profile?.lastRequestDate !== todayStr) {
      currentCount = 0;
      currentTokens = 0;
    }

    if (currentCount >= currentLimit) {
      return false; // Reached limit
    }

    const newCount = currentCount + 1;
    const newTokens = currentTokens + estimatedTokens;

    setProfile(prev => prev ? ({
      ...prev,
      apiUsageCount: newCount,
      tokensUsed: newTokens,
      lastRequestDate: todayStr
    }) : null);

    localStorage.setItem(`solenc_usage_${todayStr}`, newCount.toString());
    localStorage.setItem(`solenc_tokens_${todayStr}`, newTokens.toString());

    if (user && !profile?.isGuest && !user.isAnonymous) {
      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          apiUsageCount: newCount,
          tokensUsed: newTokens,
          lastRequestDate: todayStr
        });
      } catch (err) {
        console.warn("Non-blocking Firestore quota sync:", err);
      }
    }

    return true;
  };

  const resetDailyQuota = async () => {
    const todayStr = new Date().toLocaleDateString('vi-VN');
    localStorage.setItem(`solenc_usage_${todayStr}`, "0");
    localStorage.setItem(`solenc_tokens_${todayStr}`, "0");

    setProfile(prev => prev ? ({
      ...prev,
      apiUsageCount: 0,
      tokensUsed: 0,
      lastRequestDate: todayStr
    }) : null);

    if (user && !profile?.isGuest && !user.isAnonymous) {
      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          apiUsageCount: 0,
          tokensUsed: 0,
          lastRequestDate: todayStr
        });
      } catch (err) {
        console.warn("Could not reset quota in Firestore:", err);
      }
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      loginError, 
      login, 
      logout, 
      refreshProfile, 
      incrementApiUsage, 
      resetDailyQuota,
      setLoginError 
    }}>
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

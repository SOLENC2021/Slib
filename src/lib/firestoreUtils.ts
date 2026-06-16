import { auth } from './firebase';
import { OperationType, FirestoreErrorInfo } from '../types';

let suspended = false;

export function isFirestoreSuspended(): boolean {
  if (typeof window !== 'undefined' && (window as any).firestoreSuspended) {
    return true;
  }
  return suspended;
}

export function suspendFirestore(reason: string) {
  suspended = true;
  if (typeof window !== 'undefined') {
    (window as any).firestoreSuspended = true;
    (window as any).firestoreSuspendedReason = reason;
    window.dispatchEvent(new CustomEvent('firestore-suspended', { detail: { reason } }));
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  const isQuotaOrPermission = 
    errorMessage.toLowerCase().includes('quota') || 
    errorMessage.toLowerCase().includes('resource_exhausted') || 
    errorMessage.toLowerCase().includes('insufficient permissions') ||
    errorMessage.toLowerCase().includes('permission') ||
    errorMessage.toLowerCase().includes('permission-denied');

  if (isQuotaOrPermission) {
    const reason = (errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('resource_exhausted'))
      ? "LỖI HỆ THỐNG: Hạn mức truy cập cơ sở dữ liệu Firebase Firestore đã cạn kiệt (Quota limit exceeded). Vui lòng nâng cấp gói hoặc liên hệ solenc2021@gmail.com."
      : "LỖI HỆ THỐNG: Thiếu quyền truy cập cơ sở dữ liệu Firebase Firestore (Missing or insufficient permissions). Hãy kiểm tra lại file rules hoặc kiểm tra tài khoản.";
    suspendFirestore(reason);
    console.error(`[Firestore CRITICAL] ${reason} Operation: ${operationType}, Path: ${path}`);
    return; // Stop execution without throwing to avoid severe loop-crashing
  }

  // Handle other transient errors gracefully
  const isTemporary = errorMessage.toLowerCase().includes('temporarily unavailable') || 
                      errorMessage.toLowerCase().includes('unavailable') ||
                      errorMessage.toLowerCase().includes('client is offline');

  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };

  if (isTemporary) {
    console.warn(`[Firestore Status: Gracefully Handled] Operation: ${operationType} on ${path}. Message: ${errorMessage}`);
    return; // Swallow or warn, do not force crash
  }

  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

export async function withFirestoreRetry<T>(
  operation: () => Promise<T>,
  operationType: OperationType,
  path: string | null,
  retries = 3,
  delay = 1000
): Promise<T | null> {
  if (isFirestoreSuspended()) {
    console.warn(`[Firestore Blocked] Bypassed operation ${operationType} on ${path} due to active Firestore suspension.`);
    return null;
  }
  
  try {
    return await operation();
  } catch (error: any) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    const isQuotaOrPermission = 
      errorMsg.toLowerCase().includes('quota') || 
      errorMsg.toLowerCase().includes('resource_exhausted') || 
      errorMsg.toLowerCase().includes('insufficient permissions') ||
      errorMsg.toLowerCase().includes('permission') ||
      errorMsg.toLowerCase().includes('permission-denied');

    if (isQuotaOrPermission) {
      handleFirestoreError(error, operationType, path);
      return null;
    }

    const isTemporary = errorMsg.toLowerCase().includes('temporarily unavailable') || 
                        errorMsg.toLowerCase().includes('unavailable') ||
                        errorMsg.toLowerCase().includes('client is offline') ||
                        errorMsg.includes('500') ||
                        errorMsg.includes('INTERNAL');

    if (retries > 0 && isTemporary) {
      console.warn(`[Firestore Retry] ${operationType} on ${path} failed with: "${errorMsg}". Retrying in ${delay}ms... (${retries} attempts left)`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return withFirestoreRetry(operation, operationType, path, retries - 1, delay * 2);
    }
    
    handleFirestoreError(error, operationType, path);
    return null;
  }
}


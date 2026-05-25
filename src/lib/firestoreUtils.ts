import { auth } from './firebase';
import { OperationType, FirestoreErrorInfo } from '../types';

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Handle transient errors gracefully
  const isTemporary = errorMessage.toLowerCase().includes('temporarily unavailable') || 
                      errorMessage.toLowerCase().includes('resource_exhausted') ||
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
  throw new Error(JSON.stringify(errInfo));
}

export async function withFirestoreRetry<T>(
  operation: () => Promise<T>,
  operationType: OperationType,
  path: string | null,
  retries = 4,
  delay = 1500
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isTemporary = errorMsg.toLowerCase().includes('temporarily unavailable') || 
                        errorMsg.toLowerCase().includes('resource_exhausted') ||
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
    throw error;
  }
}

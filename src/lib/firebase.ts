import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Test connection CRITICAL with robust exponential backoff retry.
async function testConnection(retries = 5, delay = 1500) {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firebase connection successful");
  } catch (error: any) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isTemporary = errorMsg.toLowerCase().includes('temporarily unavailable') ||
                        errorMsg.toLowerCase().includes('resource_exhausted') ||
                        errorMsg.toLowerCase().includes('unavailable') ||
                        errorMsg.toLowerCase().includes('client is offline') ||
                        errorMsg.includes('500') ||
                        errorMsg.includes('INTERNAL');

    if (retries > 0 && isTemporary) {
      console.warn(`Firebase is temporarily unavailable. Retrying test connection in ${delay}ms... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return testConnection(retries - 1, delay * 2);
    }

    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. Client is offline.");
    } else {
      console.error("Firebase connection test failed with non-retryable error:", error);
    }
  }
}

testConnection();

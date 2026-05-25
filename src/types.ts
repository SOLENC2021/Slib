export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: number;
  image?: string;
}

export interface PDFFile {
  id: string;
  name: string;
  text: string; // Global text (summary or partial)
  numpages: number;
  uploadDate: number;
  url: string;
  size?: string;
  category?: string;
  isAIReady?: boolean;
  extractionMethod?: "pdf-parse" | "gemini-ocr" | "hybrid-lazy";
  ownerId?: string;
  extractedData?: any;
  processedPages?: number[]; // Track which pages have been OCR'd
  geminiFileUri?: string;
  geminiFileName?: string;
  textUrl?: string;
}

export interface PageData {
  fileId: string;
  pageNumber: number;
  text: string;
  processedDate: number;
}

export interface Folder {
  id: string;
  name: string;
  subfolders?: Folder[];
}

export interface ExtractionField {
  name: string;
  type: string;
  description: string;
}

export interface ExtractionSchema {
  id: string;
  name: string;
  fields: ExtractionField[];
}

export interface Note {
  id: string;
  content: string;
  fileId: string;
  fileName: string;
  ownerId: string;
  createdAt: number;
}


import { getApiUrl } from "./utils";

export interface ExtractionField {
  name: string;
  type: string;
  description: string;
}

export async function chatWithDocument(
  text: string,
  prompt: string,
  history: any[] = [],
  image?: string,
  geminiFileUri?: string,
  isGeneral?: boolean,
  referencedFiles?: any[],
  fileUrl?: string,
  fileName?: string,
  fileId?: string,
  textUrl?: string
) {
  try {
    const response = await fetch(getApiUrl("/api/chat"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, prompt, history, image, geminiFileUri, isGeneral, referencedFiles, fileUrl, fileName, fileId, textUrl }),
    });

    const contentType = response.headers.get("content-type");
    if (!response.ok) {
      if (contentType && contentType.includes("application/json")) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Lỗi khi gọi API Chat");
      } else {
        const errorText = await response.text();
        throw new Error(errorText.substring(0, 100) || `Lỗi server (${response.status})`);
      }
    }

    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      return data; // Returns { text, upgradedFile, upgradedReferencedFiles }
    }
    const plainText = await response.text();
    return { text: plainText };
  } catch (error: any) {
    console.error("Chat with document error:", error);
    throw error;
  }
}

export async function extractDataFromText(
  text: string,
  fields: ExtractionField[],
  geminiFileUri?: string,
  fileId?: string,
  fileUrl?: string,
  fileName?: string
) {
  try {
    const properties: Record<string, any> = {};
    fields.forEach(field => {
      properties[field.name] = {
        type: "string", // Simple mapping for schema in fetch call
        description: field.description,
      };
    });

    const schema = {
      type: "object",
      properties,
      required: fields.map(f => f.name),
    };

    const response = await fetch(getApiUrl("/api/extract-fields"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, schema, geminiFileUri, fileId, fileUrl, fileName }),
    });

    const contentType = response.headers.get("content-type");
    if (!response.ok) {
      if (contentType && contentType.includes("application/json")) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Lỗi khi gọi API trích xuất");
      } else {
        const errorText = await response.text();
        throw new Error(errorText.substring(0, 100) || `Lỗi server (${response.status})`);
      }
    }

    if (contentType && contentType.includes("application/json")) {
      return await response.json(); // Returns { data, upgradedFile }
    }
    const plainText = await response.text();
    return { data: plainText };
  } catch (error: any) {
    console.error("Extract data error:", error);
    throw error;
  }
}

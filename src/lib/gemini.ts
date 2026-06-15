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

export async function chatWithDocumentStream(
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
  textUrl?: string,
  onChunk?: (chunk: string) => void
) {
  try {
    const response = await fetch(getApiUrl("/api/chat-stream"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        prompt,
        history,
        image,
        geminiFileUri,
        isGeneral,
        referencedFiles,
        fileUrl,
        fileName,
        fileId,
        textUrl
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = "Lỗi khi gọi API Chat Stream";
      try {
        const errorJson = JSON.parse(errorText);
        errorMsg = errorJson.error || errorMsg;
      } catch (e) {
        errorMsg = errorText.substring(0, 100) || `${response.statusText} (${response.status})`;
      }
      throw new Error(errorMsg);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Không thể khởi tạo luồng dữ liệu (ReadableStream không khả dụng)");
    }

    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let fullText = "";
    let upgradedFile: any = undefined;
    let upgradedReferencedFiles: any = undefined;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      
      // Save last incomplete line back to buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith("data: ")) {
          const dataStr = trimmedLine.substring(6).trim();
          if (dataStr === "[DONE]") {
            continue;
          }
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.text) {
              fullText += parsed.text;
              if (onChunk) {
                onChunk(parsed.text);
              }
            } else if (parsed.upgradedFile) {
              upgradedFile = parsed.upgradedFile;
            } else if (parsed.upgradedReferencedFiles) {
              upgradedReferencedFiles = parsed.upgradedReferencedFiles;
            } else if (parsed.error) {
              throw new Error(parsed.error);
            }
          } catch (e) {
            // Ignore parse errors from temporary partial packets
          }
        }
      }
    }

    // Flush remaining buffer
    const trimmedBuffer = buffer.trim();
    if (trimmedBuffer.startsWith("data: ")) {
      const dataStr = trimmedBuffer.substring(6).trim();
      if (dataStr !== "[DONE]") {
        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.text) {
            fullText += parsed.text;
            if (onChunk) {
              onChunk(parsed.text);
            }
          } else if (parsed.upgradedFile) {
            upgradedFile = parsed.upgradedFile;
          } else if (parsed.upgradedReferencedFiles) {
            upgradedReferencedFiles = parsed.upgradedReferencedFiles;
          }
        } catch (e) {}
      }
    }

    return { text: fullText, upgradedFile, upgradedReferencedFiles };
  } catch (error: any) {
    console.error("Chat with document stream error:", error);
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

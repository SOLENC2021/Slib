export interface ExtractionField {
  name: string;
  type: string;
  description: string;
}

export async function chatWithDocument(text: string, prompt: string, history: any[] = [], image?: string) {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, prompt, history, image }),
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
      return data.text;
    }
    return await response.text();
  } catch (error: any) {
    console.error("Chat with document error:", error);
    throw error;
  }
}

export async function extractDataFromText(text: string, fields: ExtractionField[]) {
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

    const response = await fetch("/api/extract-fields", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, schema }),
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
      return await response.json();
    }
    return await response.text();
  } catch (error: any) {
    console.error("Extract data error:", error);
    throw error;
  }
}

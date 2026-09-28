import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Converts standard LaTeX math symbols and expressions into beautiful, highly legible plaintext
 * with clean Unicode characters. This allows engineers to copy summaries/analyses directly
 * into Microsoft Word, Google Docs, Excel, Zalo, etc. without raw LaTeX markup errors.
 */
export function cleanLatexForClipboard(text: string): string {
  if (!text) return "";
  
  let res = text;
  
  // 1. Clean LaTeX spacing symbols
  res = res.replace(/\\quad/g, "  ");
  res = res.replace(/\\qquad/g, "    ");
  res = res.replace(/\\[,;! ]/g, " ");

  // 2. Translate common math functions (remove backslash)
  res = res.replace(/\\(max|min|sin|cos|tan|cot|log|ln|exp|arcsin|arccos|arctan|sinh|cosh|tanh)/g, "$1");

  // 3. Translate fractions recursively (handles nesting up to 4 levels)
  for (let i = 0; i < 4; i++) {
    res = res.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1 / $2)");
  }

  // 4. Square roots conversion
  res = res.replace(/\\sqrt\[([^\]]+)\]\{([^}]+)\}/g, "$1√($2)");
  res = res.replace(/\\sqrt\{([^}]+)\}/g, "√($1)");

  // 5. Text elements inside math and block formatting
  res = res.replace(/\\text\{([^}]+)\}/g, "$1");
  res = res.replace(/\\math(bf|rm|it|bb|cal|sf|tt)\{([^}]+)\}/g, "$2");

  // 6. Subscripts & Superscripts - remove curly braces for cleaner plaintext (e.g. l_{an} -> l_an)
  res = res.replace(/_\{([^}]+)\}/g, "_$1");
  res = res.replace(/\^\{([^}]+)\}/g, "^$1");
  
  // Specific degree formatting
  res = res.replace(/\^\{\\circ\}/g, "°").replace(/\\circ/g, "°");

  // 7. Map Greek symbols and specific operations to standard Unicode values
  const symbolMap: { [key: string]: string } = {
    "\\\\cdot": " • ",
    "\\\\times": " x ",
    "\\\\ge": "≥",
    "\\\\geq": "≥",
    "\\\\le": "≤",
    "\\\\leq": "≤",
    "\\\\div": " ÷ ",
    "\\\\pm": "±",
    "\\\\approx": "≈",
    "\\\\neq": "≠",
    "\\\\infty": "∞",
    "\\\\partial": "∂",
    "\\\\alpha": "α",
    "\\\\beta": "β",
    "\\\\gamma": "γ",
    "\\\\delta": "δ",
    "\\\\epsilon": "ε",
    "\\\\zeta": "ζ",
    "\\\\eta": "η",
    "\\\\theta": "θ",
    "\\\\iota": "ι",
    "\\\\kappa": "κ",
    "\\\\lambda": "λ",
    "\\\\mu": "μ",
    "\\\\nu": "ν",
    "\\\\xi": "ξ",
    "\\\\pi": "π",
    "\\\\rho": "ρ",
    "\\\\varsigma": "ς",
    "\\\\sigma": "σ",
    "\\\\tau": "τ",
    "\\\\upsilon": "υ",
    "\\\\phi": "φ",
    "\\\\chi": "chi",
    "\\\\psi": "ψ",
    "\\\\omega": "ω",
    "\\\\Gamma": "Γ",
    "\\\\Delta": "Δ",
    "\\\\Theta": "Θ",
    "\\\\Lambda": "Λ",
    "\\\\Xi": "Ξ",
    "\\\\Pi": "Π",
    "\\\\Sigma": "Σ",
    "\\\\Upsilon": "Υ",
    "\\\\Phi": "Φ",
    "\\\\Psi": "Ψ",
    "\\\\Omega": "Ω",
    "\\\\to": "→",
    "\\\\rightarrow": "→",
    "\\\\leftarrow": "←",
    "\\\\cap": "∩",
    "\\\\cup": "∪",
    "\\\\subset": "⊂",
    "\\\\supset": "⊃",
    "\\\\subseteq": "⊆",
    "\\\\supseteq": "⊇",
    "\\\\in": "∈",
    "\\\\notin": "∉",
    "\\\\ni": "∋",
    "\\\\sum": "Σ",
    "\\\\prod": "Π",
    "\\\\integ": "∫",
    "\\\\int": "∫",
    "\\\\hat": "^",
    "\\\\bar": "‾",
    "\\\\tilde": "~"
  };

  for (const [latex, unicode] of Object.entries(symbolMap)) {
    const rx = new RegExp(latex + "(?![a-zA-Z])", "g"); // exact word matching
    res = res.replace(rx, unicode);
  }

  // Remove any leftover math backslashes for text markup that got skipped
  res = res.replace(/\\([a-zA-Z]+)/g, "$1");

  // 8. Strip inline/block math dollar delimiters ($ and $$), leaving clean readable plain calculations
  res = res.replace(/\$\$/g, "");
  res = res.replace(/\$/g, "");

  return res.trim();
}

let cachedApiUrl = typeof window !== "undefined" ? window.localStorage.getItem("backend_api_url") : null;

export function setDynamicApiUrl(url: string) {
  if (typeof window !== "undefined" && url) {
    const cleanUrl = url.endsWith("/") ? url.slice(0, -1) : url;
    if (
      (cleanUrl.startsWith("https://") || cleanUrl.startsWith("http://")) &&
      !cleanUrl.includes("localhost") &&
      !cleanUrl.includes("127.0.0.1")
    ) {
      cachedApiUrl = cleanUrl;
      window.localStorage.setItem("backend_api_url", cleanUrl);
      console.log("[Dynamic API] Cached backend URL successfully:", cleanUrl);
    }
  }
}

export function getApiUrl(path: string): string {
  if (!path) return "";

  const cleanPath = path.includes("/api/") 
    ? path.substring(path.indexOf("/api/")) 
    : (path.startsWith("/") ? path : `/${path}`);

  if (typeof window === "undefined") {
    return cleanPath;
  }

  const hostname = window.location.hostname;
  
  // All AI Studio domains (*.ai.studio, aistudio.google), Cloud Run (*.run.app), and local development
  // run the full Express backend directly on the same origin, so ALWAYS use clean relative path.
  const isDirectOrAiStudio = 
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.includes("run.app") ||
    hostname.includes("ai.studio") ||
    hostname.includes("aistudio.google") ||
    hostname.includes("googleusercontent.com");

  if (isDirectOrAiStudio) {
    // If there is any stale external backend url cached in localStorage, clear it
    if (cachedApiUrl && typeof window !== "undefined") {
      try {
        window.localStorage.removeItem("backend_api_url");
        cachedApiUrl = null;
      } catch (e) {}
    }
    return cleanPath;
  }

  // For external pure-static hosts (like GitHub Pages solenc2021.github.io)
  const configuredBackend = (import.meta as any).env?.VITE_BACKEND_URL || cachedApiUrl;
  if (configuredBackend) {
    return `${configuredBackend.replace(/\/+$/, "")}${cleanPath}`;
  }

  return cleanPath;
}

/**
 * Executes a fetch request with automatic retries if the server is starting up,
 * warming up, or returning transient gateway 502/503/504 or HTML error responses
 * (such as Cloud Run's "<title>Starting Server...</title>").
 */
export async function fetchWithServerRetry(
  urlOrPath: string,
  options?: RequestInit,
  maxRetries: number = 3,
  initialDelayMs: number = 1500
): Promise<Response> {
  const targetUrl = getApiUrl(urlOrPath);
  let delayMs = initialDelayMs;
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(targetUrl, options);
      const status = response.status;
      const contentType = response.headers.get("content-type") || "";
      const isGatewayError = status === 502 || status === 503 || status === 504;

      // Check for HTML response from an API endpoint
      if (isGatewayError || (contentType.includes("text/html") && targetUrl.includes("/api/"))) {
        const cloned = response.clone();
        const bodyText = await cloned.text().catch(() => "");
        const isStartingServer = 
          bodyText.includes("Starting Server") || 
          bodyText.includes("<title>Starting Server...</title>") || 
          bodyText.includes("502 Bad Gateway") ||
          bodyText.includes("503 Service Temporarily Unavailable") ||
          bodyText.includes("504 Gateway Time-out");

        if (attempt < maxRetries && (isStartingServer || isGatewayError)) {
          console.warn(`[fetchWithServerRetry] Server starting up / warming up (Attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          delayMs = Math.floor(delayMs * 1.5);
          continue;
        }
      }

      return response;
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || String(err);
      const isNetworkTransient = 
        errMsg.includes("Failed to fetch") || 
        errMsg.includes("NetworkError") || 
        errMsg.includes("Load failed") ||
        errMsg.includes("Network request failed");

      if (attempt < maxRetries && isNetworkTransient) {
        console.warn(`[fetchWithServerRetry] Network transient failure (Attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs = Math.floor(delayMs * 1.5);
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("Không thể kết nối đến máy chủ AI sau nhiều lần thử.");
}

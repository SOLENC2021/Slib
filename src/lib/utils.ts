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
    // Strictly prevent local development or private development container URLs from poisoning public cache
    if (
      !cleanUrl.includes("localhost") &&
      !cleanUrl.includes("127.0.0.1") &&
      !cleanUrl.includes("-dev-")
    ) {
      cachedApiUrl = cleanUrl;
      window.localStorage.setItem("backend_api_url", cleanUrl);
    }
  }
}

export function getApiUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  
  // If running on GitHub Pages or another external static host, route to Cloud Run dev/pre backend
  // We exclude localhost, 127.0.0.1, run.app, google.com, aistudio.google, googleusercontent.com to keep local dev and cloud preview pointing to the active container backend
  const isLocalOrPreview = 
    !hostname ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.includes("run.app") ||
    hostname.includes("aistudio.google") ||
    hostname.includes("googleusercontent.com") ||
    hostname.includes("web-dev-server");

  if (!isLocalOrPreview) {
    if (cachedApiUrl) {
      // Final security guard validation before returning a cached URL in production environment
      if (
        (cachedApiUrl.startsWith("https://") || cachedApiUrl.startsWith("http://")) &&
        !cachedApiUrl.includes("localhost") &&
        !cachedApiUrl.includes("127.0.0.1") &&
        !cachedApiUrl.includes("-dev-")
      ) {
        return `${cachedApiUrl}${cleanPath}`;
      }
    }
    return `https://ais-pre-rcoaoicqj56hwshueq7jte-188256685519.asia-east1.run.app${cleanPath}`;
  }
  return cleanPath;
}

import React, { useState, useEffect, useRef } from "react";
import { 
  Maximize2, Minimize2, Download, Search, Printer, 
  Share2, ChevronLeft, ChevronRight, X,
  FileText, AlertCircle, ExternalLink,
  ZoomIn, ZoomOut, Loader2, Sparkles, Layers,
  PlusCircle, MinusCircle, Info, HelpCircle, 
  CheckCircle2, SlidersHorizontal, Sliders, Eye, EyeOff,
  RefreshCw, ListFilter, ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PDFFile } from "@/types";
import * as pdfjs from "pdfjs-dist";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

// Helper to remove Vietnamese tones/diacritics for diacritic-insensitive search
function removeVietnameseTones(str: string): string {
  if (!str) return "";
  let res = str.normalize("NFD");
  res = res.replace(/[\u0300-\u036f]/g, "");
  res = res.replace(/đ/g, "d").replace(/Đ/g, "D");
  res = res.replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, "a");
  res = res.replace(/[èéẹẻẽêềếệểễ]/g, "e");
  res = res.replace(/[ìíịỉĩ]/g, "i");
  res = res.replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, "o");
  res = res.replace(/[ùúụủũưừứựửữ]/g, "u");
  res = res.replace(/[ỳýỵỷỹ]/g, "y");
  
  res = res.replace(/[ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴ]/g, "A");
  res = res.replace(/[ÈÉẸẺẼÊỀẾỆỂỄ]/g, "E");
  res = res.replace(/[ÌÍỊỈĨ]/g, "I");
  res = res.replace(/[ÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠ]/g, "O");
  res = res.replace(/[ÙÚỤỦŨƯỪỨỰỬỮ]/g, "U");
  res = res.replace(/[ỲÝỴỶỸ]/g, "Y");
  
  return res;
}

// Highly robust Vietnamese & Unicode text match finder with spacing-insensitive mapping
function findMatchInText(fullText: string, query: string): { found: boolean; startIdx: number; matchedLength: number } {
  if (!fullText || !query) return { found: false, startIdx: -1, matchedLength: 0 };
  
  const normTextNFC = fullText.normalize("NFC");
  const normQueryNFC = query.normalize("NFC");
  
  let idx = normTextNFC.toLowerCase().indexOf(normQueryNFC.toLowerCase());
  if (idx !== -1) {
    return { found: true, startIdx: idx, matchedLength: normQueryNFC.length };
  }
  
  const normTextNFD = fullText.normalize("NFD");
  const normQueryNFD = query.normalize("NFD");
  idx = normTextNFD.toLowerCase().indexOf(normQueryNFD.toLowerCase());
  if (idx !== -1) {
    return { found: true, startIdx: idx, matchedLength: normQueryNFD.length };
  }

  const matchIgnoringSpaces = (textStr: string, queryStr: string) => {
    const cleanQ = queryStr.replace(/\s+/g, "").toLowerCase();
    if (!cleanQ) return { startIdx: -1, matchedLength: 0 };
    
    const cleanT = textStr.toLowerCase();
    const indices: number[] = [];
    let cleanTextNoSpaces = "";
    
    for (let i = 0; i < cleanT.length; i++) {
      const char = cleanT[i];
      if (char !== " " && char !== "\t" && char !== "\n" && char !== "\r" && char !== "\xa0") {
        cleanTextNoSpaces += char;
        indices.push(i);
      }
    }
    
    const mIdx = cleanTextNoSpaces.indexOf(cleanQ);
    if (mIdx !== -1) {
      const origStart = indices[mIdx];
      const origEnd = indices[mIdx + cleanQ.length - 1];
      return {
        startIdx: origStart,
        matchedLength: origEnd - origStart + 1
      };
    }
    return { startIdx: -1, matchedLength: 0 };
  };

  let spaceMatch = matchIgnoringSpaces(normTextNFC, normQueryNFC);
  if (spaceMatch.startIdx !== -1) {
    return { found: true, startIdx: spaceMatch.startIdx, matchedLength: spaceMatch.matchedLength };
  }
  
  spaceMatch = matchIgnoringSpaces(normTextNFD, normQueryNFD);
  if (spaceMatch.startIdx !== -1) {
    return { found: true, startIdx: spaceMatch.startIdx, matchedLength: spaceMatch.matchedLength };
  }

  const unaccentedText = removeVietnameseTones(normTextNFC);
  const unaccentedQuery = removeVietnameseTones(normQueryNFC);

  idx = unaccentedText.toLowerCase().indexOf(unaccentedQuery.toLowerCase());
  if (idx !== -1) {
    return { found: true, startIdx: idx, matchedLength: unaccentedQuery.length };
  }

  spaceMatch = matchIgnoringSpaces(unaccentedText, unaccentedQuery);
  if (spaceMatch.startIdx !== -1) {
    return { found: true, startIdx: spaceMatch.startIdx, matchedLength: spaceMatch.matchedLength };
  }

  return { found: false, startIdx: -1, matchedLength: 0 };
}

// Parses pages from continuous text structured with page markers
function parsePagesFromText(text: string): { [pageNo: number]: string } {
  const pages: { [pageNo: number]: string } = {};
  if (!text) return pages;

  const cleanRegex = /---\s*\[BẮT ĐẦU TRANG\s+(\d+)\]\s*---/gi;
  let match;
  const matches: { pageNum: number; index: number; headerLength: number }[] = [];
  
  while ((match = cleanRegex.exec(text)) !== null) {
    matches.push({
      pageNum: parseInt(match[1], 10),
      index: match.index,
      headerLength: match[0].length
    });
  }

  if (matches.length === 0) {
    const rawRegex = /---\s*\[B\s*A\s*T\s*D\s*A\s*U\s*T\s*R\s*A\s*N\s*G\s+(\d+)\]\s*---/gi;
    while ((match = rawRegex.exec(text)) !== null) {
      matches.push({
        pageNum: parseInt(match[1], 10),
        index: match.index,
        headerLength: match[0].length
      });
    }
  }

  if (matches.length === 0) {
    pages[1] = text;
    return pages;
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const next = matches[i + 1];
    
    const start = current.index + current.headerLength;
    const end = next ? next.index : text.length;
    
    let pageText = text.substring(start, end);
    pageText = pageText.replace(/---\s*\[KẾT THÚC TRANG\s+\d+\]\s*---/gi, "");
    pageText = pageText.replace(/---\s*\[KET THUC TRANG\s+\d+\]\s*---/gi, "");
    
    pages[current.pageNum] = pageText.trim();
  }

  return pages;
}

// AI-powered visual difference marker interface
export interface DiffMarker {
  id: string;
  page: number;
  type: "addition" | "modification" | "deletion";
  title: string;
  description: string;
  boundingBox: {
    x: number;      // percentage of width (0-100)
    y: number;      // percentage of height (0-100)
    width: number;  // percentage of width (0-100)
    height: number; // percentage of height (0-100)
  };
  originalValue?: string;
  revisedValue?: string;
  ruleReference?: string;
  impactLevel?: "high" | "medium" | "low";
  discipline?: "architecture" | "structural" | "mep" | "pccc" | "other";
  boqDelta?: string;
  costEstimate?: string;
}

// Custom mock difference generator based on file context
function generateDrawingDifferences(activeName: string, refName: string): DiffMarker[] {
  const isKietCau = activeName.toLowerCase().includes("kết cấu") || activeName.toLowerCase().includes("ket cau") ||
                    refName.toLowerCase().includes("kết cấu") || refName.toLowerCase().includes("ket cau") ||
                    activeName.toLowerCase().includes("dầm") || activeName.toLowerCase().includes("cột") ||
                    activeName.toLowerCase().includes("thep");
                    
  const isPccc = activeName.toLowerCase().includes("pccc") || activeName.toLowerCase().includes("phòng cháy") ||
                 refName.toLowerCase().includes("pccc") || refName.toLowerCase().includes("phòng cháy");

  const isMep = activeName.toLowerCase().includes("mep") || activeName.toLowerCase().includes("điện") ||
                activeName.toLowerCase().includes("nước") || activeName.toLowerCase().includes("thông gió") ||
                refName.toLowerCase().includes("mep") || refName.toLowerCase().includes("điện");

  if (isKietCau) {
    return [
      {
        id: "diff-kc-1",
        page: 1,
        type: "modification",
        title: "Thay đổi tiết diện dầm khung chính D4 (Trục B-D/2)",
        description: "Tiết diện dầm chịu lực dầm chính D4 thay đổi từ kích thước thiết kế ban đầu 220x500 mm lên 220x600 mm nhằm tăng cường mô-men kháng uốn tại gối cột đầu trục dầm chính.",
        boundingBox: { x: 22, y: 18, width: 28, height: 12 },
        originalValue: "Dầm D4 (220x500 mm) - Thép dọc 3Φ20 + 2Φ18",
        revisedValue: "Dầm D4 (220x600 mm) - Cường hóa Thép dọc 4Φ22 + 2Φ20",
        ruleReference: "TCVN 5574:2018 - Khoản 5.2.3 về cường độ chịu uốn dầm sàn bê tông",
        impactLevel: "high",
        discipline: "structural",
        boqDelta: "+ 1.25 m³ Bê tông M300, + 85 kg Thép CB400-V",
        costEstimate: "+ 12,800,000 VNĐ"
      },
      {
        id: "diff-kc-2",
        page: 1,
        type: "addition",
        title: "Bổ sung Thép đai chịu lực cường độ cao đầu cột C1",
        description: "Bổ sung hệ thép đai tăng cường Φ8a100 tại khoảng cách 1.0m từ chân cột C1 lên nhằm nâng cao khả năng hấp thụ gia lực chống cắt cục bộ do động đất dầm-cột.",
        boundingBox: { x: 62, y: 32, width: 14, height: 15 },
        originalValue: "Cốt thép đai Φ6a150 thông dụng",
        revisedValue: "Cốt đai Φ8a100 gia cường khoảng gối dầm (Nén khép hẹp)",
        ruleReference: "TCVN 2737:2023 - Yêu cầu thiết kế tải trọng gió động cấu kiện",
        impactLevel: "medium",
        discipline: "structural",
        boqDelta: "+ 32 kg Thép đai Φ8 CB240-T",
        costEstimate: "+ 2,800,000 VNĐ"
      },
      {
        id: "diff-kc-3",
        page: 2,
        type: "deletion",
        title: "Hủy bỏ dầm phụ công-xôn DX phụ trợ hành lang",
        description: "Hủy bỏ dầm phụ đúc nổi DX trục 4-A tại khu vực kỹ thuật sảnh ngoài nhằm tránh giao cắt, dọn dẹp không gian chạy ống cơ điện MEP ngầm trần phẳng.",
        boundingBox: { x: 15, y: 55, width: 20, height: 10 },
        originalValue: "Dầm phụ nổi DX (150x250 mm) liên kết dầm biên chính",
        revisedValue: "Loại bỏ dầm biên phụ (Cấp sàn dốc chịu lực trực tiếp chịu tải)",
        ruleReference: "Bản vẽ sàn kết cấu bê tông khu phụ điều chỉnh",
        impactLevel: "high",
        discipline: "structural",
        boqDelta: "- 0.95 m³ Bê tông B25, - 68 kg Thép CB300-V",
        costEstimate: "- 8,400,000 VNĐ"
      },
      {
        id: "diff-kc-4",
        page: 1,
        type: "modification",
        title: "Điều chỉnh chiều dày lớp bê tông bảo vệ dầm sàn móng",
        description: "Tăng chiều dày lớp bê tông bảo vệ cốt thép dầm móng chính từ 25mm lên 35mm để nâng cao mức độ chống xâm thực mặn của nước ngầm sỏi rò rỉ.",
        boundingBox: { x: 45, y: 72, width: 18, height: 12 },
        originalValue: "Lớp bảo vệ dầm dày 25 mm",
        revisedValue: "Lớp bảo vệ dầm tăng cường dày 35 mm (Kháng xâm thực sun-fat)",
        ruleReference: "TCVN 5574:2018 - Tiêu chuẩn chống mòn hóa học móng ngầm bệ cột",
        impactLevel: "low",
        discipline: "structural",
        boqDelta: "+ 0.35 m³ Bê tông lót kháng xâm thực",
        costEstimate: "+ 1,500,000 VNĐ"
      }
    ];
  }

  if (isPccc) {
    return [
      {
        id: "diff-pccc-1",
        page: 1,
        type: "modification",
        title: "Mở rộng chiều rộng hành lang thoát hiểm trục chính",
        description: "Điều chỉnh tăng chiều rộng thông thủy của hành lang thoát nạn từ 1.2m lên 1.6m nhằm tuân thủ tuyệt đối quy định tối thiểu của QCVN 06:2022 đối với công trình hành lang thoát nạn công cộng đông người.",
        boundingBox: { x: 12, y: 38, width: 38, height: 9 },
        originalValue: "Hành lang kỹ thuật rộng 1.200 mm",
        revisedValue: "Hành lang mở rộng thông thủy đạt 1.600 mm (Đạt tiêu chuẩn)",
        ruleReference: "QCVN 06:2022/BXD - Bảng 4, Khoản 3.2.1 về kích thước thoát nạn",
        impactLevel: "high",
        discipline: "pccc",
        boqDelta: "+ 12.5 m² Vách thạch cao chống cháy 2 mặt 120 phút",
        costEstimate: "+ 18,200,000 VNĐ"
      },
      {
        id: "diff-pccc-2",
        page: 1,
        type: "addition",
        title: "Bổ sung Cửa kính chống cháy EI 60 phòng đệm thang máy",
        description: "Bổ sung cửa thép bọc kính cường lực chống nhiệt đạt tiêu chuẩn EI 60 đóng tự động nhằm cô lập khói tràn lan từ sảnh thang bộ thoát hiểm khi sảy cháy tầng hầm.",
        boundingBox: { x: 70, y: 15, width: 15, height: 15 },
        originalValue: "Vách mở tự do không cửa bảo vệ sảnh thang",
        revisedValue: "Cửa thép chống khói tự khép chặn khói độc đạt chuẩn EI 60",
        ruleReference: "QCVN 06:2022/BXD - Điều 3.2.4 về cấu kiện chống lan khói buồng sảnh",
        impactLevel: "high",
        discipline: "pccc",
        boqDelta: "+ 02 Bộ Cửa thép bọc kính chống cháy EI 60 (1200x2200mm)",
        costEstimate: "+ 34,000,000 VNĐ"
      },
      {
        id: "diff-pccc-3",
        page: 2,
        type: "deletion",
        title: "Hủy bỏ cửa thoát nạn mở ngược chiều thoát nạn chính",
        description: "Hủy bỏ thiết kế cửa mở quay hướng vào trong phòng hội thảo đông người trục A, điều chỉnh thành loại cánh lề quay hướng ra sảnh chính theo dòng thoát nạn.",
        boundingBox: { x: 42, y: 60, width: 14, height: 14 },
        originalValue: "Cửa gỗ mở quay hướng ngược chiều dòng người (Mở quay vào)",
        revisedValue: "Điều chỉnh bản lề mở quay hướng ra sảnh hành lang thoát nạn (Mở quay ra)",
        ruleReference: "QCVN 06:2022/BXD - Khoản 3.2.8 quy định hướng mở cánh sảnh phòng hội thảo",
        impactLevel: "medium",
        discipline: "pccc",
        boqDelta: "Điều chỉnh hướng bản lề & khóa thanh thoát hiểm Panic hardware",
        costEstimate: "+ 2,100,000 VNĐ"
      }
    ];
  }

  if (isMep) {
    return [
      {
        id: "diff-mep-1",
        page: 1,
        type: "addition",
        title: "Bổ sung tuyến ống gió tươi HVAC dọc hành lang sảnh",
        description: "Thiết lập bổ sung đường ống tôn mạ kẽm dẫn khí tươi Φ300 chạy ngầm bọc bảo ôn cách âm dọc sảnh chính nhằm gia tăng áp suất dương phòng độc khói.",
        boundingBox: { x: 10, y: 22, width: 45, height: 10 },
        originalValue: "Không có sảnh phân phối khí dương độc lập",
        revisedValue: "Đường ống dẫn khí tươi sảnh cấp gió tươi liên hồi Φ300",
        ruleReference: "TCVN 5687:2010 - Tiêu chuẩn Thiết kế Thông gió và Điều hòa",
        impactLevel: "medium",
        discipline: "mep",
        boqDelta: "+ 28 md Ống gió tôn mạ kẽm Φ300 + Bọc bảo ôn B1",
        costEstimate: "+ 22,500,000 VNĐ"
      },
      {
        id: "diff-mep-2",
        page: 1,
        type: "modification",
        title: "Nâng tiết diện cáp nguồn tủ động lực DB-M1 sảnh đón",
        description: "Thay đổi cáp nguồn từ tiết diện 4x16mm2 lên 4x25mm2 lõi đồng XLPE chống bắt tia lửa để đảm bảo tải hoạt động liên tục khi quạt hút khói sự cố tăng áp chạy hết công suất.",
        boundingBox: { x: 68, y: 48, width: 16, height: 14 },
        originalValue: "Cáp lõi đồng thường Cu/XLPE/PVC (4x16 mm2)",
        revisedValue: "Cáp đồng bọc giáp chống cháy chuyên dụng Cu/FR-XLPE/PVC (4x25 mm2)",
        ruleReference: "TCVN 9206:2012 - Thiết kế điện công trình dân dụng công cộng",
        impactLevel: "high",
        discipline: "mep",
        boqDelta: "+ 65 md Cáp đồng chống cháy Cu/FR-XLPE/PVC 4x25mm²",
        costEstimate: "+ 19,800,000 VNĐ"
      },
      {
        id: "diff-mep-3",
        page: 2,
        type: "deletion",
        title: "Hủy bỏ cụm phễu thu ga rác ngầm mương sàn trục B",
        description: "Hủy bỏ hố ga bê tông thu nước cơ học góc sảnh để xử lý lỗi va đập không gian kiến trúc với hệ thống đài dầm giằng móng móng cọc khoan nhồi dầm bệ sảnh.",
        boundingBox: { x: 30, y: 65, width: 15, height: 15 },
        originalValue: "Hố ga ga đúc âm sàn kích thước 500x500x600 mm",
        revisedValue: "Điều chỉnh dốc sàn chảy tràn thoát trực tiếp ga hông ngoài biên",
        ruleReference: "Quy chuẩn cấp thoát nước mạng lưới ngoài nhà biên",
        impactLevel: "low",
        discipline: "mep",
        boqDelta: "- 01 Hố ga đúc sẵn + Phễu thu inox 304",
        costEstimate: "- 4,500,000 VNĐ"
      }
    ];
  }

  // DEFAULT ARCHITECTURAL DIFFERENTIATION
  return [
    {
      id: "diff-arch-1",
      page: 1,
      type: "modification",
      title: "Điều chỉnh mở rộng và di dời sảnh kỹ thuật WC sảnh đón",
      description: "Dịch chuyển vách thạch cao ngăn khu WC nam/nữ lùi lại 800mm dọc trục biên để nhường chỗ sảnh đón thang bộ được rộng rãi và mở rộng kích thước cửa từ 750mm lên 900mm giúp người khuyết tật di chuyển thuận lợi.",
      boundingBox: { x: 18, y: 20, width: 25, height: 18 },
      originalValue: "Lối vào WC chật hẹp, cửa đi thông thủy rộng 750 mm",
      revisedValue: "Nới sảnh lùi, mở rộng WC, cửa đi thông thủy rộng 900 mm (Đạt chuẩn tiện ích)",
      ruleReference: "TCVN 4391:2015 - Quy chuẩn thiết kế công trình tiếp cận cho người khuyết tật",
      impactLevel: "medium",
      discipline: "architecture",
      boqDelta: "+ 8.5 m² Vách thạch cao chống ẩm + 01 Bộ Cửa gỗ An Cường 900x2200mm",
      costEstimate: "+ 11,200,000 VNĐ"
    },
    {
      id: "diff-arch-2",
      page: 1,
      type: "addition",
      title: "Bổ sung vách kính trượt cách âm cách ngăn phòng họp mini",
      description: "Thêm vách ngăn nhôm kính lùa xếp thông minh cách âm cao 12mm chịu va đập để linh hoạt phân khu đại sảnh khép kín thành 2 phòng họp phụ trợ nhỏ độc lập.",
      boundingBox: { x: 60, y: 35, width: 20, height: 20 },
      originalValue: "Đại sảnh thông sàn không vách ngăn cố định",
      revisedValue: "Hệ vách kính lùa gấp trượt xếp đa năng (Độ cách âm âm tần đạt 38dB)",
      ruleReference: "Bản vẽ chi tiết thiết kế nội thất trang trí hành lang",
      impactLevel: "high",
      discipline: "architecture",
      boqDelta: "+ 18 m² Vách kính xếp lùa khung nhôm Xingfa cách âm 12mm",
      costEstimate: "+ 42,500,000 VNĐ"
    },
    {
      id: "diff-arch-3",
      page: 2,
      type: "deletion",
      title: "Hủy bỏ bồn trồng cây đúc bê tông biên ngoài ban công lầu 1",
      description: "Loại bỏ thiết kế bồn hoa chạy nổi bê tông đúc tải tĩnh nặng 450kg dọc mép hành lang lô-gia ban công biên để giảm tản áp lên dầm công xôn mỏng chịu lực sảnh đón.",
      boundingBox: { x: 45, y: 68, width: 30, height: 12 },
      originalValue: "Hệ bồn đúc bồn hoa bê tông đổ bùn dày 150 mm đè biên lô-gia",
      revisedValue: "Thay bằng lan can sắt CNC uốn mỹ thuật gọn nhẹ, đặt bậu hoa chậu tháo lắp rời",
      ruleReference: "TCVN 2737:2023 - Hướng dẫn tối ưu phân bố tĩnh tải dầm biên công-xôn rìa ngoài",
      impactLevel: "medium",
      discipline: "architecture",
      boqDelta: "- 1.8 m³ Bê tông đúc bồn hoa + 12 md Lan can sắt CNC sơn tĩnh điện",
      costEstimate: "- 6,800,000 VNĐ"
    },
    {
      id: "diff-arch-4",
      page: 1,
      type: "modification",
      title: "Thay đổi góc lề quay và chiều mở cửa kho lưu trữ hồ sơ",
      description: "Điều chỉnh hướng mở cánh cửa gỗ chống cháy phòng kho lưu trữ trục kỹ thuật hướng mở từ hành lang chính quay gập ngược vào trong sảnh để tránh gây vướng cho luồng kỹ sư di chuyển.",
      boundingBox: { x: 48, y: 44, width: 10, height: 12 },
      originalValue: "Cửa mở quay hướng ra ngoài hành lang sảnh dầm dập",
      revisedValue: "Cửa quay mở hướng quay vào trong sảnh phòng kho nội thất",
      ruleReference: "Bản vẽ quy chuẩn bố trí lỗ mở kỹ thuật sảnh tầng",
      impactLevel: "low",
      discipline: "architecture",
      boqDelta: "Đảo hướng lề khung cửa gỗ chống cháy 900x2100mm",
      costEstimate: "+ 800,000 VNĐ"
    }
  ];
}

interface PDFViewerProps {
  file: PDFFile | null;
  allFiles?: PDFFile[];
  onPageChange?: (pageNumber: number) => void;
  targetPage?: number | null;
  onClearTargetPage?: () => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  onClose?: () => void;

  // Drawing Visual Comparison states from App.tsx
  compareMode?: boolean;
  setCompareMode?: (val: boolean) => void;
  compareWithFileId?: string;
  setCompareWithFileId?: (id: string) => void;
  isComparingAI?: boolean;
  setIsComparingAI?: (val: boolean) => void;
  compareStage?: string;
  setCompareStage?: (val: string) => void;
  diffMarkers?: DiffMarker[];
  setDiffMarkers?: (markers: DiffMarker[]) => void;
  selectedDiffType?: "all" | "addition" | "modification" | "deletion";
  setSelectedDiffType?: (val: "all" | "addition" | "modification" | "deletion") => void;
  activeMarkerId?: string | null;
  setActiveMarkerId?: (id: string | null) => void;
  hoveredMarkerId?: string | null;
  setHoveredMarkerId?: (id: string | null) => void;
  viewLayer?: "overlay" | "original" | "revised";
  setViewLayer?: (val: "overlay" | "original" | "revised") => void;
  markerOpacity?: number;
  setMarkerOpacity?: (val: number) => void;

  // Feature 2: Auto Alignment, Scale Calibration & Grid Offset
  scaleOffset?: number;
  setScaleOffset?: (val: number) => void;
  rotationOffset?: number;
  setRotationOffset?: (val: number) => void;
  alignOffsetX?: number;
  setAlignOffsetX?: (val: number) => void;
  alignOffsetY?: number;
  setAlignOffsetY?: (val: number) => void;

  // Feature 4: Split Slider Curtain View & Heatmap
  isSplitSliderActive?: boolean;
  setIsSplitSliderActive?: (val: boolean) => void;
  splitSliderPos?: number;
  setSplitSliderPos?: (val: number) => void;
  isHeatmapActive?: boolean;
  setIsHeatmapActive?: (val: boolean) => void;
}

export function PDFViewer({ 
  file, 
  allFiles = [],
  onPageChange, 
  targetPage, 
  onClearTargetPage,
  isMaximized = false,
  onToggleMaximize,
  onClose,

  compareMode = false,
  setCompareMode,
  compareWithFileId = "",
  setCompareWithFileId,
  isComparingAI = false,
  setIsComparingAI,
  compareStage = "",
  setCompareStage,
  diffMarkers = [],
  setDiffMarkers,
  selectedDiffType = "all",
  setSelectedDiffType,
  activeMarkerId = null,
  setActiveMarkerId,
  hoveredMarkerId = null,
  setHoveredMarkerId,
  viewLayer = "overlay",
  setViewLayer,
  markerOpacity = 100,
  setMarkerOpacity,

  scaleOffset = 0,
  setScaleOffset,
  rotationOffset = 0,
  setRotationOffset,
  alignOffsetX = 0,
  setAlignOffsetX,
  alignOffsetY = 0,
  setAlignOffsetY,

  isSplitSliderActive = false,
  setIsSplitSliderActive,
  splitSliderPos = 50,
  setSplitSliderPos,
  isHeatmapActive = false,
  setIsHeatmapActive,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState<string>("1");
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renderedPages, setRenderedPages] = useState<number[]>([]);
  const pdfDocRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync typed input with current observer page
  useEffect(() => {
    setPageInput(currentPage.toString());
  }, [currentPage]);

  const handleJumpToPage = (pageNumStr: string) => {
    const pageNum = parseInt(pageNumStr, 10);
    const maxPages = numPages || (file ? file.numpages : 1) || 1;
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= maxPages) {
      const el = document.querySelector(`[data-page="${pageNum}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        setCurrentPage(pageNum);
      }
    } else {
      setPageInput(currentPage.toString());
    }
  };

  const [pageTexts, setPageTexts] = useState<{ [page: number]: string }>({});
  const [parentPageTexts, setParentPageTexts] = useState<{ [page: number]: string }>({});
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ page: number; text: string }[]>([]);
  const [currentResultIdx, setCurrentResultIdx] = useState(-1);
  const [isIndexing, setIsIndexing] = useState(false);

  // Sync document text from the parent component (Gemini OCR / pdf-parse processed)
  useEffect(() => {
    if (file && file.text) {
      const parsed = parsePagesFromText(file.text);
      setParentPageTexts(parsed);
    } else {
      setParentPageTexts({});
    }
  }, [file?.text, file?.id]);

  // Background text extraction utilizing newly loaded state pdfDoc
  useEffect(() => {
    if (pdfDoc) {
      setPageTexts({});
      setSearchResults([]);
      setCurrentResultIdx(-1);
      setSearchQuery("");
      setIsSearchOpen(false);
      
      const extractAll = async () => {
        setIsIndexing(true);
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          try {
            const page = await pdfDoc.getPage(i);
            const txtContent = await page.getTextContent();
            
            const pageText = txtContent.items
              .map((item: any) => (item && typeof item.str === "string") ? item.str : "")
              .join(" ");
            
            setPageTexts((prev) => ({
              ...prev,
              [i]: pageText,
            }));
          } catch (err) {
            console.error("Lỗi trích xuất chữ trang " + i, err);
          }
        }
        setIsIndexing(false);
      };
      
      extractAll();
    } else {
      setPageTexts({});
      setSearchResults([]);
      setCurrentResultIdx(-1);
      setSearchQuery("");
      setIsSearchOpen(false);
    }
  }, [pdfDoc]);

  // Reactive Search Effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setCurrentResultIdx(-1);
      return;
    }

    const matches: { page: number; text: string }[] = [];
    const total = numPages || file?.numpages || 0;
    
    for (let p = 1; p <= total; p++) {
      const localText = pageTexts[p] || "";
      const parentText = parentPageTexts[p] || "";
      
      const localMatch = findMatchInText(localText, searchQuery);
      const parentMatch = findMatchInText(parentText, searchQuery);
      
      if (localMatch.found) {
        const start = Math.max(0, localMatch.startIdx - 30);
        const end = Math.min(localText.length, localMatch.startIdx + localMatch.matchedLength + 30);
        const snippet = localText.substring(start, end).replace(/\s+/g, " ").trim();
        matches.push({
          page: p,
          text: `...${snippet}...`
        });
      } else if (parentMatch.found) {
        const start = Math.max(0, parentMatch.startIdx - 30);
        const end = Math.min(parentText.length, parentMatch.startIdx + parentMatch.matchedLength + 30);
        const snippet = parentText.substring(start, end).replace(/\s+/g, " ").trim();
        matches.push({
          page: p,
          text: `...${snippet}...`
        });
      }
    }
    
    setSearchResults(matches);
    
    if (matches.length > 0) {
      if (currentResultIdx === -1 || currentResultIdx >= matches.length) {
        setCurrentResultIdx(0);
      }
    } else {
      setCurrentResultIdx(-1);
    }
  }, [pageTexts, parentPageTexts, searchQuery, numPages, file?.numpages]);

  const lastScrollQueryRef = useRef("");

  useEffect(() => {
    if (searchResults.length > 0 && searchQuery !== lastScrollQueryRef.current) {
      lastScrollQueryRef.current = searchQuery;
      setCurrentResultIdx(0);
      const firstMatchPage = searchResults[0].page;
      setTimeout(() => {
        const el = document.querySelector(`[data-page="${firstMatchPage}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          el.classList.add("ring-8", "ring-indigo-500/40", "ring-offset-2");
          setTimeout(() => {
            el.classList.remove("ring-8", "ring-indigo-500/40", "ring-offset-2");
          }, 2000);
        }
      }, 50);
    } else if (searchResults.length === 0) {
      lastScrollQueryRef.current = "";
    }
  }, [searchResults, searchQuery]);

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
  };

  const goToNextResult = () => {
    if (searchResults.length === 0) return;
    const nextIdx = (currentResultIdx + 1) % searchResults.length;
    setCurrentResultIdx(nextIdx);
    const pageNo = searchResults[nextIdx].page;
    const el = document.querySelector(`[data-page="${pageNo}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("ring-8", "ring-indigo-500/40", "ring-offset-2");
      setTimeout(() => {
        el.classList.remove("ring-8", "ring-indigo-500/40", "ring-offset-2");
      }, 2000);
    }
  };

  const goToPrevResult = () => {
    if (searchResults.length === 0) return;
    const prevIdx = (currentResultIdx - 1 + searchResults.length) % searchResults.length;
    setCurrentResultIdx(prevIdx);
    const pageNo = searchResults[prevIdx].page;
    const el = document.querySelector(`[data-page="${pageNo}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("ring-8", "ring-indigo-500/40", "ring-offset-2");
      setTimeout(() => {
        el.classList.remove("ring-8", "ring-indigo-500/40", "ring-offset-2");
      }, 2000);
    }
  };

  // Scroll to target page
  useEffect(() => {
    if (targetPage && renderedPages.includes(targetPage)) {
      const triggerScroll = () => {
        const el = document.querySelector(`[data-page="${targetPage}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          el.classList.add("ring-8", "ring-indigo-500/50", "ring-offset-2", "transition-all", "duration-500");
          setTimeout(() => {
            el.classList.remove("ring-8", "ring-indigo-500/50", "ring-offset-2");
          }, 2500);
          if (onClearTargetPage) {
            onClearTargetPage();
          }
        }
      };

      const timeoutId = setTimeout(triggerScroll, 150);
      return () => clearTimeout(timeoutId);
    }
  }, [targetPage, renderedPages, onClearTargetPage]);

  // Track page intersection
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNo = Number(entry.target.getAttribute("data-page"));
            if (pageNo) {
              setCurrentPage(pageNo);
              if (onPageChange) onPageChange(pageNo);
            }
          }
        });
      },
      {
        root: containerRef.current,
        threshold: 0.5,
      }
    );

    const elements = document.querySelectorAll("[data-page]");
    elements.forEach((el) => observer.observe(el));

    return () => {
      elements.forEach((el) => observer.unobserve(el));
      observer.disconnect();
    };
  }, [renderedPages]);

  // Swapping loaded PDF file based on current active view tab (Original Drawing vs Revised Drawing)
  const getCompareWithFile = () => {
    return allFiles.find(f => f.id === compareWithFileId) || null;
  };

  const activeCompareWithFile = getCompareWithFile();

  const currentLoadedFileUrl = (compareMode && viewLayer === "original" && activeCompareWithFile)
    ? activeCompareWithFile.url
    : file?.url;

  useEffect(() => {
    if (currentLoadedFileUrl) {
      loadPDF(currentLoadedFileUrl);
    } else {
      setPdfDoc(null);
      pdfDocRef.current = null;
    }
  }, [currentLoadedFileUrl, file?.id]);

  const loadPDF = async (url: string) => {
    setLoading(true);
    setLoadError(null);
    setRenderedPages([]);
    
    try {
      const loadingTask = pdfjs.getDocument(url);
      const pdf = await loadingTask.promise;
      pdfDocRef.current = pdf;
      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
      
      const pages = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
      setRenderedPages(pages);
    } catch (error: any) {
      console.error("PDF.js loading error:", error);
      setLoadError(error.message || "Không thể tải tài liệu");
    } finally {
      setLoading(false);
    }
  };



  // Handle marker selection with scroll to page
  const selectMarker = (markerId: string) => {
    setActiveMarkerId?.(markerId);
    const marker = diffMarkers.find(m => m.id === markerId);
    if (marker) {
      const el = document.querySelector(`[data-page="${marker.page}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Trigger a temporary visual outline ripple on the page
        el.classList.add("ring-8", "ring-indigo-500/50", "transition-all", "duration-500");
        setTimeout(() => {
          el.classList.remove("ring-8", "ring-indigo-500/50");
        }, 1500);
      }
    }
  };

  if (!file) {
    return (
      <div className="flex-1 h-full bg-[#1c1f26] rounded-[28px] flex items-center justify-center p-8 text-center border border-slate-800 shadow-[0_24px_55px_rgba(0,0,0,0.12)]">
        <div className="max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="w-24 h-24 bg-gray-800/50 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-2xl ring-1 ring-white/5">
            <Search className="w-10 h-10 text-indigo-500" />
          </div>
          <h2 className="text-xl font-black text-white uppercase tracking-[0.2em]">Chọn tài liệu công trình</h2>
          <p className="text-gray-500 mt-4 text-sm font-bold leading-relaxed uppercase tracking-wider opacity-60">
            Duyệt thư viện và chọn bản vẽ<br/>để bắt đầu tra cứu kỹ thuật
          </p>
        </div>
      </div>
    );
  }

  // Find other drawings of "Bản vẽ thiết kế" category to compare with
  const otherDrawings = allFiles.filter(f => f.id !== file.id && f.category === "Bản vẽ thiết kế");

  return (
    <div className="flex-1 h-full flex flex-col bg-[#111318] rounded-[28px] overflow-hidden border border-slate-800/80 shadow-[0_30px_70px_rgba(0,0,0,0.22)] relative">
      {/* Top Toolbar */}
      <div className="h-16 bg-[#1a1d26] border-b border-white/5 flex items-center justify-between px-6 shrink-0 z-20">
        <div 
          onClick={onToggleMaximize}
          className="flex items-center gap-4 cursor-pointer hover:bg-white/5 px-3 py-1.5 rounded-2xl transition-all min-w-0 flex-1 mr-4"
          title="Click để Phóng to / Thu nhỏ khu vực đọc PDF"
        >
          <div className="w-10 h-10 bg-indigo-600/20 rounded-xl flex items-center justify-center border border-indigo-500/30 shrink-0">
            <FileText className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[13px] font-black text-white uppercase tracking-widest truncate max-w-[280px]">
              {file.name}
            </h2>
            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mt-0.5 truncate opacity-75">
              {compareMode ? "CHẾ ĐỘ KIỂM TRA ĐỐI CHIẾU SAI KHÁC BẢN VẼ" : "TRÌNH XEM BẢN VẼ KỸ THUẬT PDF"}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-4 shrink-0">

          {/* Search Button */}
          <div className="flex items-center gap-4 px-3 py-1.5 bg-black/20 rounded-xl border border-white/5">
            {isSearchOpen ? (
              <div className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
                <Search className="w-4 h-4 text-indigo-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Tìm từ khóa..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="bg-black/30 text-white placeholder-gray-500 text-[11px] px-2 py-1 border border-white/10 rounded-lg focus:outline-none focus:border-indigo-500 w-28 sm:w-36 transition-all"
                  autoFocus
                />
                
                {searchResults.length > 0 && (
                  <div className="flex items-center gap-1 text-[9px] text-gray-400 font-bold tracking-wider shrink-0 bg-white/5 px-1.5 py-0.5 rounded">
                    <span>{currentResultIdx + 1}/{searchResults.length}</span>
                    <button onClick={goToPrevResult} className="hover:text-white"><ChevronLeft className="w-3 h-3" /></button>
                    <button onClick={goToNextResult} className="hover:text-white"><ChevronRight className="w-3 h-3" /></button>
                  </div>
                )}
                
                <button 
                  onClick={() => {
                    setIsSearchOpen(false);
                    setSearchQuery("");
                    setSearchResults([]);
                    setCurrentResultIdx(-1);
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setIsSearchOpen(true)}
                className="text-gray-400 hover:text-indigo-400 transition-all flex items-center gap-1 cursor-pointer"
                title="Bật tính năng tìm kiếm từ khóa"
              >
                <Search className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest hidden lg:inline opacity-70">Tìm kiếm</span>
              </button>
            )}

            <div className="h-4 w-[1px] bg-white/10" />
            
            <div className="flex items-center gap-2">
              <button onClick={() => setScale(s => Math.max(0.4, s - 0.1))} className="text-gray-400 hover:text-white" title="Thu nhỏ"><ZoomOut className="w-4 h-4" /></button>
              <div className="text-[10px] font-black text-indigo-400 min-w-[40px] text-center">
                {Math.round(scale * 100)}%
              </div>
              <button onClick={() => setScale(s => s + 0.1)} className="text-gray-400 hover:text-white" title="Phóng to"><ZoomIn className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="h-5 w-[1px] bg-white/10 hidden lg:block" />

          {onToggleMaximize && (
            <button 
              onClick={onToggleMaximize}
              className={cn(
                "p-2 rounded-xl border transition-all flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest cursor-pointer shadow-sm active:scale-95",
                isMaximized 
                  ? "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20 hover:bg-indigo-500" 
                  : "bg-white/5 text-indigo-300 border-white/10 hover:bg-white/10 hover:text-white"
              )}
            >
              {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isMaximized ? "THU NHỎ" : "PHÓNG TO"}</span>
            </button>
          )}

          {onClose && (
            <button 
              onClick={onClose}
              className="flex items-center gap-1.5 p-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-black text-[10px] tracking-widest uppercase transition-all active:scale-95 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ĐÓNG</span>
            </button>
          )}
        </div>
      </div>



      {/* Main split work area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left View: Document Scroll Area with dynamic PDF pages rendering */}
        <div className="flex-1 relative bg-[#1e222d] overflow-y-auto no-scrollbar scroll-smooth p-12 flex flex-col items-center gap-16" ref={containerRef}>
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1e222d] z-50">
              <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
              <p className="text-white font-black text-xs uppercase tracking-widest">Đang kết xuất tài liệu...</p>
            </div>
          )}

          {isComparingAI && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-md z-45">
              <div className="bg-[#1e222d] border border-white/5 rounded-[32px] p-8 max-w-sm text-center shadow-2xl relative">
                <div className="w-16 h-16 bg-emerald-600/20 rounded-full flex items-center justify-center border border-emerald-500/30 mx-auto mb-6">
                  <Sparkles className="w-8 h-8 text-emerald-400 animate-pulse" />
                </div>
                <h3 className="text-sm font-black text-white uppercase tracking-widest mb-3">
                  AI ĐANG KIỂM TRA ĐỐI CHIẾU BẢN VẼ
                </h3>
                <div className="flex items-center justify-center gap-2 text-xs text-gray-400 font-medium px-4 h-12">
                  <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                  <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                  <span className="ml-1 text-left line-clamp-2 leading-relaxed">{compareStage}</span>
                </div>
              </div>
            </div>
          )}

          {loadError ? (
            <div className="flex-1 flex flex-col items-center justify-center text-white p-6 sm:p-12 text-center h-full w-full max-w-2xl mx-auto">
              <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500 mb-6 border border-red-500/20">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-black uppercase tracking-widest text-red-400 mb-2">
                Lỗi tải tài liệu PDF
              </h3>
              <p className="text-gray-400 text-sm max-w-sm mb-8">{loadError}</p>
              <div className="flex gap-3 w-full justify-center">
                <button 
                  onClick={() => loadPDF(file.url)} 
                  className="px-6 py-3 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all cursor-pointer"
                >
                  Thử tải lại
                </button>
              </div>
            </div>
          ) : (
            renderedPages.map(pageNo => {
              // Get markers only for this page
              const pageMarkers = viewLayer === "overlay" 
                ? diffMarkers.filter(m => m.page === pageNo && (selectedDiffType === "all" || m.type === selectedDiffType))
                : [];

              return (
                <PDFPage 
                  key={`${file.id}-page-${pageNo}`} 
                  pdfDoc={pdfDocRef.current} 
                  pageNo={pageNo} 
                  scale={scale * (1 + (scaleOffset || 0) / 100)}
                  diffMarkers={pageMarkers}
                  activeMarkerId={activeMarkerId}
                  hoveredMarkerId={hoveredMarkerId}
                  onSelectMarker={selectMarker}
                  onHoverMarker={setHoveredMarkerId}
                  opacity={markerOpacity}
                  rotationOffset={rotationOffset}
                  alignOffsetX={alignOffsetX}
                  alignOffsetY={alignOffsetY}
                  isSplitSliderActive={isSplitSliderActive}
                  splitSliderPos={splitSliderPos}
                  isHeatmapActive={isHeatmapActive}
                />
              );
            })
          )}
        </div>


      </div>

      {/* Floating Page Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
        <div className="bg-slate-900/40 hover:bg-slate-900/80 backdrop-blur-md px-5 py-2.5 rounded-full border border-white/5 hover:border-white/15 shadow-2xl flex items-center gap-3.5 pointer-events-auto transform transition-all duration-300 hover:scale-[1.02]">
          <button 
            onClick={() => {
              const el = document.querySelector(`[data-page="${currentPage - 1}"]`);
              el?.scrollIntoView({ behavior: "smooth" });
            }}
            disabled={currentPage <= 1}
            className="text-white hover:text-indigo-400 disabled:opacity-30 p-1 cursor-pointer transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <div className="text-[12px] font-black text-white uppercase tracking-widest flex items-center gap-1.5 min-w-[130px] justify-center select-none">
            <span className="opacity-80">TRANG</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pageInput}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, "");
                setPageInput(val);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleJumpToPage(pageInput);
                  e.currentTarget.blur();
                }
              }}
              onBlur={() => {
                handleJumpToPage(pageInput);
              }}
              className="w-12 h-6.5 text-center font-black bg-white/10 hover:bg-white/20 focus:bg-white/25 text-white border border-white/10 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-450/40 rounded-lg transition-all text-xs outline-none focus:outline-none p-0"
            />
            <span className="opacity-30">/</span>
            <span className="opacity-80">{numPages || file.numpages}</span>
          </div>

          <button 
            onClick={() => {
              const el = document.querySelector(`[data-page="${currentPage + 1}"]`);
              el?.scrollIntoView({ behavior: "smooth" });
            }}
            disabled={currentPage >= (numPages || Infinity)}
            className="text-white hover:text-indigo-400 disabled:opacity-30 p-1 cursor-pointer transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper component for individual page rendering with SVG/absolute overlay markers layer
function PDFPage({ 
  pdfDoc, 
  pageNo, 
  scale,
  diffMarkers = [],
  activeMarkerId,
  hoveredMarkerId,
  onSelectMarker,
  onHoverMarker,
  opacity,
  rotationOffset = 0,
  alignOffsetX = 0,
  alignOffsetY = 0,
  isSplitSliderActive = false,
  splitSliderPos = 50,
  isHeatmapActive = false
}: { 
  pdfDoc: any, 
  pageNo: number, 
  scale: number,
  diffMarkers?: DiffMarker[],
  activeMarkerId?: string | null,
  hoveredMarkerId?: string | null,
  onSelectMarker: (markerId: string) => void,
  onHoverMarker: (markerId: string | null) => void,
  opacity: number,
  rotationOffset?: number,
  alignOffsetX?: number,
  alignOffsetY?: number,
  isSplitSliderActive?: boolean,
  splitSliderPos?: number,
  isHeatmapActive?: boolean
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [rendered, setRendered] = useState(false);
  const renderTaskRef = useRef<any>(null);

  // Use IntersectionObserver to lazy load/render pages
  useEffect(() => {
    if (pageNo <= 2) {
      setIsVisible(true);
      return;
    }

    const scrollContainer = pageRef.current?.closest(".overflow-y-auto") || null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        root: scrollContainer,
        rootMargin: "800px 0px",
        threshold: 0.01,
      }
    );

    if (pageRef.current) {
      observer.observe(pageRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [pageNo]);

  useEffect(() => {
    let isMounted = true;
    
    const render = async () => {
      if (!pdfDoc || !canvasRef.current || !isVisible) return;
      
      try {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        const page = await pdfDoc.getPage(pageNo);
        if (!isMounted || !canvasRef.current) return;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        
        if (!context || !isMounted) return;
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        const renderTask = page.render({
          canvasContext: context,
          viewport: viewport
        });
        
        renderTaskRef.current = renderTask;
        
        await renderTask.promise;
        
        if (isMounted) {
          setRendered(true);
          renderTaskRef.current = null;
        }
      } catch (err: any) {
        if (err.name !== "RenderingCancelledException") {
          console.error("Page render error:", err);
        }
      }
    };
    
    render();

    return () => {
      isMounted = false;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [pdfDoc, pageNo, scale, isVisible]);

  const estimatedHeight = scale * 850;

  return (
    <div 
      ref={pageRef}
      data-page={pageNo}
      className="relative group transition-all duration-500"
      style={{ minHeight: rendered ? undefined : `${estimatedHeight}px` }}
    >
      {/* Page Content with Calibration transform */}
      <div 
        className="shadow-[0_32px_128px_-16px_rgba(0,0,0,0.6)] rounded-sm bg-white overflow-hidden transition-all duration-300 ring-1 ring-black/5 relative"
        style={{
          transform: `rotate(${rotationOffset}deg) translate(${alignOffsetX}px, ${alignOffsetY}px)`,
          transformOrigin: "center center"
        }}
      >
        <canvas ref={canvasRef} className="max-w-full h-auto block" style={{ display: rendered ? "block" : "none" }} />
        
        {/* Heatmap Overlay (Feature 4) */}
        {rendered && isHeatmapActive && diffMarkers.map(marker => (
          <div
            key={`heatmap-${marker.id}`}
            style={{
              position: "absolute",
              left: `${marker.boundingBox.x - 5}%`,
              top: `${marker.boundingBox.y - 5}%`,
              width: `${marker.boundingBox.width + 10}%`,
              height: `${marker.boundingBox.height + 10}%`,
            }}
            className="rounded-full bg-gradient-to-r from-rose-500/40 via-amber-500/30 to-emerald-500/20 blur-xl animate-pulse pointer-events-none z-0"
          />
        ))}

        {/* Split Slider Curtain View Overlay (Feature 4) */}
        {rendered && isSplitSliderActive && (
          <div 
            className="absolute inset-0 pointer-events-none z-20 overflow-hidden"
          >
            {/* Split Vertical Line */}
            <div 
              className="absolute top-0 bottom-0 w-1 bg-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.9)] transition-all"
              style={{ left: `${splitSliderPos}%` }}
            >
              <div className="absolute top-1/2 -translate-y-1/2 -left-3 w-7 h-7 bg-amber-400 rounded-full flex items-center justify-center text-black font-black text-xs shadow-xl border-2 border-white">
                ↔
              </div>
            </div>

            {/* Tint Overlay for Gốc vs Mới side */}
            <div 
              className="absolute top-0 bottom-0 left-0 bg-indigo-950/15 backdrop-hue-rotate-15 border-r border-amber-400/50"
              style={{ width: `${splitSliderPos}%` }}
            >
              <span className="absolute top-4 left-4 bg-black/80 text-white font-black text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-md border border-white/10">
                📄 BẢN VẼ GỐC
              </span>
            </div>
            <div 
              className="absolute top-0 bottom-0 right-0 bg-emerald-950/10"
              style={{ width: `${100 - splitSliderPos}%` }}
            >
              <span className="absolute top-4 right-4 bg-emerald-950/90 text-emerald-300 font-black text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-md border border-emerald-500/30">
                ✦ BẢN VẼ MỚI
              </span>
            </div>
          </div>
        )}

        {/* Render overlay markers absolutely positioned on top of drawing canvas */}
        {rendered && diffMarkers.map(marker => {
          const isActive = activeMarkerId === marker.id;
          const isHovered = hoveredMarkerId === marker.id;
          
          return (
            <div 
              key={marker.id}
              style={{
                position: "absolute",
                left: `${marker.boundingBox.x}%`,
                top: `${marker.boundingBox.y}%`,
                width: `${marker.boundingBox.width}%`,
                height: `${marker.boundingBox.height}%`,
                opacity: opacity / 100,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectMarker(marker.id);
              }}
              onMouseEnter={() => onHoverMarker(marker.id)}
              onMouseLeave={() => onHoverMarker(null)}
              className={cn(
                "border-2 border-dashed rounded-xl transition-all duration-300 z-10 flex items-center justify-center cursor-pointer group/marker",
                marker.type === "addition" 
                  ? "border-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/25 hover:border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]" 
                  : marker.type === "deletion" 
                    ? "border-rose-500 bg-rose-500/10 hover:bg-rose-500/25 hover:border-rose-400 shadow-[0_0_15px_rgba(239,68,68,0.3)]" 
                    : "border-amber-500 bg-amber-500/10 hover:bg-amber-500/25 hover:border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)]",
                isActive ? "ring-4 ring-offset-2 ring-indigo-500 scale-[1.02] border-solid bg-opacity-30" : "",
                isHovered ? "border-solid bg-opacity-25 scale-[1.01] ring-2 ring-indigo-400/40" : ""
              )}
            >
              {/* Absolute Corner circular badge icon */}
              <div className={cn(
                "absolute -top-3.5 -left-3.5 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black text-white shadow-xl border-2 border-white transition-all transform group-hover/marker:scale-110",
                marker.type === "addition" ? "bg-emerald-600" :
                marker.type === "deletion" ? "bg-rose-600" :
                "bg-amber-600"
              )}>
                {marker.type === "addition" ? "+" : marker.type === "deletion" ? "-" : "Δ"}
              </div>

              {/* Floating Tooltip displaying on Hover */}
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-950/95 backdrop-blur-md px-3.5 py-2.5 rounded-2xl border border-white/10 text-white font-sans text-[10px] leading-relaxed max-w-[220px] w-56 text-left opacity-0 pointer-events-none group-hover/marker:opacity-100 transition-all duration-350 shadow-2xl z-30 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className={cn(
                    "font-black uppercase text-[8px] tracking-widest block",
                    marker.type === "addition" ? "text-emerald-400" :
                    marker.type === "deletion" ? "text-rose-400" :
                    "text-amber-400"
                  )}>
                    {marker.type === "addition" ? "✦ Bổ sung mới" : marker.type === "deletion" ? "✘ Loại bỏ" : "✏ Thay đổi"}
                  </span>
                  {marker.impactLevel && (
                    <span className={cn(
                      "text-[7.5px] font-black uppercase px-1.5 py-0.2 rounded border",
                      marker.impactLevel === "high" ? "bg-rose-500/20 text-rose-300 border-rose-500/40" :
                      marker.impactLevel === "medium" ? "bg-amber-500/20 text-amber-300 border-amber-500/40" :
                      "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    )}>
                      {marker.impactLevel === "high" ? "🔴 Risk Cao" : marker.impactLevel === "medium" ? "🟡 Risk Vừa" : "🟢 Risk Thấp"}
                    </span>
                  )}
                </div>
                <span className="font-extrabold text-white uppercase tracking-wide block leading-tight">{marker.title}</span>
                <p className="text-[9px] text-gray-300 line-clamp-3 font-medium">
                  {marker.description}
                </p>
                {marker.boqDelta && (
                  <div className="pt-1 border-t border-white/10 flex justify-between text-[8px] font-mono">
                    <span className="text-indigo-300">📦 BoQ: {marker.boqDelta}</span>
                    {marker.costEstimate && <span className="text-emerald-300 font-bold">{marker.costEstimate}</span>}
                  </div>
                )}
                {marker.ruleReference && (
                  <span className="text-[7.5px] font-black text-indigo-400 uppercase tracking-widest block pt-0.5">
                    {marker.ruleReference.split(" - ")[0]}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        
        {!rendered && (
          <div className="w-full bg-[#1b1c22] flex flex-col items-center justify-center p-20" style={{ height: estimatedHeight }}>
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Đang kết xuất trang {pageNo}...</p>
          </div>
        )}
      </div>

      {/* Page Number Label (Side) */}
      <div className="absolute -right-24 top-0 h-full hidden xl:flex items-start pointer-events-none">
        <div className="sticky top-10 flex flex-col items-center">
          <div className="w-[2px] h-20 bg-indigo-500/10 rounded-full mb-4" />
          <span className="text-[12px] font-black text-indigo-500/40 vertical-text py-6 px-3 bg-indigo-500/5 rounded-full border border-indigo-500/10 uppercase tracking-widest">
            PG.{pageNo.toString().padStart(2, "0")}
          </span>
        </div>
      </div>
    </div>
  );
}

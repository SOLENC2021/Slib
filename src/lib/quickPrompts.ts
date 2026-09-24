import { PDFFile } from "@/types";

export interface QuickPrompt {
  id: string;
  label: string;
  prompt: string;
  icon: string;
  badge?: string;
  description: string;
  category?: string;
}

export function getQuickPromptsForFile(file: PDFFile | null): QuickPrompt[] {
  if (!file) {
    return [
      {
        id: "general_compliance",
        label: "Tra cứu TCVN 5574:2018",
        prompt: "Tra cứu quy định thiết kế kết cấu bê tông và bê tông cốt thép theo TCVN 5574:2018.",
        icon: "🛡️",
        badge: "TCVN",
        description: "Tiêu chuẩn thiết kế kết cấu bê tông & cốt thép hiện hành"
      },
      {
        id: "general_pccc",
        label: "An toàn cháy QCVN 06:2022",
        prompt: "Quy chuẩn QCVN 06:2022 quy định lối thoát nạn, bậc chịu lửa và khoảng cách an toàn PCCC như thế nào?",
        icon: "🔥",
        badge: "QCVN",
        description: "Quy chuẩn kỹ thuật quốc gia về an toàn cháy cho nhà và công trình"
      },
      {
        id: "general_wind",
        label: "Tải trọng gió TCVN 2737:2023",
        prompt: "Hướng dẫn xác định áp lực gió tiêu chuẩn và hệ số khí động theo TCVN 2737:2023.",
        icon: "💨",
        badge: "TẢI TRỌNG",
        description: "Quy định tải trọng và tác động mới nhất"
      },
      {
        id: "general_planning",
        label: "Quy hoạch QCVN 01:2021",
        prompt: "Tư vấn khoảng lùi xây dựng, mật độ xây dựng thuần và hệ số sử dụng đất theo QCVN 01:2021/BXD.",
        icon: "📐",
        badge: "QUY HOẠCH",
        description: "Quy chuẩn kỹ thuật quốc gia về quy hoạch xây dựng"
      }
    ];
  }

  const fileName = file.name || "tài liệu này";
  const nameLower = fileName.toLowerCase();
  const categoryLower = (file.category || "").toLowerCase();
  const textSample = (file.text || "").slice(0, 3000).toLowerCase();

  const prompts: QuickPrompt[] = [];

  // 1. Tóm tắt nội dung (Yêu cầu cốt lõi 1)
  prompts.push({
    id: "summary",
    label: "Tóm tắt nội dung",
    prompt: `Hãy tóm tắt ngắn gọn các nội dung cốt lõi, mục tiêu thiết kế và thông số kỹ thuật quan trọng nhất trong tài liệu "${fileName}".`,
    icon: "📋",
    badge: "TÓM TẮT",
    description: "Trích xuất 3-5 ý chính và thông số kỹ thuật quan trọng nhất"
  });

  // 2. Tìm quy chuẩn kỹ thuật (Yêu cầu cốt lõi 2)
  prompts.push({
    id: "standards",
    label: "Tìm quy chuẩn kỹ thuật",
    prompt: `Tìm kiếm, bóc tách và trích dẫn toàn bộ các tiêu chuẩn kỹ thuật, quy chuẩn quốc gia (TCVN, QCVN, ASTM, Eurocode) được viện dẫn hoặc áp dụng trong tài liệu "${fileName}".`,
    icon: "⚖️",
    badge: "QUY CHUẨN",
    description: "Đối chiếu và liệt kê các căn cứ pháp lý, điều khoản viện dẫn"
  });

  // 3. Liệt kê các danh mục thiết kế (Yêu cầu cốt lõi 3)
  prompts.push({
    id: "design_list",
    label: "Liệt kê danh mục thiết kế",
    prompt: `Liệt kê chi tiết các danh mục thiết kế, bản vẽ, cấu kiện chịu lực và các hạng mục kỹ thuật chính được trình bày trong "${fileName}".`,
    icon: "📐",
    badge: "DANH MỤC",
    description: "Bóc tách cây danh mục bản vẽ, cấu kiện và hạng mục công trình"
  });

  // 4. Contextual: Kết cấu (Structural)
  const isStructural = 
    nameLower.includes("kết cấu") || 
    nameLower.includes("ket cau") || 
    nameLower.includes("bê tông") || 
    nameLower.includes("dầm") || 
    nameLower.includes("cột") || 
    nameLower.includes("móng") || 
    categoryLower.includes("ketcau") || 
    textSample.includes("bê tông cốt thép") ||
    textSample.includes("mô men");

  if (isStructural) {
    prompts.push({
      id: "structural_check",
      label: "Bóc tách thông số kết cấu",
      prompt: `Bóc tách các thông số về tiết diện dầm, cột, sàn, cấp độ bền bê tông, mác thép và tải trọng thiết kế trong tài liệu "${fileName}".`,
      icon: "🧱",
      badge: "KẾT CẤU",
      description: "Trích xuất kích thước tiết diện, mác bê tông và chủng loại thép"
    });
  }

  // 5. Contextual: MEP & PCCC
  const isMepOrPccc = 
    nameLower.includes("mep") || 
    nameLower.includes("pccc") || 
    nameLower.includes("cháy") || 
    nameLower.includes("điện") || 
    nameLower.includes("nước") || 
    categoryLower.includes("mep") || 
    textSample.includes("phòng cháy") ||
    textSample.includes("thoát nạn");

  if (isMepOrPccc) {
    prompts.push({
      id: "pccc_mep",
      label: "Yêu cầu an toàn & PCCC",
      prompt: `Chỉ ra các yêu cầu kỹ thuật về an toàn phòng cháy chữa cháy, lối thoát nạn, hệ thống báo cháy và cơ điện MEP trong tài liệu "${fileName}".`,
      icon: "🔥",
      badge: "PCCC & MEP",
      description: "Đánh giá an toàn cháy, cấp thoát nước và hệ thống cơ điện"
    });
  }

  // 6. Contextual: Kiến trúc (Architecture)
  const isArchitecture = 
    nameLower.includes("kiến trúc") || 
    nameLower.includes("kien truc") || 
    nameLower.includes("mặt bằng") || 
    nameLower.includes("mặt đứng") || 
    categoryLower.includes("kientruc") || 
    textSample.includes("mặt bằng tầng") ||
    textSample.includes("chỉ giới");

  if (isArchitecture && !isStructural) {
    prompts.push({
      id: "architecture_rules",
      label: "Chỉ tiêu quy hoạch & Công năng",
      prompt: `Kiểm tra các chỉ tiêu quy hoạch kiến trúc, mật độ xây dựng, chiều cao tầng, khoảng lùi và bố trí công năng trong tài liệu "${fileName}".`,
      icon: "🏛️",
      badge: "KIẾN TRÚC",
      description: "Đối chiếu mật độ, khoảng lùi và phân khu công năng"
    });
  }

  // 7. Contextual: Tiêu chuẩn / Quy chuẩn pháp lý
  const isStandardDoc = 
    nameLower.includes("tcvn") || 
    nameLower.includes("qcvn") || 
    nameLower.includes("tiêu chuẩn") || 
    nameLower.includes("thông tư") || 
    ["qckt", "vbhh", "tckt", "ketcau_tcvn"].includes(categoryLower);

  if (isStandardDoc) {
    prompts.push({
      id: "mandatory_clauses",
      label: "Điều khoản bắt buộc tuân thủ",
      prompt: `Trích xuất các điều khoản quy định bắt buộc phải tuân thủ, giới hạn kỹ thuật tối đa/tối thiểu và điều kiện kiểm tra trong văn bản "${fileName}".`,
      icon: "🛡️",
      badge: "BẮT BUỘC",
      description: "Liệt kê các điều khoản pháp lý mang tính chất cưỡng chế thi hành"
    });
  }

  // 8. Cảnh báo rủi ro & Lưu ý thi công (Hữu ích cho mọi tài liệu kỹ thuật)
  prompts.push({
    id: "risk_warnings",
    label: "Cảnh báo an toàn & Rủi ro",
    prompt: `Chỉ ra các điểm cần đặc biệt lưu ý khi thi công, các sai sót thường gặp và các khuyến nghị an toàn kỹ thuật dựa trên tài liệu "${fileName}".`,
    icon: "⚠️",
    badge: "LƯU Ý",
    description: "Nhận diện rủi ro kỹ thuật, sai số cho phép và lưu ý thi công"
  });

  // 9. Bảng khối lượng & vật tư (BOQ)
  prompts.push({
    id: "boq_materials",
    label: "Bảng khối lượng & Vật tư",
    prompt: `Lập bảng tổng hợp các chủng loại vật liệu, quy cách kỹ thuật và thông số khối lượng được nêu trong tài liệu "${fileName}".`,
    icon: "📊",
    badge: "BOQ",
    description: "Tổng hợp bảng kê vật liệu, khối lượng và chỉ tiêu kỹ thuật"
  });

  return prompts;
}

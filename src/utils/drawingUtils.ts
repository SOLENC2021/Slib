import { DiffMarker } from "@/types";

export function generateDrawingDifferences(activeName: string, refName: string): DiffMarker[] {
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
    }
  ];
}

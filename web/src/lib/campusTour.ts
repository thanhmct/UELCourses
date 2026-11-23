export const TOUR_BASE = "https://web-dhkinhteluat.vt360.vn/";

export type CampusPlace = "A" | "B1" | "B2" | "sports" | "parking" | "gate";

export type TourArea = {
  id: string;
  label: string;
  scenes: readonly string[];
};

export const TOUR_AREAS = [
  {
    id: "outdoor",
    label: "Ngoài trời",
    scenes: [
      "Toàn cảnh UEL (chính diện)",
      "Toàn cảnh UEL (góc nghiêng)",
      "Toàn cảnh UEL (góc cao)",
      "Toàn cảnh UEL (phía sau)",
      "Cổng chính UEL",
      "Toàn cảnh sân trước",
      "Sân trước (trước sảnh A1)",
      "Toàn cảnh Vườn tượng",
      "Vườn tượng",
      "Sân Thể thao & Nhà thi đấu",
      "Khu Nhà xe",
    ],
  },
  {
    id: "A",
    label: "Tòa A",
    scenes: [
      "Toàn cảnh Tòa A",
      "Sảnh A1",
      "Viện Đào tạo Ngoại ngữ",
      "Khu vực trưng bày mô hình UEL",
      "Hội trường A (trước cửa)",
      "Hội trường A",
      "Hội trường A (sân khấu)",
      "Hành lang thang máy",
      "Phòng nghiên cứu BI LAB",
      "Phòng máy tính",
      "Phòng SAP Next-gen Lab",
      "A1 - P. 808 - Phòng Hoa Sen",
      "Cầu thang nối Tòa A1 - B1",
    ],
  },
  {
    id: "B1",
    label: "Tòa B1",
    scenes: [
      "Toàn cảnh Tòa B1- B2",
      "Tòa B1 - Sảnh tầng G",
      "Tòa B1- Hành lang tầng G",
      "Khu UELSpace",
      "Lớp Học Phát Triển Web KD",
    ],
  },
  {
    id: "B2",
    label: "Tòa B2",
    scenes: [
      "Tòa B2 - Tầng G - Thư viện",
      "Khu vực mượn sách",
      "Khu vực trả sách",
      "Không gian thư viện",
      "Tòa B2 - Tầng 1 - Thư viện",
      "Thư viện",
      "Phòng R & D",
      "Phòng họp",
      "Phòng học dạng nhóm",
    ],
  },
] as const satisfies readonly TourArea[];

export function tourUrl(scene: string): string {
  return `${TOUR_BASE}#media-name=${encodeURIComponent(scene)}`;
}

export function placeForRoom(room: string): CampusPlace | null {
  const normalized = room.trim().toUpperCase();
  if (/^A\d*(?:[.\s-]|$)/.test(normalized)) return "A";
  if (/^B1(?:[.\s-]|$)/.test(normalized)) return "B1";
  if (/^B2(?:[.\s-]|$)/.test(normalized)) return "B2";
  if (/^B(?:[.\s-]|$)/.test(normalized)) return "B1";
  return null;
}

export function isPhysicalEducation(code: string, name: string): boolean {
  return /^MI/i.test(code.trim()) || /thể chất|GDTC|physical education/i.test(name);
}

export function placeForLesson(code: string, name: string, room: string): CampusPlace | null {
  if (
    isPhysicalEducation(code, name) ||
    /sân|nhà thi đấu|NTĐ/i.test(room)
  ) {
    return "sports";
  }
  return placeForRoom(room);
}

export function sceneForPlace(place: CampusPlace): string {
  const scenes: Record<CampusPlace, string> = {
    A: "Toàn cảnh Tòa A",
    B1: "Tòa B1 - Sảnh tầng G",
    B2: "Toàn cảnh Tòa B1- B2",
    sports: "Sân Thể thao & Nhà thi đấu",
    parking: "Khu Nhà xe",
    gate: "Cổng chính UEL",
  };
  return scenes[place];
}

export function sceneForRoom(room: string): { scene: string; areaId: string; exact: boolean } {
  const normalized = room.trim().toUpperCase();
  const parts = normalized.match(/^([A-Z]+)(\d*)\s*(?:[.-]\s*|\s+)(\d+)/);
  const building = parts ? `${parts[1]}${parts[2]}` : (normalized.match(/^([A-Z]+\d*)/)?.[1] ?? "");
  const roomNumber = parts?.[3] ?? "";

  if (building === "A1" && roomNumber === "808") {
    return { scene: "A1 - P. 808 - Phòng Hoa Sen", areaId: "A", exact: true };
  }
  if (/^A\d*$/.test(building)) {
    return { scene: "Toàn cảnh Tòa A", areaId: "A", exact: false };
  }
  if (building === "B1") {
    return { scene: "Tòa B1 - Sảnh tầng G", areaId: "B1", exact: false };
  }
  if (building === "B" || building === "B2") {
    return { scene: "Toàn cảnh Tòa B1- B2", areaId: "B1", exact: false };
  }
  return { scene: "Toàn cảnh UEL (chính diện)", areaId: "outdoor", exact: false };
}

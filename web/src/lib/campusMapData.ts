import type { CampusPlace } from "@/lib/campusTour";

export const CAMPUS_MAP_WIDTH = 1490;
export const CAMPUS_MAP_HEIGHT = 970;
export const CAMPUS_MAP_FULL_VIEW = `0 0 ${CAMPUS_MAP_WIDTH} ${CAMPUS_MAP_HEIGHT}`;
export const CAMPUS_MAP_ZOOM_PADDING = 120;

export interface CampusMapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CampusAreaPlace = Exclude<CampusPlace, "gate1" | "gate2" | "gate2A" | "gate3">;
export type CampusGatePlace = Extract<CampusPlace, "gate1" | "gate2" | "gate2A" | "gate3">;

export const CAMPUS_AREA_RECTS: Record<CampusAreaPlace, CampusMapRect> = {
  sports: { x: 272, y: 183, width: 198, height: 45 },
  bikePark: { x: 887, y: 153, width: 93, height: 62 },
  lotusPond: { x: 880, y: 275, width: 155, height: 105 },
  A3: { x: 641, y: 287, width: 173, height: 153 },
  carPark: { x: 485, y: 343, width: 92, height: 50 },
  canteen: { x: 461, y: 432, width: 95, height: 43 },
  hall: { x: 692, y: 502, width: 78, height: 96 },
  A: { x: 632, y: 597, width: 196, height: 48 },
  B1: { x: 883, y: 598, width: 139, height: 47 },
  B2: { x: 1022, y: 572, width: 73, height: 90 },
};

export interface CampusGateData {
  x: number;
  y: number;
  labelDx: number;
  labelDy: number;
}

export const CAMPUS_GATES: Record<CampusGatePlace, CampusGateData> = {
  gate1: { x: 727, y: 838, labelDx: 0, labelDy: 40 },
  gate2: { x: 145, y: 815, labelDx: 55, labelDy: 40 },
  gate2A: { x: 222, y: 255, labelDx: 60, labelDy: -28 },
  gate3: { x: 845, y: 68, labelDx: -70, labelDy: 0 },
};

export const CAMPUS_B3_RECT: CampusMapRect = {
  x: 1095,
  y: 542,
  width: 157,
  height: 103,
};

export interface CampusRoadLabel {
  nameVi: string;
  nameEn: string;
  x: number;
  y: number;
  rotate: number;
  water?: boolean;
}

export const CAMPUS_ROAD_LABELS: readonly CampusRoadLabel[] = [
  { nameVi: "Lương Văn Can", nameEn: "Lương Văn Can", x: 745, y: 32, rotate: 0 },
  { nameVi: "Đỗ Mười", nameEn: "Đỗ Mười", x: 1000, y: 905, rotate: 0 },
  { nameVi: "Trần Đại Nghĩa", nameEn: "Trần Đại Nghĩa", x: 82, y: 470, rotate: -81 },
  { nameVi: "Hồ Xuân Hương", nameEn: "Hồ Xuân Hương", x: 1432, y: 470, rotate: 90 },
  { nameVi: "Suối Nhum", nameEn: "Nhum Stream", x: 1316, y: 520, rotate: 90, water: true },
  { nameVi: "Thống Nhất", nameEn: "Unity", x: 395, y: 252, rotate: 0 },
  { nameVi: "Thống Nhất", nameEn: "Unity", x: 1120, y: 254, rotate: 0 },
  { nameVi: "Tiên Phong", nameEn: "Pioneer", x: 596, y: 500, rotate: 90 },
  { nameVi: "Vượt Trội", nameEn: "Excellence", x: 862, y: 520, rotate: 90 },
  { nameVi: "Kinh Doanh", nameEn: "Business", x: 1268, y: 470, rotate: 90 },
  { nameVi: "Quản Lý", nameEn: "Management", x: 1000, y: 681, rotate: 0 },
  { nameVi: "Kiến Tạo", nameEn: "Creation", x: 400, y: 808, rotate: 0 },
  { nameVi: "Tương Lai", nameEn: "Future", x: 1010, y: 808, rotate: 0 },
  { nameVi: "Sáng Tạo", nameEn: "Creativity", x: 232, y: 560, rotate: -78 },
  { nameVi: "Thanh Niên", nameEn: "Youth", x: 380, y: 640, rotate: -35 },
];

export function campusPlaceBounds(place: CampusPlace): CampusMapRect {
  if (place in CAMPUS_AREA_RECTS) {
    return CAMPUS_AREA_RECTS[place as CampusAreaPlace];
  }

  const gate = CAMPUS_GATES[place as CampusGatePlace];
  return { x: gate.x, y: gate.y, width: 0, height: 0 };
}

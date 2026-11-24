import { describe, expect, it } from "vitest";
import {
  TOUR_AREAS,
  TOUR_BASE,
  isPhysicalEducation,
  placeForLesson,
  placeForRoom,
  sceneForPlace,
  sceneForRoom,
  tourUrl,
} from "@/lib/campusTour";

describe("campus tour", () => {
  it.each([
    ["A3.101", "Toàn cảnh UEL (góc cao)", "outdoor", false],
    ["Hội trường A", "Hội trường A", "A", false],
    ["Sân thể thao", "Sân Thể thao & Nhà thi đấu", "outdoor", false],
    ["A.709", "Toàn cảnh Tòa A", "A", false],
    [" a1 . 108 ", "Toàn cảnh Tòa A", "A", false],
    ["A2.301", "Toàn cảnh Tòa A", "A", false],
    ["A1.808", "A1 - P. 808 - Phòng Hoa Sen", "A", true],
    ["B1.203", "Tòa B1 - Sảnh tầng G", "B1", false],
    ["B2.205", "Toàn cảnh Tòa B1- B2", "B1", false],
    ["B.203", "Toàn cảnh Tòa B1- B2", "B1", false],
    ["C1.301", "Toàn cảnh UEL (chính diện)", "outdoor", false],
    ["phòng chưa biết", "Toàn cảnh UEL (chính diện)", "outdoor", false],
  ])("maps %s to the appropriate tour scene", (room, scene, areaId, exact) => {
    expect(sceneForRoom(room)).toEqual({ scene, areaId, exact });
  });

  it("encodes Vietnamese scene names in the official tour URL", () => {
    const scene = "Toàn cảnh UEL (chính diện)";
    expect(tourUrl(scene)).toBe(`${TOUR_BASE}#media-name=${encodeURIComponent(scene)}`);
  });

  it("only returns scenes present in the tour tree", () => {
    const knownScenes = new Set<string>(TOUR_AREAS.flatMap((area) => area.scenes));
    for (const room of ["A.709", "A1.108", "A1.808", "B1.203", "B2.205", "B.203", "C1.301", "unknown"]) {
      expect(knownScenes.has(sceneForRoom(room).scene)).toBe(true);
    }
  });

  it.each([
    ["A3.101", "A3"],
    ["A.709", "A"],
    ["A1.108", "A"],
    ["A2.301", "A"],
    ["B1.203", "B1"],
    ["B2.205", "B2"],
    ["B.203", "B1"],
    ["Hội trường A", "hall"],
    ["HT", "hall"],
    ["Nhà thi đấu", "sports"],
    ["C1.301", null],
  ])("maps room %s to campus place %s", (room, place) => {
    expect(placeForRoom(room)).toBe(place);
  });

  it.each([
    ["MI71", "Kỹ năng vận động"],
    ["PE01", "Movement skills"],
    ["MGT1001", "Giáo dục thể chất 1"],
    ["MGT1001", "GDTC"],
    ["MGT1001", "Physical Education"],
  ])("recognises physical education from %s / %s", (code, name) => {
    expect(isPhysicalEducation(code, name)).toBe(true);
  });

  it("prioritises the sports ground for PE lessons and sports rooms", () => {
    expect(placeForLesson("MI71", "Giáo dục thể chất 1", "A1.108")).toBe("sports");
    expect(placeForLesson("PE", "Physical training", "B2.205")).toBe("sports");
    expect(placeForLesson("BAA2028", "Nguyên lý kế toán", "Nhà thi đấu")).toBe("sports");
    expect(placeForLesson("BAA2028", "Nguyên lý kế toán", "B2.205")).toBe("B2");
  });

  it("maps every campus place to a known tour scene", () => {
    const knownScenes = new Set<string>(TOUR_AREAS.flatMap((area) => area.scenes));
    for (const place of ["A", "hall", "A3", "B1", "B2", "canteen", "carPark", "bikePark", "lotusPond", "sports", "gate1", "gate2", "gate2A", "gate3"] as const) {
      expect(knownScenes.has(sceneForPlace(place))).toBe(true);
    }
  });
});

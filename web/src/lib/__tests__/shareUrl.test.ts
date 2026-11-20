import { describe, expect, it } from "vitest";
import { buildShareUrl, decodeTimetable, encodeTimetable } from "../shareUrl";

describe("share URL", () => {
  const t = {
    semester: "261",
    entries: [
      { code: "EIE3004", class_code: "261EIE300401", color: 2, hidden: false },
      { code: "MI71", class_code: null, color: 0, hidden: true },
    ],
  };
  it("round-trips", () => {
    expect(decodeTimetable(encodeTimetable(t))).toEqual(t);
  });
  it("builds a full URL", () => {
    const url = buildShareUrl("https://uelcourses.local/", "/timetable", t);
    expect(url.startsWith("https://uelcourses.local/timetable?sem=261&m=")).toBe(true);
    expect(decodeTimetable(new URL(url).search)).toEqual(t);
  });
  it("returns null without a semester and tolerates junk", () => {
    expect(decodeTimetable("m=A~B~1")).toBeNull();
    const r = decodeTimetable("?sem=251&m=,KTE1001~~abc,KTE1001~dup~1,");
    expect(r).toEqual({ semester: "251", entries: [{ code: "KTE1001", class_code: null, color: 0, hidden: false }] });
  });
  it("handles an empty timetable", () => {
    expect(decodeTimetable(encodeTimetable({ semester: "252", entries: [] }))).toEqual({ semester: "252", entries: [] });
  });
});

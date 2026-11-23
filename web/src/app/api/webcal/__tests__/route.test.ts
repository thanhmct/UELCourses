// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "../route";

describe("timetable subscription name", () => {
  it.each([
    [null, "UELPATH Thời khóa biểu"],
    ["UELCourses 2026–2027 · HK1", "UELPATH 2026–2027 · HK1"],
    ["Lịch học của tôi", "Lịch học của tôi"],
  ])("returns the correct calendar name for %s", async (name, calendarName) => {
    const url = new URL("http://localhost/api/webcal?sem=261");
    if (name !== null) url.searchParams.set("name", name);

    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain("UELPATH-timetable.ics");
    const calendar = await response.text();
    expect(calendar).toContain(`X-WR-CALNAME:${calendarName}\r\n`);
    expect(calendar).toContain("PRODID:-//UELPATH//Timetable//VI\r\n");
  });
});

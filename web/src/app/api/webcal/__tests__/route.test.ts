// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("loads selected classes and module names from the backend", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/modules/BAA1001/classes?semester=2026-2027-1")) {
        return Response.json([
          {
            class_code: "BAA1001.01",
            module_code: "BAA1001",
            lessons: [{
              weekday: 2,
              start_period: 1,
              end_period: 3,
              start_time: "07:00",
              end_time: "09:30",
              room: "A.101",
              date_start: "2026-09-07",
              date_end: "2026-09-07",
            }],
          },
        ]);
      }
      if (url.endsWith("/api/modules/BAA1001")) {
        return Response.json({ name: "Kinh tế học" });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const url = new URL("http://localhost/api/webcal");
    url.searchParams.set("sem", "2026-2027-1");
    url.searchParams.set("m", "BAA1001~BAA1001.01~0");

    const response = await GET(new NextRequest(url));
    const calendar = await response.text();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(calendar).toContain("SUMMARY:BAA1001 Kinh tế học\r\n");
    expect(calendar).toContain("LOCATION:A.101\r\n");
  });

  it("returns 502 when the backend request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const url = new URL("http://localhost/api/webcal?sem=2026-2027-1&m=BAA1001~BAA1001.01~0");

    const response = await GET(new NextRequest(url));

    expect(response.status).toBe(502);
    expect(await response.text()).toBe("Không thể tải dữ liệu thời khóa biểu.");
  });
});

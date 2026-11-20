import { NextRequest, NextResponse } from "next/server";
import { decodeTimetable } from "@/lib/shareUrl";
import { buildIcs } from "@/lib/ics";
import { mockModules, mockSections } from "@/mocks/modules";
import type { ClassSection } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const data = searchParams.get("data");
  const name = searchParams.get("name") || "UELCourses Thời khóa biểu";

  // If no data param is given, try parsing from searchParams directly (e.g. ?sem=261&m=...)
  const decoded = data ? decodeTimetable(data) : decodeTimetable(searchParams);

  if (!decoded) {
    return new NextResponse("Invalid or missing timetable query. Provide ?sem=...&m=...", { status: 400 });
  }

  const allSections = mockSections(decoded.semester);
  const selectedSections: ClassSection[] = [];
  const moduleNames: Record<string, string> = {};

  for (const m of mockModules) {
    moduleNames[m.code] = m.name;
  }

  for (const entry of decoded.entries) {
    if (entry.hidden || !entry.class_code) continue;
    const sec = allSections.find((s) => s.class_code === entry.class_code);
    if (sec) {
      selectedSections.push(sec);
    }
  }

  const ics = buildIcs(selectedSections, { calendarName: name, moduleNames });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="uelcourses-timetable.ics"`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}

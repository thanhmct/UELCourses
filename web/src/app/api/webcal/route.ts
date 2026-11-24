import { NextRequest, NextResponse } from "next/server";
import { decodeTimetable } from "@/lib/shareUrl";
import { buildIcs } from "@/lib/ics";
import type { ClassSection } from "@/lib/types";

const FETCH_CONCURRENCY = 4;

type ModuleDetailResponse = {
  name?: string;
};

async function fetchApi<T>(path: string): Promise<T> {
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
  const response = await fetch(`${apiUrl}${path}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`API returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function loadModules(
  entries: { code: string; class_code: string }[],
  semester: string,
): Promise<{ selectedSections: ClassSection[]; moduleNames: Record<string, string> }> {
  const selectedSections: ClassSection[] = [];
  const moduleNames: Record<string, string> = {};

  for (let offset = 0; offset < entries.length; offset += FETCH_CONCURRENCY) {
    const batch = entries.slice(offset, offset + FETCH_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (entry) => {
        const code = encodeURIComponent(entry.code);
        const [sections, module] = await Promise.all([
          fetchApi<ClassSection[]>(`/api/modules/${code}/classes?semester=${encodeURIComponent(semester)}`),
          fetchApi<ModuleDetailResponse>(`/api/modules/${code}`),
        ]);
        if (!Array.isArray(sections)) throw new Error("Invalid class list");
        return {
          entry,
          section: sections.find((section) => section.class_code === entry.class_code),
          name: typeof module?.name === "string" ? module.name : entry.code,
        };
      }),
    );

    for (const result of results) {
      moduleNames[result.entry.code] = result.name;
      if (result.section) selectedSections.push(result.section);
    }
  }

  return { selectedSections, moduleNames };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const data = searchParams.get("data");
  // Previously generated subscription URLs carry the former brand in their name.
  const name = searchParams.get("name")?.replace(/^UEL ?Courses?(?=\s|$)/i, "UELPATH") || "UELPATH Thời khóa biểu";

  // If no data param is given, try parsing from searchParams directly (e.g. ?sem=261&m=...)
  const decoded = data ? decodeTimetable(data) : decodeTimetable(searchParams);

  if (!decoded) {
    return new NextResponse("Invalid or missing timetable query. Provide ?sem=...&m=...", { status: 400 });
  }

  const entries = decoded.entries.flatMap((entry) =>
    entry.hidden || !entry.class_code ? [] : [{ code: entry.code, class_code: entry.class_code }],
  );

  let selectedSections: ClassSection[];
  let moduleNames: Record<string, string>;
  try {
    ({ selectedSections, moduleNames } = await loadModules(entries, decoded.semester));
  } catch {
    return new NextResponse("Không thể tải dữ liệu thời khóa biểu.", { status: 502 });
  }

  const ics = buildIcs(selectedSections, { calendarName: name, moduleNames });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="UELPATH-timetable.ics"`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}

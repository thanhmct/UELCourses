// Encode / decode a timetable into URL query params so it can be shared.
// Format: ?sem=<semesterId>&m=<code>~<class>~<colorIndex>[~h],<code>~...

export interface TimetableEntry {
  code: string;
  class_code: string | null;
  color: number;
  hidden: boolean;
  /** Set on the original entry inserted from the planner, not on shared or copied drafts. */
  fromPlanner?: true;
}

export interface SharedTimetable {
  semester: string;
  entries: TimetableEntry[];
}

export function encodeTimetable(t: SharedTimetable): string {
  const params = new URLSearchParams();
  params.set("sem", t.semester);
  const m = t.entries
    .map((e) => {
      const parts = [e.code, e.class_code ?? "", String(e.color)];
      if (e.hidden) parts.push("h");
      return parts.map((p) => p.replace(/[~,]/g, "")).join("~");
    })
    .join(",");
  if (m) params.set("m", m);
  return params.toString();
}

export function decodeTimetable(query: string | URLSearchParams): SharedTimetable | null {
  const params = typeof query === "string" ? new URLSearchParams(query.replace(/^\?/, "")) : query;
  const semester = params.get("sem");
  if (!semester) return null;
  const raw = params.get("m") ?? "";
  const seen = new Set<string>();
  const entries: TimetableEntry[] = [];
  for (const item of raw.split(",")) {
    if (!item.trim()) continue;
    const [code, cls, color, flag] = item.split("~");
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const c = Number(color);
    entries.push({
      code,
      class_code: cls ? cls : null,
      color: Number.isInteger(c) && c >= 0 ? c : 0,
      hidden: flag === "h",
    });
  }
  return { semester, entries };
}

export function buildShareUrl(origin: string, path: string, t: SharedTimetable): string {
  return `${origin.replace(/\/$/, "")}${path}?${encodeTimetable(t)}`;
}

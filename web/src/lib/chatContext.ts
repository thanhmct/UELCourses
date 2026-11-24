import { parseProgramCode, type Degree } from "./programCode";
import { usePlanner, useSettings, useTimetable, type Theme } from "./store";
import { fold } from "./text";

export interface ChatContext {
  program_ids?: string[];
  degree?: Degree;
  timetable?: { semester: string; modules: number; credits?: number };
  planner?: { terms: number; modules: number; backlog: number };
  theme?: Theme;
}

export function cohortReply(text: string): string | undefined {
  const match = /^(?:(?:toi|minh|em)\s+(?:hoc\s+|thuoc\s+)?|cho\s+)?(?:k\s*|khoa\s+)(?:20)?(\d{2})[.!?]*$/.exec(fold(text));
  return match ? `K${match[1]}` : undefined;
}

export function chatContext(question: string, cohort: string): ChatContext | undefined {
  const { programCode, secondaryProgramCode, degree, theme } = useSettings.getState();
  const profile = [...programCode.split("+"), secondaryProgramCode]
    .map(parseProgramCode)
    .filter((item) => item !== null)
    .filter((item) => !/^K\d{2}$/.test(cohort) || !item.cohort.startsWith("K") || item.cohort === cohort);
  const program_ids = [...new Set(profile.map((item) => item.contextualProgramId))]
    .filter((id) => /^(?:K\d{5}(?:TE|T|H|E)?|M\d{3}(?:NC|UD)?|N\d{3}|[89]\d{6})$/.test(id)).slice(0, 2);
  const context: ChatContext = {};
  if (program_ids.length) context.program_ids = program_ids;
  if (program_ids.length || degree !== "dai_hoc") context.degree = degree;

  const query = fold(question);
  const personal = /\b(?:toi|minh|em|cua ban|hien tai|dang|my|current|i)\b/.test(query);
  const wantsPlan = /\b(?:ke hoach|lo trinh|planner|study plan)\b/.test(query);
  const wantsTimetable = /\b(?:thoi khoa bieu|tkb|lich hoc|timetable|schedule|da xep bao nhieu tin chi)\b/.test(query);
  if (personal && wantsTimetable) {
    const { semester, bySemester, info } = useTimetable.getState();
    if (/^20\d{2}-20\d{2}-[123]$/.test(semester)) {
      const codes = [...new Set((bySemester[semester] ?? []).map((entry) => entry.code))];
      const credits = codes.map((code) => info[code]?.credits);
      context.timetable = { semester, modules: codes.length };
      if (credits.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)) {
        context.timetable.credits = credits.reduce<number>((sum, value) => sum + (value ?? 0), 0);
      }
    }
  }
  if (personal && wantsPlan) {
    const { terms, backlog } = usePlanner.getState();
    const filled = terms.filter((term) => term.modules.length);
    context.planner = {
      terms: filled.length,
      modules: new Set(filled.flatMap((term) => term.modules)).size,
      backlog: new Set(backlog).size,
    };
  }
  if (personal && /\b(?:giao dien|theme|che do sang|che do toi)\b/.test(query)) context.theme = theme;
  return Object.keys(context).length ? context : undefined;
}

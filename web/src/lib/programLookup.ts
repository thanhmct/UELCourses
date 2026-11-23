import {
  cleanMajorName, DOCTORAL_MAJORS, MAJOR_EN, MASTER_ADMISSION_MAJORS, MASTER_MAJORS, parseProgramCode, validateProgramGroup,
  type Degree, type ParsedProgramCode,
} from "./programCode";
import { fold } from "./text";
import type { ProgramSummary, ValidProgramGroup } from "./types";

// Names for confirmed class groups whose curriculum is still absent from the API.
// https://tuyensinh.uel.edu.vn/thong-tin-tuyen-sinh-dai-hoc-chinh-quy-2026/
const undergraduateNames: Record<string, string> = {
  "420": "Quản lý chuỗi cung ứng và Logistics quốc tế",
  "421": "Kinh tế số",
  "503": "Luật dân sự",
  "504": "Luật tài chính - ngân hàng",
  "505": "Luật và Chính sách công",
  "506": "Luật và Công nghệ",
};

// K25–K26 tracks have BĐCL worksheets in the CTĐT import preview.
// These K23–K24 English tracks resolve through the existing contextual API.
const officialUndergraduateTracks = new Set([
  "K23402E", "K24402E", "K23404E", "K24404E",
  ...["K25", "K26"].flatMap((cohort) => [
    "402E", "402T", "404E", "405E", "406H", "407E", "408E", "408T", "408TE", "409T",
    "410E", "411E", "411T", "411TE", "413E", "414H", "502E", "502T", "502TE", "503E", "504T",
  ].map((track) => `${cohort}${track}`)),
]);

export function hasVerifiedUndergraduateTrack(programId: string) {
  return officialUndergraduateTracks.has(programId);
}

export type LookupTrack = "vi" | "en" | "coop" | "talent" | "talentEn" | "research" | "applied" | "other";
export type LookupDegree = Degree | "all";

export interface LookupOption {
  code: string;
  parsed: ParsedProgramCode;
  name: string;
  englishName: string;
  hasCurriculum: boolean;
}

export interface LookupMajor {
  id: string;
  name: string;
  englishName: string;
  degree: Degree;
  major: string;
  options: LookupOption[];
}

export function lookupTrack(parsed: ParsedProgramCode): LookupTrack {
  if (parsed.kind === "talent") return parsed.english ? "talentEn" : "talent";
  if (parsed.kind === "english") return "en";
  if (parsed.kind === "standard") return parsed.degree === "dai_hoc" ? "vi" : "other";
  return parsed.kind;
}

export function buildProgramLookup(programs: ProgramSummary[], groups: ValidProgramGroup[]) {
  const catalogue = new Map<string, ProgramSummary>();
  const majorNames = new Map<string, string>();
  for (const program of programs) {
    const parsed = parseProgramCode(program.program_id);
    if (!parsed) continue;
    catalogue.set(parsed.contextualProgramId, program);
    majorNames.set(`${parsed.degree}-${parsed.major}`, cleanMajorName(program.name));
  }

  const getName = (parsed: ParsedProgramCode) => {
    const programme = catalogue.get(parsed.contextualProgramId) ?? catalogue.get(parsed.programId);
    if (programme) return cleanMajorName(programme.name);
    const related = majorNames.get(`${parsed.degree}-${parsed.major}`);
    if (related) return related;
    if (parsed.degree === "thac_si") return MASTER_MAJORS[parsed.major] || MASTER_ADMISSION_MAJORS[parsed.major] || "";
    if (parsed.degree === "tien_si") return DOCTORAL_MAJORS[parsed.major] ?? "";
    return undergraduateNames[parsed.major] ?? "";
  };
  const hasCurriculum = (programId: string) => {
    const parsed = parseProgramCode(programId);
    const program = catalogue.get(programId)
      ?? (parsed?.kind === "english" && hasVerifiedUndergraduateTrack(programId) ? catalogue.get(parsed.programId) : undefined);
    return !!program && program.module_count !== 0;
  };
  const toOption = (parsed: ParsedProgramCode): LookupOption => {
    const name = getName(parsed);
    return {
      code: parsed.normalized,
      parsed,
      name,
      englishName: MAJOR_EN[name.toLowerCase()] ?? name,
      hasCurriculum: hasCurriculum(parsed.contextualProgramId),
    };
  };

  const options = new Map<string, LookupOption>();
  const exactCodes = new Map<string, LookupOption>();
  const addOption = (code: string) => {
    const parsed = parseProgramCode(code);
    if (parsed && !options.has(parsed.normalized)) options.set(parsed.normalized, toOption(parsed));
  };
  for (const id of catalogue.keys()) {
    const parsed = parseProgramCode(id)!;
    const validation = validateProgramGroup(parsed, groups);
    addOption(validation.defaultClassCode ?? id);
  }
  for (const id of officialUndergraduateTracks) {
    const parsed = parseProgramCode(id)!;
    if (getName(parsed)) addOption(id);
  }
  // The BĐCL master's worksheets list these programmes before their import.
  for (const id of ["M618NC", "M618UD", "M619"]) addOption(id);
  for (const code of Object.keys(DOCTORAL_MAJORS)) addOption(code);
  for (const group of groups) {
    const parsed = parseProgramCode(group.code);
    if (!parsed) continue;
    if (parsed.degree !== "dai_hoc") {
      addOption(parsed.contextualProgramId);
      if (parsed.normalized !== parsed.contextualProgramId) exactCodes.set(parsed.normalized, toOption(parsed));
      continue;
    }
    exactCodes.set(parsed.normalized, toOption(parsed));
    // A real class can be looked up by code. Suggest its track by name when a curriculum
    // or catalogue entry confirms the track is offered.
    if (parsed.kind === "standard" || group.source !== "class_sections") {
      if (options.has(parsed.contextualProgramId) || options.has(`${parsed.contextualProgramId}A`)) continue;
      const programme = parseProgramCode(parsed.contextualProgramId);
      const validation = validateProgramGroup(programme, groups);
      if (!validation.valid && [...options.values()].some(({ parsed: candidate }) =>
        candidate.contextualProgramId === parsed.contextualProgramId
      )) continue;
      addOption(validation.valid ? validation.defaultClassCode ?? parsed.contextualProgramId : parsed.normalized);
    }
  }
  const masterNames = new Set([...options.values()]
    .filter(({ parsed }) => parsed.degree === "thac_si").map(({ name }) => fold(name)));
  for (const [code, name] of Object.entries(MASTER_ADMISSION_MAJORS)) {
    if (!masterNames.has(fold(name))) addOption(code);
    else exactCodes.set(code, toOption(parseProgramCode(code)!));
  }

  const majors = new Map<string, LookupMajor>();
  for (const option of options.values()) {
    const { parsed, name, englishName } = option;
    const id = `${parsed.degree}-${parsed.major}`;
    if (!majors.has(id)) majors.set(id, { id, name, englishName, degree: parsed.degree, major: parsed.major, options: [] });
    majors.get(id)!.options.push(option);
    exactCodes.set(option.code, option);
  }
  return { majors: [...majors.values()], exactCodes: [...exactCodes.values()], catalogue, getName, hasCurriculum };
}

const degreeTerms: [Degree, RegExp][] = [
  ["dai_hoc", /\b(?:cu nhan(?! tai nang)|dai hoc|undergraduate|bachelor(?: s)?)\b/],
  ["thac_si", /\b(?:thac si|master(?: s)?|msc|mba)\b/],
  ["tien_si", /\b(?:tien si|doctorate|doctoral|ph\s?d)\b/],
];
const trackTerms: [LookupTrack, RegExp][] = [
  ["talent", /\b(?:cu nhan tai nang|tai nang|talent|cntn)\b/],
  ["en", /\b(?:tieng anh|english(?: language)?)\b/],
  ["vi", /\b(?:tieng viet|vietnamese(?: language)?|he chuan)\b/],
  ["coop", /\b(?:co\s?op|hop tac doanh nghiep)\b/],
  ["research", /\b(?:nghien cuu|research|nc)\b/],
  ["applied", /\b(?:ung dung|applied|ud)\b/],
];

export function parseLookupQuery(input: string) {
  const raw = input.trim().toUpperCase();
  const cohortOnly = /^(?:K\s?)?\d{2}$/.test(raw) && /^K/.test(raw);
  const code = !cohortOnly && /^(?:[KCBNM]\d[\w-]*|\d{4,}[A-Z\d-]*)$/.test(raw)
    ? (parseProgramCode(raw)?.normalized ?? (/^\d{4,5}$/.test(raw) ? `K${raw}` : raw))
    : "";
  if (code) return { code, degree: undefined, cohort: "", track: undefined, words: [] };

  let query = fold(input).replace(/[^a-z0-9]+/g, " ");
  const cohortMatch = /\b(?:k\s*|khoa\s+|cohort\s+|intake\s+)((?:20)?\d{2})\b/.exec(query);
  if (cohortMatch) query = query.replace(cohortMatch[0], " ");
  const tracks = trackTerms.filter(([, pattern]) => pattern.test(query));
  for (const [, pattern] of tracks) query = query.replace(pattern, " ");
  const track = tracks.some(([value]) => value === "talent") && tracks.some(([value]) => value === "en")
    ? "talentEn" : tracks[0]?.[0];
  const degree = degreeTerms.find(([, pattern]) => pattern.test(query));
  if (degree) query = query.replace(degree[1], " ");
  query = query.replace(/\b(?:chuong trinh|he|nganh|chuyen nganh|programme|program|track|huong)\b/g, " ");
  return { code, degree: degree?.[0], cohort: cohortMatch ? `K${cohortMatch[1].slice(-2)}` : "", track, words: query.trim().split(/\s+/).filter(Boolean) };
}

export function searchProgramMajors(majors: LookupMajor[], query: ReturnType<typeof parseLookupQuery>, degree: LookupDegree, lang: "vi" | "en") {
  return majors.flatMap((major) => {
    const wantedDegree = query.degree ?? degree;
    if (wantedDegree !== "all" && major.degree !== wantedDegree) return [];
    const searchable = fold(`${major.major} ${major.name} ${major.englishName} ${major.options.map(({ name, englishName, code }) => `${name} ${englishName} ${code}`).join(" ")}`)
      .replace(/[^a-z0-9]+/g, " ");
    if (!query.words.every((word) => /^\d+$/.test(word) ? major.major.startsWith(word) : searchable.includes(word))) return [];
    const options = major.options.filter(({ parsed }) => {
      if (query.cohort && parsed.degree === "dai_hoc" && parsed.cohort !== query.cohort) return false;
      const track = lookupTrack(parsed);
      return !query.track || track === query.track
        || (track === "talentEn" && (query.track === "talent" || query.track === "en"));
    });
    return options.length ? [{ ...major, options }] : [];
  }).sort((a, b) => {
    const order = ["dai_hoc", "thac_si", "tien_si"];
    return order.indexOf(a.degree) - order.indexOf(b.degree)
      || (lang === "en" ? a.englishName.localeCompare(b.englishName, "en") : a.name.localeCompare(b.name, "vi"))
      || a.major.localeCompare(b.major);
  });
}

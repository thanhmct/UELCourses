import type { ClassSection, Lesson } from "./types";
import type { TimetableModuleInfo } from "./store";
import type { Lang } from "@/i18n";
import { moduleName } from "@/i18n/names";
import { weekdayName } from "@/i18n";
import { formatDateVi } from "./dates";

export interface TimetableExportRow {
  faculty: string;
  courseCode: string;
  courseName: string;
  credit: number | string;
  schedule: string;
  classroom: string;
  startEndDate: string;
  lecturer: string;
  lecturerEmail: string;
}

export const EXPORT_HEADERS = [
  "Faculty",
  "Course code",
  "Course name",
  "Credit",
  "Schedule (GMT+7)",
  "Classroom",
  "Start - End date (dd/mm/yyyy)",
  "Lecturer",
  "Lecturer's email form database",
] as const;

export function formatLessonSchedule(
  lesson: Lesson,
  t: (k: string, p?: Record<string, string | number>) => string,
): string {
  const day = weekdayName(t, lesson.weekday);
  const periods = (lesson.start_period && lesson.end_period)
    ? t("det.periods", { s: lesson.start_period, e: lesson.end_period })
    : "";
  const time = (lesson.start_time && lesson.end_time)
    ? `(${lesson.start_time} - ${lesson.end_time})`
    : "";
  const parts = [day, periods, time].filter(Boolean);
  return parts.join(", ").replace(", (", " (");
}

export function formatSectionSchedule(
  section: ClassSection,
  t: (k: string, p?: Record<string, string | number>) => string,
): string {
  if (section.lessons && section.lessons.length > 0) {
    return section.lessons.map((l) => formatLessonSchedule(l, t)).join("; ");
  }
  return section.schedule_raw || "";
}

export function formatSectionClassroom(section: ClassSection): string {
  const rooms = Array.from(
    new Set(section.lessons.map((l) => l.room).filter((r): r is string => Boolean(r && r.trim()))),
  );
  if (!rooms.length && section.rooms?.length) {
    rooms.push(...section.rooms.filter((r) => Boolean(r && r.trim())));
  }
  return rooms.join(", ");
}

export function formatSectionStartEndDate(section: ClassSection): string {
  let start = section.start_date;
  let end = section.end_date;

  if (!start || !end) {
    const starts = section.lessons.map((l) => l.date_start).filter(Boolean) as string[];
    const ends = section.lessons.map((l) => l.date_end).filter(Boolean) as string[];
    if (!start && starts.length) start = [...starts].sort()[0];
    if (!end && ends.length) end = [...ends].sort().slice(-1)[0];
  }

  const s = formatDateVi(start);
  const e = formatDateVi(end);
  if (s && e && s !== e) {
    return `${s} - ${e}`;
  }
  return s || e || "";
}

export function buildExportRows(
  selected: ClassSection[],
  infoMap: Record<string, TimetableModuleInfo | undefined>,
  lang: Lang,
  t: (k: string, p?: Record<string, string | number>) => string,
): TimetableExportRow[] {
  return selected.map((section) => {
    const info = infoMap[section.module_code];
    const faculty = lang === "en" ? (info?.faculty_en || info?.faculty || "") : (info?.faculty || "");
    const courseCode = section.class_code || section.module_code;
    const courseName = info ? moduleName(info, lang) : section.module_code;
    const credit = info?.credits ?? "";
    const schedule = formatSectionSchedule(section, t);
    const classroom = formatSectionClassroom(section);
    const startEndDate = formatSectionStartEndDate(section);
    const lecturer = section.lecturer || "";
    const lecturerEmail = section.lecturer_email || info?.lecturer_email || "";

    return {
      faculty,
      courseCode,
      courseName,
      credit,
      schedule,
      classroom,
      startEndDate,
      lecturer,
      lecturerEmail,
    };
  });
}

export function buildTimetableCsv(rows: TimetableExportRow[]): string {
  const escapeCsv = (val: string | number) => {
    const s = String(val ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [
    EXPORT_HEADERS.map(escapeCsv).join(","),
    ...rows.map((r) =>
      [
        r.faculty,
        r.courseCode,
        r.courseName,
        r.credit,
        r.schedule,
        r.classroom,
        r.startEndDate,
        r.lecturer,
        r.lecturerEmail,
      ]
        .map(escapeCsv)
        .join(","),
    ),
  ];

  return "\uFEFF" + lines.join("\r\n");
}

function crc32(bytes: Uint8Array): number {
  let table = (crc32 as unknown as { table?: Uint32Array }).table;
  if (!table) {
    table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c >>> 0;
    }
    (crc32 as unknown as { table?: Uint32Array }).table = table;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function createZip(files: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const fileRecords: {
    nameBytes: Uint8Array;
    data: Uint8Array;
    crc: number;
    offset: number;
  }[] = [];

  let totalLocalSize = 0;
  let totalCentralSize = 0;

  for (const f of files) {
    const nameBytes = encoder.encode(f.name);
    const crc = crc32(f.data);
    fileRecords.push({
      nameBytes,
      data: f.data,
      crc,
      offset: totalLocalSize,
    });
    totalLocalSize += 30 + nameBytes.length + f.data.length;
    totalCentralSize += 46 + nameBytes.length;
  }

  const totalSize = totalLocalSize + totalCentralSize + 22;
  const buffer = new Uint8Array(totalSize);
  const view = new DataView(buffer.buffer);
  let pos = 0;

  // Local file headers + data
  for (const r of fileRecords) {
    view.setUint32(pos, 0x04034b50, true);
    view.setUint16(pos + 4, 20, true);
    view.setUint16(pos + 6, 0x0800, true); // UTF-8
    view.setUint16(pos + 8, 0, true); // Stored (no compression)
    view.setUint16(pos + 10, 0, true);
    view.setUint16(pos + 12, 0, true);
    view.setUint32(pos + 14, r.crc, true);
    view.setUint32(pos + 18, r.data.length, true);
    view.setUint32(pos + 22, r.data.length, true);
    view.setUint16(pos + 26, r.nameBytes.length, true);
    view.setUint16(pos + 28, 0, true);
    pos += 30;
    buffer.set(r.nameBytes, pos);
    pos += r.nameBytes.length;
    buffer.set(r.data, pos);
    pos += r.data.length;
  }

  const centralOffset = pos;

  // Central directory headers
  for (const r of fileRecords) {
    view.setUint32(pos, 0x02014b50, true);
    view.setUint16(pos + 4, 20, true);
    view.setUint16(pos + 6, 20, true);
    view.setUint16(pos + 8, 0x0800, true);
    view.setUint16(pos + 10, 0, true);
    view.setUint16(pos + 12, 0, true);
    view.setUint16(pos + 14, 0, true);
    view.setUint32(pos + 16, r.crc, true);
    view.setUint32(pos + 20, r.data.length, true);
    view.setUint32(pos + 24, r.data.length, true);
    view.setUint16(pos + 28, r.nameBytes.length, true);
    view.setUint16(pos + 30, 0, true);
    view.setUint16(pos + 32, 0, true);
    view.setUint16(pos + 34, 0, true);
    view.setUint16(pos + 36, 0, true);
    view.setUint32(pos + 38, 0, true);
    view.setUint32(pos + 42, r.offset, true);
    pos += 46;
    buffer.set(r.nameBytes, pos);
    pos += r.nameBytes.length;
  }

  // End of central directory record
  view.setUint32(pos, 0x06054b50, true);
  view.setUint16(pos + 4, 0, true);
  view.setUint16(pos + 6, 0, true);
  view.setUint16(pos + 8, files.length, true);
  view.setUint16(pos + 10, files.length, true);
  view.setUint32(pos + 12, totalCentralSize, true);
  view.setUint32(pos + 16, centralOffset, true);
  view.setUint16(pos + 20, 0, true);

  return buffer;
}

function escapeXml(str: unknown): string {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function colName(n: number): string {
  let s = "";
  let current = n;
  while (current >= 0) {
    s = String.fromCharCode((current % 26) + 65) + s;
    current = Math.floor(current / 26) - 1;
  }
  return s;
}

export function buildTimetableXlsx(rows: TimetableExportRow[]): Uint8Array {
  const encoder = new TextEncoder();

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Timetable" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><name val="Calibri"/><sz val="11"/></font>
    <font><b/><name val="Calibri"/><sz val="11"/><color rgb="FF002060"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/></border>
    <border>
      <left style="thin"><color rgb="FFB0C4DE"/></left>
      <right style="thin"><color rgb="FFB0C4DE"/></right>
      <top style="thin"><color rgb="FFB0C4DE"/></top>
      <bottom style="thin"><color rgb="FFB0C4DE"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;

  const allRows: (string | number)[][] = [
    [...EXPORT_HEADERS],
    ...rows.map((r) => [
      r.faculty,
      r.courseCode,
      r.courseName,
      r.credit,
      r.schedule,
      r.classroom,
      r.startEndDate,
      r.lecturer,
      r.lecturerEmail,
    ]),
  ];

  let sheetData = "";
  allRows.forEach((row, rIdx) => {
    const rowNum = rIdx + 1;
    const isHeader = rIdx === 0;
    sheetData += `<row r="${rowNum}"${isHeader ? ' ht="28" customHeight="1"' : ""}>`;
    row.forEach((val, cIdx) => {
      const cellRef = `${colName(cIdx)}${rowNum}`;
      if (typeof val === "number") {
        const styleId = isHeader ? 1 : 2;
        sheetData += `<c r="${cellRef}" s="${styleId}"><v>${val}</v></c>`;
      } else {
        const styleId = isHeader ? 1 : (cIdx === 3 || cIdx === 1 ? 2 : 0);
        sheetData += `<c r="${cellRef}" t="inlineStr" s="${styleId}"><is><t xml:space="preserve">${escapeXml(val)}</t></is></c>`;
      }
    });
    sheetData += `</row>`;
  });

  const sheet1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>
    <col min="1" max="1" width="28" customWidth="1"/>
    <col min="2" max="2" width="16" customWidth="1"/>
    <col min="3" max="3" width="36" customWidth="1"/>
    <col min="4" max="4" width="10" customWidth="1"/>
    <col min="5" max="5" width="38" customWidth="1"/>
    <col min="6" max="6" width="18" customWidth="1"/>
    <col min="7" max="7" width="30" customWidth="1"/>
    <col min="8" max="8" width="24" customWidth="1"/>
    <col min="9" max="9" width="32" customWidth="1"/>
  </cols>
  <sheetData>
    ${sheetData}
  </sheetData>
</worksheet>`;

  return createZip([
    { name: "[Content_Types].xml", data: encoder.encode(contentTypes) },
    { name: "_rels/.rels", data: encoder.encode(rels) },
    { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(workbookRels) },
    { name: "xl/workbook.xml", data: encoder.encode(workbook) },
    { name: "xl/styles.xml", data: encoder.encode(styles) },
    { name: "xl/worksheets/sheet1.xml", data: encoder.encode(sheet1) },
  ]);
}

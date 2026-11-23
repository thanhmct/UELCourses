import type { Lang } from "@/i18n";

const FEMALE_GIVEN_NAMES = new Set([
  "Anh", "Hân", "Hoa", "Hương", "Lan", "Linh", "Mai", "My", "Nhung",
  "Oanh", "Phương", "Quỳnh", "Thảo", "Thư", "Trâm", "Trang", "Tuyết",
  "Uyên", "Vy", "Yến",
]);

const MALE_GIVEN_NAMES = new Set([
  "Bình", "Cường", "Dũng", "Hải", "Hoàng", "Hùng", "Khánh", "Long",
  "Nam", "Phong", "Phúc", "Quân", "Sơn", "Thành", "Thắng", "Tuấn",
]);

function englishHonorific(name: string): string {
  const parts = name.trim().split(/\s+/u);
  const givenName = parts.at(-1) ?? "";

  if (parts.includes("Thị") || FEMALE_GIVEN_NAMES.has(givenName)) return "Ms.";
  if (parts.includes("Văn") || MALE_GIVEN_NAMES.has(givenName)) return "Mr.";
  return "MSc.";
}

/** Translate Vietnamese lecturer titles for English UI without changing stored data. */
export function formatLecturerName(value: string | undefined, lang: Lang): string | undefined {
  if (!value || lang !== "en") return value;

  const lecturer = value.trim();
  const titleRules: ReadonlyArray<readonly [RegExp, string]> = [
    [/^GS\.?\s*TS\.?\s*/iu, "Prof. Dr."],
    [/^PGS\.?\s*TS\.?\s*/iu, "Assoc. Prof. Dr."],
    [/^TS\.?\s*/iu, "Dr."],
  ];

  for (const [pattern, title] of titleRules) {
    if (pattern.test(lecturer)) return lecturer.replace(pattern, `${title} `).trim();
  }

  const mastersMatch = lecturer.match(/^(?:ThS\.?|Thạc\s+sĩ)\s*(.+)$/iu);
  if (mastersMatch) {
    const name = mastersMatch[1].trim();
    return `${englishHonorific(name)} ${name}`;
  }

  return lecturer;
}

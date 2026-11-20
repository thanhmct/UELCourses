/** Lowercase and strip Vietnamese diacritics for forgiving search. */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

export function matches(haystack: string, needle: string): boolean {
  const n = fold(needle);
  return !n || fold(haystack).includes(n);
}

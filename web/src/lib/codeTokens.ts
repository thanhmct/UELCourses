/**
 * Ô nhập nhiều mã môn: mã được ngăn bằng khoảng trắng, dấu phẩy, dấu chấm, dấu chấm phẩy hoặc xuống dòng
 * (cùng quy tắc với parseCodes). Sau mỗi dấu ngăn là một mã MỚI; "mã đang gõ" là đoạn cuối cùng.
 */
const SEP = /[\s,.;]/;

/** Tách danh sách mã bằng khoảng trắng, dấu phẩy, dấu chấm, dấu chấm phẩy hoặc xuống dòng; viết hoa và bỏ trùng. */
export function parseCodes(input: string): string[] {
  const seen = new Set<string>();
  for (const raw of input.split(/[\s,.;]+/)) {
    const code = raw.trim().toUpperCase();
    if (code) seen.add(code);
  }
  return [...seen];
}

/** Mã đang gõ dở: đoạn sau dấu ngăn cuối cùng (rỗng nếu vừa gõ dấu ngăn), kèm vị trí bắt đầu trong chuỗi. */
export function activeToken(text: string): { token: string; start: number } {
  let i = text.length;
  while (i > 0 && !SEP.test(text[i - 1])) i--;
  return { token: text.slice(i), start: i };
}

/** Thay mã đang gõ dở bằng `code` và thêm ", " để người dùng gõ tiếp mã kế. */
export function replaceActiveToken(text: string, code: string): string {
  const { start } = activeToken(text);
  return `${text.slice(0, start)}${code}, `;
}

/** Các mã ĐÃ gõ xong (mọi đoạn trừ đoạn đang gõ), viết hoa, bỏ trùng. */
export function finishedCodes(text: string): string[] {
  const { start } = activeToken(text);
  const seen = new Set<string>();
  for (const raw of text.slice(0, start).split(/[\s,.;]+/)) {
    const c = raw.trim().toUpperCase();
    if (c) seen.add(c);
  }
  return [...seen];
}

/** Sắp gợi ý: mã bắt đầu bằng phần đang gõ lên trước, rồi theo mã; bỏ các mã đã gõ xong. */
export function rankSuggestions<T extends { code: string }>(items: T[], token: string, done: string[]): T[] {
  const t = token.trim().toUpperCase();
  const skip = new Set(done);
  return items
    .filter((m) => !skip.has(m.code.toUpperCase()))
    .sort((a, b) => {
      const pa = a.code.toUpperCase().startsWith(t) ? 0 : 1;
      const pb = b.code.toUpperCase().startsWith(t) ? 0 : 1;
      return pa - pb || a.code.localeCompare(b.code);
    });
}

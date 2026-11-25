"use client";

/**
 * Ngăn xếp điều hướng trong phiên làm việc (sessionStorage), dùng để nút "Quay lại"
 * trả về đúng trang trước đó mà người dùng thực sự đến từ đâu — không dựa vào
 * document.referrer, vốn không đổi khi chuyển trang kiểu SPA (pushState) trong Next.js.
 */

const STACK_KEY = "uel:nav-stack";
const SKIP_KEY = "uel:nav-skip-next";
const MAX_STACK = 50;

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readStack(storage: Storage): string[] {
  try {
    const raw = storage.getItem(STACK_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeStack(storage: Storage, stack: string[]) {
  try {
    storage.setItem(STACK_KEY, JSON.stringify(stack.slice(-MAX_STACK)));
  } catch {
    // Bộ nhớ phiên đầy hoặc bị chặn (vd. chế độ ẩn danh nghiêm ngặt): bỏ qua, back sẽ dùng href mặc định.
  }
}

/** Gọi khi route đổi do điều hướng thường (Link, router.push...), ghi lại trang hiện tại vào ngăn xếp. */
export function recordVisit(path: string) {
  const storage = getStorage();
  if (!storage) return;
  if (storage.getItem(SKIP_KEY)) {
    storage.removeItem(SKIP_KEY);
    return;
  }
  const stack = readStack(storage);
  if (stack[stack.length - 1] === path) return;
  stack.push(path);
  writeStack(storage, stack);
}

/**
 * Lấy và gỡ trang trước đó khỏi ngăn xếp để điều hướng "Quay lại" tới đúng trang đó.
 * Trả về null nếu không có lịch sử trong phiên (vd. mở thẳng trang này bằng URL).
 */
export function consumeBackTarget(currentPath: string): string | null {
  const storage = getStorage();
  if (!storage) return null;
  const stack = readStack(storage);
  while (stack.length && stack[stack.length - 1] === currentPath) stack.pop();
  const target = stack.pop();
  writeStack(storage, stack);
  if (target) storage.setItem(SKIP_KEY, "1");
  return target ?? null;
}

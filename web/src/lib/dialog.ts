/**
 * Hộp thoại dùng chung thay cho window.confirm / window.prompt.
 * Trang gọi appConfirm / appPrompt (trả về Promise); AppDialog (đã gắn trong layout) hiển thị hộp thoại nổi.
 */

export interface ConfirmOptions {
  title?: string;
  okLabel?: string;
  cancelLabel?: string;
  compact?: boolean;
  /** nút xác nhận màu đỏ (xóa dữ liệu, xóa bản nháp…) */
  danger?: boolean;
}

export interface PromptOptions extends ConfirmOptions {
  defaultValue?: string;
  placeholder?: string;
  /** trả về thông báo lỗi nếu giá trị chưa hợp lệ (hộp thoại giữ nguyên); null nếu hợp lệ */
  validate?: (value: string) => string | null;
}

export type DialogRequest =
  | { kind: "confirm"; message: string; opts: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: "prompt"; message: string; opts: PromptOptions; resolve: (value: string | null) => void };

let host: ((r: DialogRequest) => void) | null = null;

export function registerDialogHost(fn: ((r: DialogRequest) => void) | null) {
  host = fn;
}

export function appConfirm(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!host) return resolve(window.confirm(message));
    host({ kind: "confirm", message, opts, resolve });
  });
}

/** Trả về chuỗi đã cắt khoảng trắng, hoặc null nếu người dùng hủy. */
export function appPrompt(message: string, opts: PromptOptions = {}): Promise<string | null> {
  return new Promise((resolve) => {
    if (!host) {
      const v = window.prompt(message, opts.defaultValue ?? "");
      return resolve(v === null ? null : v.trim());
    }
    host({ kind: "prompt", message, opts, resolve });
  });
}

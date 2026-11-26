"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/i18n";

/**
 * Sau khi đăng nhập OAuth, backend chuyển người dùng về đúng trang họ đã rời đi (kèm ?login=ok|error).
 * Component này đọc tham số đó một lần, báo kết quả bằng toast, rồi dọn sạch URL (không lặp khi tải lại).
 */
export function LoginReturnNotice() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useT();

  useEffect(() => {
    const login = searchParams?.get("login");
    if (!login) return;

    if (login === "ok") {
      window.dispatchEvent(new CustomEvent("uel:toast", { detail: t("auth.loginSuccessToast") }));
    } else if (login === "error") {
      const message = searchParams.get("message");
      window.dispatchEvent(new CustomEvent("uel:toast", { detail: message || t("auth.loginErrorToast") }));
    }

    const rest = new URLSearchParams(searchParams?.toString());
    rest.delete("login");
    rest.delete("reason");
    rest.delete("message");
    const qs = rest.toString();
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    router.replace(`${pathname}${qs ? `?${qs}` : ""}${hash}`, { scroll: false });
    // Chỉ chạy một lần khi phát hiện tham số login= trên URL ban đầu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

"use client";
import { useEffect, useRef } from "react";

/**
 * Trên điện thoại, khi một lớp phủ (danh sách mở rộng, bộ lọc toàn màn hình...)
 * đang mở, nút quay lại của hệ thống (Android/iOS) chỉ đóng lớp phủ đó thay vì
 * rời khỏi trang. Cách làm: đẩy thêm một mục lịch sử khi mở; nút quay lại sẽ
 * tiêu thụ mục đó trước (sự kiện popstate) rồi mới thoát trang ở lần bấm sau.
 */
export function useBackToClose(active: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    window.history.pushState({ __overlay: true }, "");
    const onPopState = () => onCloseRef.current();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [active]);
}

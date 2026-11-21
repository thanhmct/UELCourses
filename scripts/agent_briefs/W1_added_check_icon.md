# Brief W1 — dấu tích xanh dương thay chữ "Đã thêm…" trong ModuleActions

Chỉ sửa file `web/src/components/ModuleActions.tsx` (không sửa file khác, không commit).

Hiện tại: bấm "+ Thời khóa biểu" / "+ Kế hoạch" thì hiện chữ xanh lá "Đã thêm vào thời khóa biểu" / "Đã thêm vào kế hoạch" bên cạnh nút, tự mất sau 1,8 giây.

Yêu cầu:
1. Bỏ dòng chữ thông báo `{msg && <span ...>}`. Thay bằng: **chỉ trong chính nút vừa bấm**, nhãn đổi thành dấu tích `✓` màu xanh dương (class `text-blue-600 dark:text-blue-400`) đứng trước nhãn gốc (vd `✓ Thời khóa biểu`), trong 1,8 giây rồi trở lại `+ ...`. Nút còn lại không đổi.
2. Dùng hai state riêng (ví dụ `doneTT`, `donePlan`: boolean) thay cho `msg`. Giữ thông báo cho người dùng trình đọc màn hình: thêm `<span className="sr-only" role="status">` chứa chuỗi `t("act.addedTT")` / `t("act.addedTTNoSem")` / `t("act.addedPlan")` đúng như logic cũ.
3. Đặt `aria-label` của nút vừa bấm bằng chuỗi "đã thêm" tương ứng khi đang ở trạng thái tích.
4. Không đổi chữ gốc của nút (`t("act.toTT")`, `t("act.toPlan")`), không đổi kiểu `compact`, không thêm thư viện.
5. Kiểm tra: `cd web; npx tsc --noEmit` và `npx vitest run` đều phải qua.

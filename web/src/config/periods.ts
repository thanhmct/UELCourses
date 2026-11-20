// ===== Khung giờ tiết học UEL — sửa ở đây nếu nhà trường thay đổi =====
// Mốc đã xác nhận từ dữ liệu thật: T1 07:00, T2 07:50, T4 09:45, T7 12:30, T8 13:20, T10 15:15.
// Các tiết còn lại được nội suy (50 phút/tiết, nghỉ giữa giờ) — cần đối chiếu lại khi có lịch chính thức.

export const PERIOD_MINUTES = 50;

/** Giờ bắt đầu của từng tiết, index 0 = tiết 1. */
export const PERIOD_START_TIMES: string[] = [
  "07:00", // 1 (xác nhận)
  "07:50", // 2 (xác nhận)
  "08:40", // 3 (nội suy: 07:50 + 50')
  "09:45", // 4 (xác nhận, sau giờ nghỉ 15')
  "10:35", // 5 (nội suy)
  "11:25", // 6 (nội suy)
  "12:30", // 7 (xác nhận)
  "13:20", // 8 (xác nhận)
  "14:10", // 9 (nội suy)
  "15:15", // 10 (xác nhận, sau giờ nghỉ 15')
  "16:05", // 11 (nội suy)
  "16:55", // 12 (nội suy)
  "17:45", // 13 (nội suy)
  "18:35", // 14 (nội suy)
  "19:25", // 15 (nội suy)
];

/** Tiết cuối của mỗi buổi (để vẽ vạch phân cách trên lưới). */
export const SESSION_BOUNDARIES = {
  morningEnd: 6, // tiết 1–6: sáng
  afternoonEnd: 12, // tiết 7–12: chiều
  // tiết 13–15: tối
};

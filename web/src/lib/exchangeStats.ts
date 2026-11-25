/** Số SV trao đổi đã học một học phần trong một học kỳ (API GET /api/exchange-stats). */
export interface ExchangeSemesterCount {
  semester_id: string;
  students: number;
}

export interface ExchangeStatItem {
  module_code: string;
  /** Tổng số SV trao đổi (cộng các học kỳ) */
  total: number;
  by_semester: ExchangeSemesterCount[];
}

export interface ExchangeStatList {
  items: ExchangeStatItem[];
}

/**
 * Nút "Tôi là sinh viên trao đổi" chỉ hiện trong giao diện tiếng Anh.
 * Không bắt buộc chọn CTĐT (sinh viên trao đổi thường chưa có CTĐT tại UEL).
 */
export function canOfferExchangeTick(lang: string): boolean {
  return lang === "en";
}

/** Thông tin thống kê chỉ hiện ở giao diện tiếng Anh khi sinh viên đã bật chế độ trao đổi. */
export function isExchangeViewActive(lang: string, exchangeStudent: boolean): boolean {
  return exchangeStudent && canOfferExchangeTick(lang);
}

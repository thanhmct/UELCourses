import { parseProgramCode } from "./programCode";

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

/** Ô tick "SV trao đổi" chỉ hiện trong cửa sổ tiếng Anh, khi CTĐT đang chọn là CTĐT tiếng Anh. */
export function canOfferExchangeTick(lang: string, programCode: string): boolean {
  return lang === "en" && parseProgramCode(programCode)?.english === true;
}

/** Thông tin thống kê chỉ hiện khi đủ điều kiện và sinh viên đã tick. */
export function isExchangeViewActive(lang: string, programCode: string, exchangeStudent: boolean): boolean {
  return exchangeStudent && canOfferExchangeTick(lang, programCode);
}

"use client";
import { useT } from "@/i18n";
import { canOfferExchangeTick } from "@/lib/exchangeStats";
import { useSettings } from "@/lib/store";

/**
 * Ô tick "Tôi là sinh viên trao đổi". Chỉ hiện trong cửa sổ tiếng Anh khi CTĐT là CTĐT tiếng Anh.
 * Dùng chung cờ `exchangeStudent` trong store với phần Cài đặt (đồng bộ hai chiều).
 * `programCode` không truyền thì lấy CTĐT đã lưu; hộp thoại chọn CTĐT truyền CTĐT đang chọn.
 */
export function ExchangeStudentToggle({ programCode, id = "exchange-student-toggle" }: { programCode?: string; id?: string }) {
  const { t, lang } = useT();
  const savedProgramCode = useSettings((s) => s.programCode);
  const exchangeStudent = useSettings((s) => s.exchangeStudent);
  const setExchangeStudent = useSettings((s) => s.setExchangeStudent);
  if (!canOfferExchangeTick(lang, programCode ?? savedProgramCode)) return null;

  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        className="mt-1 size-4 cursor-pointer accent-brand-600"
        checked={exchangeStudent}
        onChange={(e) => setExchangeStudent(e.target.checked)}
      />
      <label htmlFor={id} className="cursor-pointer text-sm font-medium text-slate-900 dark:text-white">
        {t("exchange.tick.label")}
      </label>
    </div>
  );
}

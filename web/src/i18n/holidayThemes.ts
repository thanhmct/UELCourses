import { useT } from "@/i18n";
import type { HolidayTheme } from "@/lib/holidays";

const labels = {
  vi: {
    active: "Đang dùng",
    apply: "Dùng chủ đề này",
    automatic: "Theo ngày lễ",
    default: "Mặc định",
    fixed: "Cố định",
    mode: "Cách áp dụng",
    autosave: "Tự động lưu trên thiết bị này",
    gallery: "Chọn chủ đề để xem trước",
    quickApply: "Nhấp đúp để dùng ngay",
    customize: "Tùy chỉnh chủ đề",
    accent: "Màu chủ đạo",
    background: "Hình nền",
    presetBackground: "Nền chủ đề",
    colorBackground: "Chỉ màu nền",
    customBackground: "Ảnh của bạn",
    uploadBackground: "Chọn ảnh nền",
    removeBackground: "Xóa ảnh nền",
    reset: "Khôi phục chủ đề",
    lunar: "âm lịch",
    source: "Nguồn ảnh",
    imageSaveError: "Không thể lưu ảnh trên thiết bị này. Hãy thử ảnh nhỏ hơn.",
  },
  en: {
    active: "Applied",
    apply: "Use this theme",
    automatic: "Follow holidays",
    default: "Default",
    fixed: "Fixed",
    mode: "Theme mode",
    autosave: "Automatically saved on this device",
    gallery: "Choose a theme to preview",
    quickApply: "Double-click to use this theme",
    customize: "Customize theme",
    accent: "Accent color",
    background: "Background",
    presetBackground: "Theme background",
    colorBackground: "Color only",
    customBackground: "Your image",
    uploadBackground: "Choose background image",
    removeBackground: "Remove background image",
    reset: "Reset theme",
    lunar: "lunar calendar",
    source: "Image credits",
    imageSaveError: "The image could not be saved on this device. Try a smaller image.",
  },
};

export function useHolidayThemesText() {
  const { lang, t } = useT();
  function name(theme: HolidayTheme) {
    return theme === "halloween" ? "Halloween" : t(`holiday.${theme}`);
  }
  return { name, labels: labels[lang] };
}

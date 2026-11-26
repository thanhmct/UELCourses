import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "../page";
import { useLang } from "@/i18n";
import { api } from "@/lib/api";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/useMounted", () => ({
  useMounted: () => true,
}));

vi.mock("@/lib/adminApi", () => ({
  adminApi: {
    checkAdminAvailability: vi.fn().mockResolvedValue(false),
  },
}));

vi.mock("@/lib/api", () => ({
  API_URL: "http://localhost:8000",
  authLoginUrl: (provider: string) => `http://localhost:8000/api/auth/${provider}/login`,
  APP_VERSION: "0.1.0",
  api: {
    programs: vi.fn().mockResolvedValue({ data: [], mock: false }),
    validGroups: vi.fn().mockResolvedValue({ data: [], mock: false }),
    academicHolidays: vi.fn().mockResolvedValue({ data: [], mock: false }),
    feedback: vi.fn().mockResolvedValue({ data: { ok: true }, mock: false }),
    feedbackSatisfactionStatus: vi.fn().mockResolvedValue({ data: { already_rated: true }, mock: false }),
    authMe: vi.fn().mockResolvedValue({ user: null }),
    authProviders: vi.fn().mockResolvedValue({}),
    authLogout: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

describe("SettingsPage — Mức độ hài lòng card", () => {
  beforeEach(() => {
    useLang.getState().setLang("vi");
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("luôn hiển thị mục Mức độ hài lòng (kể cả khi already_rated=true) và cho phép gửi đánh giá", async () => {
    render(<SettingsPage />);

    const heading = screen.getByRole("heading", { name: "Mức độ hài lòng" });
    expect(heading).toBeInTheDocument();

    const section = heading.closest("section")!;
    const stars = within(section).getAllByRole("radio");
    expect(stars).toHaveLength(5);

    await act(async () => {
      fireEvent.click(stars[4]);
      await Promise.resolve();
    });

    expect(api.feedback).toHaveBeenCalledWith({
      page: "/settings",
      rating: 5,
      category: "other",
      message: "",
      quick_rating: true,
      app_version: "0.1.0",
    });
    expect(within(section).getByText("UELPath xin cảm ơn bạn! <3")).toBeInTheDocument();
  });
});

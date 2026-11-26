import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "../page";
import { useLang } from "@/i18n";
import { api } from "@/lib/api";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/useMounted", () => ({ useMounted: () => true }));
vi.mock("@/lib/adminApi", () => ({ adminApi: { checkAdminAvailability: vi.fn().mockResolvedValue(false) } }));
vi.mock("@/lib/api", () => ({
  API_URL: "http://localhost:8000",
  authLoginUrl: (provider: string) => `http://localhost:8000/api/auth/${provider}/login`,
  FACEBOOK_LOGIN_ENABLED: false,
  APP_VERSION: "0.1.0",
  api: {
    programs: vi.fn().mockResolvedValue({ data: [], mock: false }),
    validGroups: vi.fn().mockResolvedValue({ data: [], mock: false }),
    academicHolidays: vi.fn().mockResolvedValue({ data: [], mock: false }),
    feedback: vi.fn().mockResolvedValue({ data: { ok: true }, mock: false }),
    feedbackSatisfactionStatus: vi.fn().mockResolvedValue({ data: { already_rated: true }, mock: false }),
    authMe: vi.fn(),
    authProviders: vi.fn().mockResolvedValue({ google: { ready: true } }),
    authLogout: vi.fn().mockResolvedValue({ ok: true }),
    authSetNickname: vi.fn(),
  },
}));

function loggedIn(nickname: string | null) {
  vi.mocked(api.authMe).mockResolvedValue({
    user: { id: 1, display_name: "Nguyễn Văn Thật", nickname, provider: "google", banned: null },
  });
}

describe("Cài đặt — biệt danh công khai", () => {
  beforeEach(() => {
    useLang.getState().setLang("vi");
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it("không hiện ô biệt danh khi chưa đăng nhập", async () => {
    vi.mocked(api.authMe).mockResolvedValue({ user: null });
    render(<SettingsPage />);
    await waitFor(() => expect(api.authMe).toHaveBeenCalled());
    expect(screen.queryByLabelText("Biệt danh")).toBeNull();
  });

  it("hiện 'Sinh viên ẩn danh' khi chưa đặt biệt danh và lưu được biệt danh mới", async () => {
    loggedIn(null);
    vi.mocked(api.authSetNickname).mockResolvedValue({ nickname: "Gấu Béo", public_name: "Gấu Béo" });
    render(<SettingsPage />);

    const input = (await screen.findByLabelText("Biệt danh")) as HTMLInputElement;
    expect(screen.getByText("Hiện công khai là: Sinh viên ẩn danh")).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Lưu biệt danh" });
    expect(save).toBeDisabled();

    fireEvent.change(input, { target: { value: "  Gấu Béo " } });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(api.authSetNickname).toHaveBeenCalledWith("Gấu Béo"));
    expect(await screen.findByText("Hiện công khai là: Gấu Béo")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Đã lưu biệt danh. Bạn sẽ hiện là “Gấu Béo”.");
  });

  it("có nút quay về ẩn danh khi đã có biệt danh", async () => {
    loggedIn("Gấu Béo");
    vi.mocked(api.authSetNickname).mockResolvedValue({ nickname: null, public_name: "Sinh viên ẩn danh" });
    render(<SettingsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Quay về ẩn danh" }));
    await waitFor(() => expect(api.authSetNickname).toHaveBeenCalledWith(null));
    expect(await screen.findByText("Hiện công khai là: Sinh viên ẩn danh")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quay về ẩn danh" })).toBeNull();
  });

  it("hiện lỗi từ máy chủ khi biệt danh không hợp lệ", async () => {
    loggedIn(null);
    vi.mocked(api.authSetNickname).mockRejectedValue(new Error("Biệt danh này dễ gây nhầm với quản trị viên hoặc hệ thống, vui lòng chọn tên khác."));
    render(<SettingsPage />);

    const input = await screen.findByLabelText("Biệt danh");
    fireEvent.change(input, { target: { value: "Admin" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu biệt danh" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("dễ gây nhầm với quản trị viên");
  });

  it("hiển thị tiếng Anh khi đổi ngôn ngữ", async () => {
    useLang.getState().setLang("en");
    loggedIn(null);
    render(<SettingsPage />);
    expect(await screen.findByLabelText("Nickname")).toBeInTheDocument();
    expect(screen.getByText("Shown publicly as: Anonymous student")).toBeInTheDocument();
  });
});

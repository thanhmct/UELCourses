import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModuleReviews } from "../ModuleReviews";
import { useLang } from "@/i18n";
import { api } from "@/lib/api";

vi.mock("@/lib/analytics", () => ({ getAnonId: () => "dev-test" }));
vi.mock("@/lib/api", () => ({
  api: {
    moduleComments: vi.fn(),
    postModuleComment: vi.fn(),
    authMe: vi.fn(),
  },
}));

function open() {
  fireEvent.click(screen.getByRole("button", { name: /Xem|Mở|bình luận|Show|Expand|comments/i }));
}

describe("ModuleReviews — tên hiển thị của bình luận", () => {
  beforeEach(() => {
    useLang.getState().setLang("vi");
    vi.clearAllMocks();
    vi.mocked(api.moduleComments).mockResolvedValue({ data: { items: [], total: 0, page: 1, size: 50, average_rating: null }, mock: false } as never);
  });
  afterEach(() => cleanup());

  it("không hiện gợi ý khi chưa đăng nhập", async () => {
    vi.mocked(api.authMe).mockResolvedValue({ user: null });
    render(<ModuleReviews moduleCode="BAA4041" />);
    open();
    await waitFor(() => expect(api.authMe).toHaveBeenCalled());
    expect(screen.queryByTestId("comment-posting-as")).toBeNull();
  });

  it("báo tên sẽ hiện khi đã có biệt danh", async () => {
    vi.mocked(api.authMe).mockResolvedValue({
      user: { id: 1, display_name: "Nguyễn Văn Thật", nickname: "Gấu Béo", provider: "google", banned: null },
    });
    render(<ModuleReviews moduleCode="BAA4041" />);
    open();
    expect(await screen.findByTestId("comment-posting-as")).toHaveTextContent("Bình luận sẽ hiện với tên “Gấu Béo”.");
    expect(screen.getByRole("link", { name: "Đặt biệt danh" })).toHaveAttribute("href", "/settings");
  });

  it("báo là ẩn danh khi đã đăng nhập nhưng chưa đặt biệt danh", async () => {
    vi.mocked(api.authMe).mockResolvedValue({
      user: { id: 1, display_name: "Nguyễn Văn Thật", nickname: null, provider: "google", banned: null },
    });
    render(<ModuleReviews moduleCode="BAA4041" />);
    open();
    expect(await screen.findByTestId("comment-posting-as")).toHaveTextContent("Bình luận sẽ hiện là “Sinh viên ẩn danh”.");
  });

  it("không hỏng khi API tài khoản lỗi", async () => {
    vi.mocked(api.authMe).mockRejectedValue(new Error("offline"));
    render(<ModuleReviews moduleCode="BAA4041" />);
    open();
    await waitFor(() => expect(api.authMe).toHaveBeenCalled());
    expect(screen.queryByTestId("comment-posting-as")).toBeNull();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});

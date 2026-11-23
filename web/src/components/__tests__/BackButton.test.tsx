import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackButton } from "../BackButton";
import { useLang } from "@/i18n";

const mockBack = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
  }),
}));

describe("BackButton component (Brief W17)", () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockPush.mockClear();
    useLang.getState().setLang("vi");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("1. Render là thẻ Link khi có href, có aria-label và title đầy đủ", () => {
    render(<BackButton href="/programs" label="Quay lại danh sách chương trình đào tạo" />);

    const link = screen.getByRole("link", { name: "Quay lại danh sách chương trình đào tạo" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/programs");
    expect(link).toHaveAttribute("title", "Quay lại danh sách chương trình đào tạo");
    expect(link).toHaveAttribute("aria-label", "Quay lại danh sách chương trình đào tạo");
  });

  it("2. Là nút vuông bo góc nhẹ (rounded-lg, w-10 h-10) và không chứa ký tự unicode ←", () => {
    const { container } = render(<BackButton href="/programs" label="Quay lại" />);

    const link = screen.getByRole("link", { name: "Quay lại" });
    expect(link.className).toContain("h-10");
    expect(link.className).toContain("w-10");
    expect(link.className).toContain("rounded-lg");
    expect(link.className).toContain("border");

    // Tuyệt đối không chứa ký tự ← dạng văn bản trần
    expect(container.textContent).not.toContain("←");

    // Chứa icon SVG mũi tên trái
    const svg = link.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("3. Có text ẩn cho trình đọc màn hình (.sr-only)", () => {
    render(<BackButton href="/modules" label="Quay lại danh sách học phần" />);

    const srOnly = screen.getByText("Quay lại danh sách học phần");
    expect(srOnly).toHaveClass("sr-only");
  });

  it("4. Hỗ trợ i18n tiếng Anh và tiếng Việt cho nhãn mặc định khi không truyền label", () => {
    // Tiếng Việt mặc định
    const { unmount } = render(<BackButton href="/modules" />);
    const linkVi = screen.getByRole("link", { name: "Quay lại" });
    expect(linkVi).toHaveAttribute("title", "Quay lại");
    unmount();

    // Tiếng Anh
    useLang.getState().setLang("en");
    render(<BackButton href="/modules" />);
    const linkEn = screen.getByRole("link", { name: "Go back" });
    expect(linkEn).toHaveAttribute("title", "Go back");
  });

  it("5. Render thẻ button khi không có href và gọi router.back() khi click", () => {
    render(<BackButton label="Quay lại" />);

    const btn = screen.getByRole("button", { name: "Quay lại" });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("type", "button");

    fireEvent.click(btn);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("6. Gọi router.back() khi document.referrer có cùng origin", () => {
    // Giả lập referrer cùng origin
    Object.defineProperty(document, "referrer", {
      value: `${window.location.origin}/modules?query=kt`,
      configurable: true,
    });
    // Giả lập history length > 1
    Object.defineProperty(window.history, "length", {
      value: 3,
      configurable: true,
    });

    render(<BackButton href="/modules" label="Quay lại danh sách học phần" />);
    const link = screen.getByRole("link", { name: "Quay lại danh sách học phần" });

    fireEvent.click(link);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

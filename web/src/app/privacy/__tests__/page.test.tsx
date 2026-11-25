import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import PrivacyPage from "../page";
import TermsPage from "../../terms/page";
import { useLang } from "@/i18n";

describe("Trang chính sách quyền riêng tư và điều khoản", () => {
  beforeEach(() => useLang.getState().setLang("vi"));
  afterEach(() => cleanup());

  it("hiển thị chính sách quyền riêng tư tiếng Việt và email liên hệ", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Chính sách quyền riêng tư" })).toBeInTheDocument();
    expect(screen.getAllByText(/uelpath@gmail\.com/).length).toBeGreaterThan(0);
  });

  it("đổi sang tiếng Anh", () => {
    useLang.getState().setLang("en");
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeInTheDocument();
  });

  it("điều khoản có liên kết sang chính sách quyền riêng tư", () => {
    render(<TermsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Điều khoản sử dụng" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chính sách quyền riêng tư" })).toHaveAttribute("href", "/privacy");
  });
});

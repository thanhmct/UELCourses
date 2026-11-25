import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ModuleTitleLine, NoScheduleBadge, RequiredBadge } from "../ModuleTitleLine";

// Nhãn Bắt buộc / Tự chọn đã ẩn trên giao diện; dữ liệu `required` vẫn ở DB/API.
describe("RequiredBadge component (đã ẩn)", () => {
  afterEach(() => {
    cleanup();
  });

  it.each([
    [true, "vi"],
    [true, "en"],
    [false, "vi"],
    [false, "en"],
    [undefined, "vi"],
    [null, "en"],
  ] as const)("không render gì khi required=%s (lang=%s)", (required, lang) => {
    const { container } = render(<RequiredBadge required={required} lang={lang} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText(/Bắt buộc|Tự chọn|Required|Elective/)).not.toBeInTheDocument();
  });
});

describe("NoScheduleBadge component", () => {
  afterEach(() => {
    cleanup();
  });

  it("hiển thị nhãn 'Không có lịch' với màu vàng/hổ phách (amber) ở chế độ VI", () => {
    render(<NoScheduleBadge lang="vi" />);
    const badge = screen.getByText("Không có lịch");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("bg-amber-100");
    expect(badge.className).toContain("text-amber-800");
    expect(badge.getAttribute("data-variant")).toBe("no-schedule");
  });

  it("hiển thị nhãn 'No schedule' với màu vàng/hổ phách (amber) ở chế độ EN", () => {
    render(<NoScheduleBadge lang="en" />);
    const badge = screen.getByText("No schedule");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("bg-amber-100");
    expect(badge.className).toContain("text-amber-800");
    expect(badge.getAttribute("data-variant")).toBe("no-schedule");
  });
});

describe("ModuleTitleLine component", () => {
  afterEach(() => {
    cleanup();
  });

  it("hiển thị 'MÃ Tên môn' và không có nhãn bắt buộc/tự chọn", () => {
    render(<ModuleTitleLine code="BDG1001" name="Triết học Mác – Lênin" required={true} lang="vi" />);

    expect(screen.getByText("BDG1001")).toBeInTheDocument();
    expect(screen.getByText(/Triết học Mác – Lênin/)).toBeInTheDocument();
    expect(screen.queryByText("Bắt buộc")).not.toBeInTheDocument();
  });

  it("hiển thị 'CODE Module Name' ở EN và không có nhãn Elective", () => {
    render(
      <ModuleTitleLine
        code="KTE1001"
        module={{ code: "KTE1001", name: "Kinh tế vi mô", name_en: "Microeconomics" }}
        required={false}
        lang="en"
      />,
    );

    expect(screen.getByText("KTE1001")).toBeInTheDocument();
    expect(screen.getByText(/Microeconomics/)).toBeInTheDocument();
    expect(screen.queryByText("Elective")).not.toBeInTheDocument();
  });

  it("tạo link khi có thuộc tính href và không hiện nhãn", () => {
    render(
      <ModuleTitleLine code="BDG1001" name="Triết học Mác – Lênin" required={true} href="/modules/BDG1001" lang="vi" />,
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/modules/BDG1001");
    expect(link).toHaveTextContent("BDG1001");
    expect(link).toHaveTextContent("Triết học Mác – Lênin");
    expect(screen.queryByText("Bắt buộc")).not.toBeInTheDocument();
  });
});

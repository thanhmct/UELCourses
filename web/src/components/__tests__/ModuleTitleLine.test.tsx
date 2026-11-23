import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ModuleTitleLine, NoScheduleBadge, RequiredBadge } from "../ModuleTitleLine";

describe("RequiredBadge component", () => {
  afterEach(() => {
    cleanup();
  });

  describe("Có chương trình (môn nằm trong chương trình)", () => {
    it("hiển thị nhãn 'Bắt buộc' với màu xanh lá (emerald) khi required === true ở chế độ VI", () => {
      const { container } = render(<RequiredBadge required={true} lang="vi" />);
      const badge = screen.getByText("Bắt buộc");
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain("bg-emerald-100");
      expect(badge.className).toContain("text-emerald-800");
      expect(badge.getAttribute("data-variant")).toBe("required");
      expect(container.firstChild).toBe(badge);
    });

    it("hiển thị nhãn 'Required' với màu xanh lá (emerald) khi required === true ở chế độ EN", () => {
      const { container } = render(<RequiredBadge required={true} lang="en" />);
      const badge = screen.getByText("Required");
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain("bg-emerald-100");
      expect(badge.className).toContain("text-emerald-800");
      expect(badge.getAttribute("data-variant")).toBe("required");
      expect(container.firstChild).toBe(badge);
    });

    it("hiển thị nhãn 'Tự chọn' với màu chàm/xanh dương (indigo) khi required === false ở chế độ VI", () => {
      const { container } = render(<RequiredBadge required={false} lang="vi" />);
      const badge = screen.getByText("Tự chọn");
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain("bg-indigo-50");
      expect(badge.className).toContain("text-indigo-700");
      expect(badge.getAttribute("data-variant")).toBe("elective");
      expect(container.firstChild).toBe(badge);
    });

    it("hiển thị nhãn 'Elective' với màu chàm/xanh dương (indigo) khi required === false ở chế độ EN", () => {
      const { container } = render(<RequiredBadge required={false} lang="en" />);
      const badge = screen.getByText("Elective");
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain("bg-indigo-50");
      expect(badge.className).toContain("text-indigo-700");
      expect(badge.getAttribute("data-variant")).toBe("elective");
      expect(container.firstChild).toBe(badge);
    });
  });

  describe("Không có chương trình hoặc môn ngoài chương trình", () => {
    it("không render gì (null) khi required === undefined", () => {
      const { container } = render(<RequiredBadge required={undefined} lang="vi" />);
      expect(container.firstChild).toBeNull();
    });

    it("không render gì (null) khi required === null", () => {
      const { container } = render(<RequiredBadge required={null} lang="en" />);
      expect(container.firstChild).toBeNull();
    });
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

  it("hiển thị 'MÃ Tên môn' cùng dòng với nhãn Bắt buộc cạnh tên ở chế độ VI", () => {
    render(
      <ModuleTitleLine
        code="BDG1001"
        name="Triết học Mác – Lênin"
        required={true}
        lang="vi"
      />,
    );

    expect(screen.getByText("BDG1001")).toBeInTheDocument();
    expect(screen.getByText(/Triết học Mác – Lênin/)).toBeInTheDocument();
    const badge = screen.getByText("Bắt buộc");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("bg-emerald-100");
  });

  it("hiển thị 'CODE Module Name' cùng dòng với nhãn Elective ở chế độ EN", () => {
    render(
      <ModuleTitleLine
        code="KTE1001"
        module={{
          code: "KTE1001",
          name: "Kinh tế vi mô",
          name_en: "Microeconomics",
        }}
        required={false}
        lang="en"
      />,
    );

    expect(screen.getByText("KTE1001")).toBeInTheDocument();
    expect(screen.getByText(/Microeconomics/)).toBeInTheDocument();
    const badge = screen.getByText("Elective");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("bg-indigo-50");
  });

  it("không hiển thị nhãn bắt buộc/tự chọn khi môn ngoài chương trình (required is undefined)", () => {
    render(
      <ModuleTitleLine
        code="MAT1001"
        name="Toán cao cấp"
        required={undefined}
        lang="vi"
      />,
    );

    expect(screen.getByText("MAT1001")).toBeInTheDocument();
    expect(screen.getByText(/Toán cao cấp/)).toBeInTheDocument();
    expect(screen.queryByText("Bắt buộc")).not.toBeInTheDocument();
    expect(screen.queryByText("Tự chọn")).not.toBeInTheDocument();
  });

  it("tạo link khi có thuộc tính href", () => {
    render(
      <ModuleTitleLine
        code="BDG1001"
        name="Triết học Mác – Lênin"
        required={true}
        href="/modules/BDG1001"
        lang="vi"
      />,
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/modules/BDG1001");
    expect(link).toHaveTextContent("BDG1001");
    expect(link).toHaveTextContent("Triết học Mác – Lênin");
    expect(screen.getByText("Bắt buộc")).toBeInTheDocument();
  });
});

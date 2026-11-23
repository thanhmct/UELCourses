import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SemesterFilterSquares, SemesterPicker } from "../SemesterPicker";
import { useLang } from "@/i18n";
import type { FacetCount, Semester } from "@/lib/types";

describe("Brief W19: SemesterPicker component", () => {
  beforeEach(() => {
    useLang.getState().setLang("vi");
  });

  afterEach(() => {
    cleanup();
    useLang.getState().setLang("vi");
  });

  const mockSemesters: Semester[] = [
    {
      id: "2026-2027-1",
      name: "Học kỳ 1 năm học 2026-2027",
      year: "2026-2027",
      term: 1,
      is_current: true,
    },
    {
      id: "2026-2027-2",
      name: "Học kỳ 2 năm học 2026-2027",
      year: "2026-2027",
      term: 2,
      is_current: false,
    },
    // Năm 2026-2027 cố tình thiếu HK3 để kiểm tra trạng thái disabled
    {
      id: "2025-2026-1",
      name: "Học kỳ 1 năm học 2025-2026",
      year: "2025-2026",
      term: 1,
      is_current: false,
    },
    {
      id: "2025-2026-2",
      name: "Học kỳ 2 năm học 2025-2026",
      year: "2025-2026",
      term: 2,
      is_current: false,
    },
    {
      id: "2025-2026-3",
      name: "Học kỳ 3 năm học 2025-2026",
      year: "2025-2026",
      term: 3,
      is_current: false,
    },
  ];

  it("1. Hiển thị nút trigger dạng gọn 'Kỳ 1 · 2026–2027' (VI) và 'Term 1 · 2026–2027' (EN)", () => {
    const { rerender } = render(
      <SemesterPicker
        semesters={mockSemesters}
        value="2026-2027-1"
        onChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { name: /Chọn học kỳ/i });
    expect(trigger).toHaveTextContent("Kỳ 1 · 2026–2027");

    // Đổi sang EN
    useLang.getState().setLang("en");
    rerender(
      <SemesterPicker
        semesters={mockSemesters}
        value="2026-2027-1"
        onChange={vi.fn()}
      />,
    );
    expect(trigger).toHaveTextContent("Term 1 · 2026–2027");
  });

  it("2. Mở popover và hiển thị mỗi năm học là một hàng với đúng 3 ô vuông Kỳ 1, Kỳ 2, Kỳ 3", () => {
    render(
      <SemesterPicker
        semesters={mockSemesters}
        value="2026-2027-1"
        onChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { name: /Chọn học kỳ/i });
    fireEvent.click(trigger);

    // Popover mở ra
    const dialog = screen.getByRole("dialog", { name: /Chọn học kỳ/i });
    expect(dialog).toBeInTheDocument();

    // Hàng 2026–2027
    const row2026 = within(dialog).getByRole("group", { name: "2026–2027" });
    const buttons2026 = within(row2026).getAllByRole("button");
    expect(buttons2026).toHaveLength(3);
    expect(buttons2026[0]).toHaveTextContent("Kỳ 1");
    expect(buttons2026[1]).toHaveTextContent("Kỳ 2");
    expect(buttons2026[2]).toHaveTextContent("Kỳ 3");

    // Hàng 2025–2026
    const row2025 = within(dialog).getByRole("group", { name: "2025–2026" });
    const buttons2025 = within(row2025).getAllByRole("button");
    expect(buttons2025).toHaveLength(3);
    expect(buttons2025[0]).toHaveTextContent("Kỳ 1");
    expect(buttons2025[1]).toHaveTextContent("Kỳ 2");
    expect(buttons2025[2]).toHaveTextContent("Kỳ 3");
  });

  it("3. Chọn một ô gọi callback onChange với semesterId tương ứng và đóng popover", () => {
    const onChange = vi.fn();
    render(
      <SemesterPicker
        semesters={mockSemesters}
        value="2026-2027-1"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Chọn học kỳ/i }));

    const dialog = screen.getByRole("dialog", { name: /Chọn học kỳ/i });
    const row2025 = within(dialog).getByRole("group", { name: "2025–2026" });
    const term2Btn = within(row2025).getAllByRole("button")[1]; // Kỳ 2

    fireEvent.click(term2Btn);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("2025-2026-2", expect.objectContaining({ id: "2025-2026-2" }));

    // Popover tự động đóng
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("4. Ô học kỳ không tồn tại trong dữ liệu của năm đó bị vô hiệu hóa (disabled, aria-disabled='true')", () => {
    render(
      <SemesterPicker
        semesters={mockSemesters}
        value="2026-2027-1"
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Chọn học kỳ/i }));

    const dialog = screen.getByRole("dialog", { name: /Chọn học kỳ/i });
    const row2026 = within(dialog).getByRole("group", { name: "2026–2027" });
    const term3Btn = within(row2026).getAllByRole("button")[2]; // Kỳ 3 năm 2026-2027 không có trong data

    expect(term3Btn).toBeDisabled();
    expect(term3Btn).toHaveAttribute("aria-disabled", "true");
  });

  it("5. Khi thêm năm học mới vào dữ liệu semesters, tự động xuất hiện hàng mới tương ứng", () => {
    const extendedSemesters: Semester[] = [
      ...mockSemesters,
      {
        id: "2027-2028-1",
        name: "Học kỳ 1 năm học 2027-2028",
        year: "2027-2028",
        term: 1,
        is_current: false,
      },
    ];

    render(
      <SemesterPicker
        semesters={extendedSemesters}
        value="2027-2028-1"
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Chọn học kỳ/i }));

    const dialog = screen.getByRole("dialog", { name: /Chọn học kỳ/i });
    // Tự động có nhóm 2027–2028 mà không sửa code
    const row2027 = within(dialog).getByRole("group", { name: "2027–2028" });
    expect(row2027).toBeInTheDocument();
    expect(within(row2027).getAllByRole("button")).toHaveLength(3);
  });

  it("6. Hiển thị đúng nhãn theo ngôn ngữ EN ('Term 1/2/3')", () => {
    useLang.getState().setLang("en");
    render(
      <SemesterPicker
        semesters={mockSemesters}
        value="2026-2027-1"
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Select semester|Chọn học kỳ/i }));

    const dialog = screen.getByRole("dialog");
    const row2025 = within(dialog).getByRole("group", { name: "2025–2026" });
    const buttons = within(row2025).getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("Term 1");
    expect(buttons[1]).toHaveTextContent("Term 2");
    expect(buttons[2]).toHaveTextContent("Term 3");
  });

  it("7. Hỗ trợ điều hướng bằng phím mũi tên và chọn bằng phím Enter", () => {
    const onChange = vi.fn();
    render(
      <SemesterPicker
        semesters={mockSemesters}
        value="2026-2027-1"
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole("button", { name: /Chọn học kỳ/i });
    // Nhấn ArrowDown khi đang ở trigger để mở popover
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const dialog = screen.getByRole("dialog");

    // Di chuyển sang phải (Kỳ 1 -> Kỳ 2)
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    // Nhấn Enter để chọn
    fireEvent.keyDown(dialog, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("2026-2027-2", expect.objectContaining({ id: "2026-2027-2" }));
  });

  it("8. Đóng popover khi nhấn phím Escape hoặc bấm ra ngoài (không có tiêu đề/nút X)", () => {
    render(
      <SemesterPicker
        semesters={mockSemesters}
        value="2026-2027-1"
        onChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { name: /Chọn học kỳ/i });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Nhấn Escape đóng dialog
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Mở lại: không còn tiêu đề "CHỌN HỌC KỲ" hay nút Đóng (X) trong hộp
    fireEvent.click(trigger);
    expect(screen.queryByRole("button", { name: /Đóng|Close/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Chọn học kỳ$/i, { selector: "span" })).not.toBeInTheDocument();

    // Bấm ra ngoài đóng hộp
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("9. Hiển thị chấm chỉ báo cho học kỳ hiện tại (is_current = true)", () => {
    render(
      <SemesterPicker
        semesters={mockSemesters}
        value="2025-2026-1"
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Chọn học kỳ/i }));

    const dialog = screen.getByRole("dialog");
    const row2026 = within(dialog).getByRole("group", { name: "2026–2027" });
    const term1Btn = within(row2026).getAllByRole("button")[0];

    // Có chỉ báo kỳ hiện tại bên trong ô
    const indicator = term1Btn.querySelector("span[title='Kỳ hiện tại']");
    expect(indicator).toBeInTheDocument();
  });
});

describe("Brief W19: SemesterFilterSquares component (Modules page facet filter)", () => {
  beforeEach(() => {
    useLang.getState().setLang("vi");
  });

  afterEach(() => {
    cleanup();
    useLang.getState().setLang("vi");
  });

  const mockFacetItems: FacetCount[] = [
    { value: "2026-2027-1", count: 651 },
    { value: "2026-2027-2", count: 420 },
    { value: "2026-2027-3", count: 0 }, // count 0 -> không hiện
    { value: "2025-2026-1", count: 580 },
  ];

  it("10. Hiển thị các ô vuông học kỳ có lớp mở kèm số lớp (Kỳ 1 · 651), cho phép chọn nhiều và xóa lọc", () => {
    const onValuesChange = vi.fn();
    const { rerender } = render(
      <SemesterFilterSquares
        items={mockFacetItems}
        values={["2026-2027-1"]}
        onValuesChange={onValuesChange}
        title="Học kỳ có lớp mở"
      />,
    );

    expect(screen.getByText("Học kỳ có lớp mở")).toBeInTheDocument();

    // Ô Kỳ 1 năm 2026–2027 hiển thị "Kỳ 1" và "· 651"
    const btn1 = screen.getByRole("checkbox", { name: /Học kỳ 1.*2026–2027/i });
    expect(btn1).toHaveTextContent("Kỳ 1");
    expect(btn1).toHaveTextContent("· 651");
    expect(btn1).toHaveAttribute("aria-checked", "true");

    // Ô Kỳ 3 có count 0 không hiển thị
    expect(screen.queryByRole("checkbox", { name: /Học kỳ 3.*2026–2027/i })).not.toBeInTheDocument();

    // Bấm vào Kỳ 2 năm 2026–2027 để chọn thêm (chọn nhiều)
    const btn2 = screen.getByRole("checkbox", { name: /Học kỳ 2.*2026–2027/i });
    fireEvent.click(btn2);
    expect(onValuesChange).toHaveBeenCalledWith(["2026-2027-1", "2026-2027-2"]);

    // Bấm nút "Xóa lọc" để xóa toàn bộ
    const clearBtn = screen.getByRole("button", { name: /Xóa lọc/i });
    fireEvent.click(clearBtn);
    expect(onValuesChange).toHaveBeenCalledWith([]);

    // Kiểm tra ngôn ngữ EN
    useLang.getState().setLang("en");
    rerender(
      <SemesterFilterSquares
        items={mockFacetItems}
        values={[]}
        onValuesChange={onValuesChange}
        title="Semesters with open classes"
      />,
    );
    expect(screen.getByText("Semesters with open classes")).toBeInTheDocument();
    const btnEn = screen.getByRole("checkbox", { name: /Semester 1.*2026–2027/i });
    expect(btnEn).toHaveTextContent("Term 1");
    expect(btnEn).toHaveTextContent("· 651");
  });
});

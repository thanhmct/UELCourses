import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimetableModuleSearch } from "../TimetableModuleSearch";
import { api } from "@/lib/api";
import { useLang } from "@/i18n";
import type { ModuleSummary } from "@/lib/types";

const mockModules: ModuleSummary[] = [
  {
    code: "BAA2029",
    name: "Kế toán tài chính",
    name_en: "Financial Accounting",
    credits: 3,
    type: "Chuyên ngành",
    has_equivalents: false,
    open_semesters: [], // Không có lịch trong kỳ đang chọn
  },
  {
    code: "BAA2028",
    name: "Nguyên lý kế toán",
    name_en: "Principles of Accounting",
    credits: 3,
    type: "Cơ sở ngành",
    has_equivalents: false,
    open_semesters: [{ semester: "2026-2027-1", classes: 3 }], // Có lịch trong kỳ 2026-2027-1
  },
];

describe("Brief W32: Ô tìm môn ở Thời khóa biểu: dời nhãn 'Không có lịch' và đổi màu nhãn 'Tự chọn'", () => {
  beforeEach(() => {
    useLang.getState().setLang("vi");
    vi.spyOn(api, "modules").mockResolvedValue({
      data: { items: mockModules, total: 2 },
      mock: true,
    });
    vi.spyOn(api, "program").mockResolvedValue({ data: null, mock: true });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useLang.getState().setLang("vi");
  });

  it.each([
    ["vi", "Thêm một hoặc nhiều học phần vào thời khóa biểu", "Thêm một hoặc nhiều học phần vào thời khóa biểu (nhập nhiều mã hoặc tên học phần)"],
    ["en", "Add one or more modules to the timetable", "Add one or more modules to the timetable (enter multiple codes or a module name)"],
  ] as const)("đưa lời nhắc thêm học phần vào ô nhập (%s)", (lang, label, placeholder) => {
    useLang.getState().setLang(lang);
    render(<TimetableModuleSearch onPick={vi.fn()} programRequiredMap={{}} />);

    const input = screen.getByRole("combobox", { name: label });
    expect(input).toHaveAttribute("placeholder", placeholder);
    expect(input.tagName).toBe("TEXTAREA");
    expect(input).toHaveAttribute("rows", "1");
    expect(input).toHaveClass("h-12", "resize-none");
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  });

  it("nổi lên để kéo dãn khi focus, rồi thu về một hàng và giữ nội dung khi blur", async () => {
    render(<TimetableModuleSearch onPick={vi.fn()} programRequiredMap={{}} />);

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "BAA2028, BAA2029" } });
    fireEvent.focus(input);

    expect(input).toHaveClass("resize-y");
    expect(input.parentElement).toHaveClass("absolute", "inset-x-0", "z-40");
    expect(input.parentElement?.parentElement).toHaveClass("relative", "h-12");

    input.style.height = "160px";
    fireEvent.blur(input);

    await waitFor(() => {
      expect(input).toHaveClass("resize-none");
      expect(input.parentElement).not.toHaveClass("absolute");
    });
    expect(input).toHaveValue("BAA2028, BAA2029");
    expect(input.style.height).toBe("");
  });

  it.each([
    ["BAA2028 BAA", "BAA"],
    ["BAA2028, BAA", "BAA"],
    ["BAA2028.BAA", "BAA"],
    ["BAA2028; BAA", "BAA"],
  ])("chỉ tìm đoạn sau ký tự phân cách: %s", async (value, expectedQuery) => {
    render(<TimetableModuleSearch onPick={vi.fn()} programRequiredMap={{}} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value } });

    await waitFor(() => {
      expect(api.modules).toHaveBeenCalledWith(expect.objectContaining({ q: expectedQuery }));
    });
  });

  it("nhập nhiều mã, thêm tất cả và giữ lại mã không tìm thấy", async () => {
    vi.mocked(api.modules).mockImplementation(async (params) => ({
      data: params?.q === "XXX9999"
        ? { items: [], total: 0 }
        : { items: mockModules, total: mockModules.length },
      mock: true,
    }));
    const onPick = vi.fn();
    render(<TimetableModuleSearch onPick={onPick} programRequiredMap={{}} />);

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "baa2028, XXX9999\nBAA2029" } });

    fireEvent.click(screen.getByRole("button", { name: "Thêm môn (3)" }));

    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(2));
    expect(onPick.mock.calls.map(([module]) => module.code)).toEqual(["BAA2028", "BAA2029"]);
    expect(input).toHaveValue("XXX9999");
    expect(screen.getByText("BAA2028").closest("li")).toHaveTextContent("✓");
    const failedCode = screen.getAllByText("XXX9999").find((element) => element.tagName === "SPAN");
    expect(failedCode?.closest("li")).toHaveTextContent("✗");
    expect(screen.getByText("BAA2029").closest("li")).toHaveTextContent("✓");
  });

  it("1. Dòng gợi ý có môn không lịch → nhãn 'Không có lịch' nằm trong cụm bên phải cùng với '3 TC', không nằm cạnh tên môn", async () => {
    const onPick = vi.fn();
    render(
      <TimetableModuleSearch
        onPick={onPick}
        semester="2026-2027-1"
        programRequiredMap={{ BAA2029: true }}
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "BAA" } });

    const option = await screen.findByRole("option", { name: /BAA2029/i });
    const button = within(option).getByRole("button");

    // Lấy 2 cụm con chính (cụm trái: mã + tên + badge; cụm phải: không có lịch + tín chỉ)
    const [leftCluster, rightCluster] = Array.from(button.children) as HTMLElement[];
    expect(leftCluster).toBeDefined();
    expect(rightCluster).toBeDefined();

    // Cụm trái chứa mã và tên môn; nhãn Bắt buộc/Tự chọn đã ẩn
    expect(within(leftCluster).getByText("BAA2029")).toBeInTheDocument();
    expect(within(leftCluster).getByText("Kế toán tài chính")).toBeInTheDocument();
    expect(within(leftCluster).queryByText("Bắt buộc")).toBeNull();
    // Cụm trái TUYỆT ĐỐI KHÔNG chứa nhãn "Không có lịch"
    expect(within(leftCluster).queryByText("Không có lịch")).toBeNull();

    // Cụm phải chứa nhãn "Không có lịch" và số tín chỉ đi liền nhau
    const noScheduleBadge = within(rightCluster).getByText("Không có lịch");
    expect(noScheduleBadge).toBeInTheDocument();
    expect(within(rightCluster).getByText(/3 TC/)).toBeInTheDocument();

    // Nhãn "Không có lịch" có data-variant="no-schedule" và lớp amber
    expect(noScheduleBadge.getAttribute("data-variant")).toBe("no-schedule");
    expect(noScheduleBadge.className).toContain("bg-amber-100");
    expect(noScheduleBadge.className).toContain("text-amber-800");
  });

  it("2. Môn tự chọn → không hiện nhãn 'Tự chọn' ở cụm trái; nhãn 'Không có lịch' vẫn ở cụm phải", async () => {
    const onPick = vi.fn();
    render(
      <TimetableModuleSearch
        onPick={onPick}
        semester="2026-2027-1"
        programRequiredMap={{ BAA2029: false }} // Môn tự chọn (dữ liệu vẫn có, nhãn đã ẩn)
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "BAA" } });

    const option = await screen.findByRole("option", { name: /BAA2029/i });
    const button = within(option).getByRole("button");
    const [leftCluster, rightCluster] = Array.from(button.children) as HTMLElement[];

    expect(within(leftCluster).queryByText("Tự chọn")).toBeNull();
    const noScheduleBadge = within(rightCluster).getByText("Không có lịch");
    expect(noScheduleBadge.getAttribute("data-variant")).toBe("no-schedule");
    expect(noScheduleBadge.className).toContain("bg-amber-100");
    expect(noScheduleBadge.className).not.toContain("bg-emerald-100");
  });

  it("3. Môn có lịch → không có nhãn 'Không có lịch' và layout không đổi chiều cao", async () => {
    const onPick = vi.fn();
    render(
      <TimetableModuleSearch
        onPick={onPick}
        semester="2026-2027-1"
        programRequiredMap={{ BAA2028: true }}
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "BAA" } });

    // BAA2028 có lớp mở trong kỳ 2026-2027-1
    const option = await screen.findByRole("option", { name: /BAA2028/i });
    const button = within(option).getByRole("button");
    const [, rightCluster] = Array.from(button.children) as HTMLElement[];

    // Tuyệt đối không có nhãn "Không có lịch"
    expect(within(button).queryByText("Không có lịch")).toBeNull();
    expect(within(button).queryByText("No schedule")).toBeNull();

    // Cụm phải chỉ có tín chỉ
    expect(within(rightCluster).getByText(/3 TC/)).toBeInTheDocument();

    // Nút dòng gợi ý có min-h-[38px] bảo đảm không bị co rút / nhảy chiều cao layout
    expect(button.className).toContain("min-h-[38px]");
  });

  it("4. Hỗ trợ ngôn ngữ tiếng Anh: nhãn 'No schedule'; không hiện 'Elective' / 'Required'", async () => {
    useLang.getState().setLang("en");
    const onPick = vi.fn();
    render(
      <TimetableModuleSearch
        onPick={onPick}
        semester="2026-2027-1"
        programRequiredMap={{ BAA2029: false }}
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "BAA" } });

    const option = await screen.findByRole("option", { name: /BAA2029/i });
    const button = within(option).getByRole("button");
    const [leftCluster, rightCluster] = Array.from(button.children) as HTMLElement[];

    expect(within(leftCluster).queryByText("Elective")).toBeNull();
    expect(within(rightCluster).getByText("No schedule")).toBeInTheDocument();
    expect(within(rightCluster).getByText(/3 cr/)).toBeInTheDocument();
  });
});

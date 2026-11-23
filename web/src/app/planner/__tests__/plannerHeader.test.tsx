import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlannerPage from "../page";
import { plannerCollisionDetection } from "../plannerDnd";
import { AppDialog } from "@/components/AppDialog";
import { useLang } from "@/i18n";
import { usePlanner, useSettings } from "@/lib/store";
import { formatPlannerTerm, formatPlannerTermStats, plannerSemesterLabel } from "@/i18n/names";
import { api } from "@/lib/api";

vi.mock("next/navigation", () => ({
  useParams: () => ({}),
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    program: vi.fn().mockResolvedValue({ data: null, mock: true }),
    programs: vi.fn().mockResolvedValue({ data: [], mock: true }),
    modules: vi.fn().mockResolvedValue({ data: { items: [], total: 0 }, mock: true }),
    module: vi.fn().mockResolvedValue({ data: null, mock: true }),
    validGroups: vi.fn().mockResolvedValue({ data: [], mock: true }),
  },
}));

describe("Brief W28: Tiêu đề thẻ học kỳ trong Kế hoạch (Planner Semester Header)", () => {
  beforeEach(() => {
    act(() => {
      useLang.setState({ lang: "vi" });
      useSettings.setState({
        programCode: "",
        secondaryProgramCode: "",
        cohort: "",
      });
      usePlanner.setState({
        academicYears: null,
        terms: [
          {
            id: "t_sem1",
            name: "HK01 năm học 2024-2025",
            modules: ["TOAN1", "TOAN2", "TRIET", "MAC", "TIN"],
          },
          {
            id: "t_sem2",
            name: "HKHK02 năm học 2024-2025",
            modules: ["PLDC"],
          },
        ],
        catalog: {
          TOAN1: { code: "TOAN1", name: "Toán 1", credits: 3 },
          TOAN2: { code: "TOAN2", name: "Toán 2", credits: 3 },
          TRIET: { code: "TRIET", name: "Triết", credits: 3 },
          MAC: { code: "MAC", name: "Kinh tế chính trị", credits: 3 },
          TIN: { code: "TIN", name: "Tin học", credits: 2 },
          PLDC: { code: "PLDC", name: "Pháp luật đại cương", credits: 3 },
        },
        backlog: [],
        completed: [],
      });
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.removeItem("uelcourses-user-grades");
    localStorage.removeItem("uelcourses-user-scores");
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it.each([
    {
      lang: "vi" as const,
      labels: ["Bình thường (14–25 TC)", "Dưới mức tối thiểu (< 14 TC)", "Vượt mức thông thường (> 25 TC)"],
    },
    {
      lang: "en" as const,
      labels: ["Normal load (14–25 cr)", "Below minimum (< 14 cr)", "Above typical load (> 25 cr)"],
    },
  ])("hiển thị đúng một ngưỡng trong mỗi nhãn tín chỉ ($lang)", ({ lang, labels }) => {
    useLang.setState({ lang });
    render(<PlannerPage />);

    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("không áp dụng hoặc lọc kế hoạch theo CTĐT đã chọn", async () => {
    useLang.getState().setLang("en");
    useSettings.getState().setProgramCode("K23406");
    usePlanner.setState({ backlog: [], terms: [{ id: "t2", name: "HK2", modules: [] }] });
    render(<PlannerPage />);

    expect(screen.getByRole("heading", { name: /Semester roadmap/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Add courses to the plan")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Plan to Take" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter a course code or name")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Add courses to the plan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Apply standard track/ })).not.toBeInTheDocument();
    expect(screen.queryByText("K23406")).not.toBeInTheDocument();
    expect(api.program).not.toHaveBeenCalled();
    expect(usePlanner.getState().backlog).toEqual([]);
    expect(screen.getAllByText("Drop a module here").length).toBeGreaterThan(0);
  });

  it("xóa học kỳ từ dấu x sau khi xác nhận và giữ vùng Dự định học", async () => {
    usePlanner.setState({
      terms: [{ id: "remove-me", name: "Năm 2 – HK3", modules: ["PLDC"] }],
      backlog: ["TOAN1"],
    });
    render(<><PlannerPage /><AppDialog /></>);

    expect(screen.getByRole("heading", { name: "Dự định học" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Nhập mã hoặc tên học phần")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Xóa Năm 2 · Học kỳ 3" })[0]);
    expect(await screen.findByRole("heading", { name: "Xóa học kỳ?" })).toBeInTheDocument();
    expect(screen.getByText(/1 học phần/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xóa học kỳ" }));

    await waitFor(() => expect(usePlanner.getState().terms).toEqual([]));
    expect(usePlanner.getState().backlog).not.toContain("PLDC");
  });

  it("1. Hàm nhãn học kỳ chuẩn hóa (HK01 + 2024-2025 -> 'Học kỳ 1 · 2024-2025'; EN: 'Semester 1 · 2024-2025')", () => {
    expect(formatPlannerTerm("HK01", "2024-2025")).toBe("Học kỳ 1 · 2024-2025");
    expect(formatPlannerTerm("HK01", "2024-2025", "vi")).toBe("Học kỳ 1 · 2024-2025");
    expect(formatPlannerTerm("HK01", "2024-2025", "en")).toBe("Semester 1 · 2024-2025");
    expect(plannerSemesterLabel("HK01", "2024-2025", "en")).toBe("Semester 1 · 2024-2025");

    // Lấy số kỳ từ mã (HK01 -> 1, HK02 -> 2, HK03 -> 3)
    expect(formatPlannerTerm("HK02", "2024-2025")).toBe("Học kỳ 2 · 2024-2025");
    expect(formatPlannerTerm("HK03", "2024-2025")).toBe("Học kỳ 3 · 2024-2025");
    expect(formatPlannerTerm("HK03", "2024-2025", "en")).toBe("Semester 3 · 2024-2025");
  });

  it("2. Loại bỏ hoàn toàn chuỗi lặp 'HKHK'", () => {
    expect(formatPlannerTerm("HKHK01", "2024-2025")).toBe("Học kỳ 1 · 2024-2025");
    expect(formatPlannerTerm("HKHK01 năm học 2024-2025")).toBe("Học kỳ 1 · 2024-2025");
    expect(formatPlannerTerm("HKHK01 năm học 2024-2025", "en")).toBe("Semester 1 · 2024-2025");
    expect(formatPlannerTerm("HKHK01 năm học 2024-2025")).not.toContain("HKHK");
  });

  it("adds three semesters per academic year and extends the range without duplicating terms", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T05:00:00Z"));
    usePlanner.setState({ terms: [], backlog: [], completed: [] });
    render(<PlannerPage />);

    const choice = screen.getByRole("button", { name: "Chọn năm học" });
    choice.focus();
    fireEvent.click(choice);
    let dialog = within(screen.getByRole("dialog"));
    let admission = within(dialog.getByRole("group", { name: "Năm nhập học" }));
    let graduation = within(dialog.getByRole("group", { name: "Năm tốt nghiệp dự kiến" }));
    expect(admission.getByRole("radio", { name: /2026–2027.*Năm 1/ })).toBeChecked();
    expect(dialog.getByText("12 học kỳ trong khoảng đã chọn")).toBeInTheDocument();
    fireEvent.click(admission.getByRole("radio", { name: /2025–2026.*Năm 2/ }));
    fireEvent.click(graduation.getByRole("radio", { name: /2026–2027.*Năm nay/ }));
    fireEvent.click(dialog.getByRole("button", { name: "Tạo học kỳ" }));

    const original = usePlanner.getState().terms;
    expect(original).toHaveLength(6);
    expect(original[0].name).toBe("HK1 2025-2026");
    expect(original.at(-1)?.name).toBe("HK3 2026-2027");
    fireEvent.click(choice);
    dialog = within(screen.getByRole("dialog"));
    admission = within(dialog.getByRole("group", { name: "Năm nhập học" }));
    graduation = within(dialog.getByRole("group", { name: "Năm tốt nghiệp dự kiến" }));
    expect(admission.getByRole("radio", { name: /2025–2026/ })).toBeChecked();
    fireEvent.click(graduation.getByRole("radio", { name: /2027–2028.*Năm tới/ }));
    fireEvent.click(dialog.getByRole("button", { name: "Tạo học kỳ" }));
    expect(usePlanner.getState().terms.slice(0, 6)).toEqual(original);
    expect(usePlanner.getState().terms.map(({ name }) => name).slice(-3)).toEqual([
      "HK1 2027-2028", "HK2 2027-2028", "HK3 2027-2028",
    ]);
    expect(choice).toHaveFocus();
  });

  it("previews the roadmap while choosing years and only saves on confirmation", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T05:00:00Z"));
    usePlanner.setState({ terms: [], backlog: [], completed: [] });
    usePlanner.getState().addAcademicYears({ admission: 2026, graduation: 2029 });
    const occupiedId = "academic-2029-2030-3";
    usePlanner.setState((state) => ({
      terms: state.terms.map((term) => term.id === occupiedId ? { ...term, modules: ["PLDC"] } : term),
    }));
    const saved = localStorage.getItem("uelcourses-planner");
    render(<PlannerPage />);

    const opener = screen.getByRole("button", { name: "Chọn năm học" });
    fireEvent.click(opener);
    let dialog = within(screen.getByRole("dialog"));
    const selectEarlierGraduation = () => fireEvent.click(within(dialog.getByRole("group", { name: "Năm tốt nghiệp dự kiến" }))
      .getByRole("radio", { name: /2026–2027/ }));
    selectEarlierGraduation();
    expect(document.getElementById("term-academic-2027-2028-1")).toBeNull();
    expect(document.getElementById(`term-${occupiedId}`)).toHaveTextContent("PLDC");
    expect(usePlanner.getState().terms).toHaveLength(12);
    expect(localStorage.getItem("uelcourses-planner")).toBe(saved);

    const admission = within(dialog.getByRole("group", { name: "Năm nhập học" }));
    fireEvent.click(admission.getByRole("radio", { name: /2025–2026/ }));
    expect(document.getElementById("term-academic-2025-2026-1")).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Hủy" }));
    expect(document.getElementById("term-academic-2025-2026-1")).toBeNull();
    expect(document.getElementById("term-academic-2027-2028-1")).toBeInTheDocument();
    expect(localStorage.getItem("uelcourses-planner")).toBe(saved);

    fireEvent.click(opener);
    dialog = within(screen.getByRole("dialog"));
    selectEarlierGraduation();
    fireEvent.click(dialog.getByRole("button", { name: "Tạo học kỳ" }));
    expect(usePlanner.getState().terms).toHaveLength(4);
    expect(usePlanner.getState().terms.find(({ id }) => id === occupiedId)?.modules).toEqual(["PLDC"]);
  });

  it("keeps courses in the academic year previously resolved from the student cohort", () => {
    useSettings.setState({ cohort: "K24" });
    usePlanner.setState({ terms: [{ id: "legacy", name: "Năm 1 – HK2", modules: ["PLDC"] }] });
    usePlanner.getState().addAcademicYears({ admission: 2025, graduation: 2026 });
    expect(usePlanner.getState().terms[0]).toEqual({ id: "legacy", name: "HK2 2024-2025", modules: ["PLDC"] });
    expect(usePlanner.getState().terms).toHaveLength(7);
  });

  it("3. Thẻ cột học kỳ: tiêu đề có hai phần tử riêng biệt (tên / thống kê)", () => {
    render(<PlannerPage />);

    // Thẻ t_sem1 (5 môn, 14 TC)
    const termCard = document.getElementById("term-t_sem1");
    expect(termCard).toBeInTheDocument();

    if (termCard) {
      // Phần tử 1: Tên học kỳ
      const nameElem = within(termCard).getByText("Học kỳ 1 · 2024-2025");
      expect(nameElem).toBeInTheDocument();
      expect(nameElem).toHaveClass("whitespace-nowrap");
      expect(nameElem).toHaveClass("truncate");
      expect(nameElem).toHaveAttribute("title", "Học kỳ 1 · 2024-2025");

      // Phần tử 2: Thống kê số môn và tín chỉ nằm trong một phần tử duy nhất
      const statsElem = within(termCard).getByText("5 môn · 14 TC");
      expect(statsElem).toBeInTheDocument();
      expect(statsElem).toHaveClass("whitespace-nowrap");

      // Hai phần tử là hai DOM node riêng biệt (dòng 1 và dòng 2)
      expect(nameElem).not.toBe(statsElem);
    }
  });

  it("4. Thống kê chứa '5 môn · 14 TC' trong một phần tử duy nhất, không ngắt dòng số và đơn vị", () => {
    render(<PlannerPage />);

    const statsElements = screen.getAllByText("5 môn · 14 TC");
    expect(statsElements.length).toBeGreaterThan(0);

    const firstStats = statsElements[0];
    expect(firstStats.textContent).toBe("5 môn · 14 TC");
    expect(firstStats).toHaveClass("whitespace-nowrap");

    // Không tồn tại text "TC" lẻ loi trong DOM
    expect(screen.queryByText(/^TC$/)).toBeNull();
    // Không chứa chuỗi HKHK trong toàn bộ trang
    expect(screen.queryByText(/HKHK/)).toBeNull();
  });

  it("5. Giao diện tiếng Anh (EN): hiển thị 'Semester 1 · 2024-2025' và '5 courses · 14 credits'", () => {
    act(() => {
      useLang.setState({ lang: "en" });
    });

    render(<PlannerPage />);

    const termCard = document.getElementById("term-t_sem1");
    expect(termCard).toBeInTheDocument();

    if (termCard) {
      // Tên kỳ tiếng Anh
      const nameElem = within(termCard).getByText("Semester 1 · 2024-2025");
      expect(nameElem).toBeInTheDocument();
      expect(nameElem).toHaveClass("whitespace-nowrap");
      expect(nameElem).toHaveAttribute("title", "Semester 1 · 2024-2025");

      // Thống kê tiếng Anh
      const statsElem = within(termCard).getByText("5 courses · 14 credits");
      expect(statsElem).toBeInTheDocument();
      expect(statsElem).toHaveClass("whitespace-nowrap");
    }
  });

  it("6. Xử lý thẻ kỳ 2 có mã lặp HKHK02: hiển thị chuẩn 'Học kỳ 2 · 2024-2025' và '1 môn · 3 TC'", () => {
    render(<PlannerPage />);

    const termCard2 = document.getElementById("term-t_sem2");
    expect(termCard2).toBeInTheDocument();

    if (termCard2) {
      expect(within(termCard2).getByText("Học kỳ 2 · 2024-2025")).toBeInTheDocument();
      expect(within(termCard2).getByText("1 môn · 3 TC")).toBeInTheDocument();
      expect(within(termCard2).queryByText(/HKHK/)).toBeNull();
    }
  });

  it("đổi học kỳ kéo-thả ngay khi con trỏ đi vào cột mới và không làm trễ transform", () => {
    const rect = (left: number, right: number) => ({
      left,
      right,
      top: 0,
      bottom: 100,
      width: right - left,
      height: 100,
    });
    const t1 = { id: "t_sem1" };
    const t2 = { id: "t_sem2" };
    const collisionArgs = {
      active: { id: "TOAN1" },
      collisionRect: rect(20, 120),
      droppableRects: new Map([
        [t1.id, rect(0, 100)],
        [t2.id, rect(100, 200)],
      ]),
      droppableContainers: [t1, t2],
      pointerCoordinates: { x: 110, y: 50 },
    } as Parameters<typeof plannerCollisionDetection>[0];

    expect(plannerCollisionDetection(collisionArgs)[0]?.id).toBe("t_sem2");
    expect(plannerCollisionDetection({ ...collisionArgs, pointerCoordinates: null })[0]?.id).toBe("t_sem1");

    render(<PlannerPage />);
    const moduleCard = document.querySelector('[data-planner-module="TOAN1"]');
    expect(moduleCard).toHaveClass("transition-colors");
    expect(moduleCard).not.toHaveClass("transition");
  });

  it("7. formatPlannerTermStats trả về đúng cấu trúc số môn và tín chỉ cho cả hai ngôn ngữ", () => {
    expect(formatPlannerTermStats(5, 14, "vi")).toBe("5 môn · 14 TC");
    expect(formatPlannerTermStats(5, 14, "en")).toBe("5 courses · 14 credits");
    expect(formatPlannerTermStats(1, 1, "en")).toBe("1 course · 1 credit");
    expect(formatPlannerTermStats(1, 3, "vi")).toBe("1 môn · 3 TC");
  });

  it.each([
    {
      lang: "vi" as const,
      visible: ["GPA hệ 10 tích lũy", "GPA hệ 4 ước tính"],
      removed: ["Tín chỉ đã tính điểm", "Tín chỉ còn lại", "Mục tiêu tốt nghiệp (mô phỏng)"],
    },
    {
      lang: "en" as const,
      visible: ["Cumulative 10-point GPA", "Estimated 4-point GPA"],
      removed: ["Graded credits", "Credits remaining", "Graduation target (simulation)"],
    },
  ])("hiển thị lộ trình và GPA cùng trang ở $lang", ({ lang, visible, removed }) => {
    useLang.setState({ lang });
    render(<PlannerPage />);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: /TOAN1/ })).toHaveLength(1);

    for (const label of visible) expect(screen.getByRole("heading", { name: label })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /thang điểm|display scale/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Hệ 10 là thang điểm chính")).not.toBeInTheDocument();
    expect(screen.queryByText(/bảng điểm UEL hiện hành/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nhập điểm tại từng học phần/)).not.toBeInTheDocument();
    for (const label of removed) expect(screen.queryByText(label)).not.toBeInTheDocument();
  });

  it("nhận 8,0, tự quy đổi điểm chữ và hệ 4 mà không dùng ô số có nút tăng giảm", () => {
    render(<PlannerPage />);
    const term = document.getElementById("term-t_sem1")!;
    const input = within(term).getByRole("textbox", { name: "Điểm hệ 10 của TOAN1" });
    expect(input).toHaveAttribute("type", "text");
    fireEvent.change(input, { target: { value: "8,0" } });

    expect(within(term).getByText("3.5")).toBeInTheDocument();
    expect(within(term).getByText("A")).toBeInTheDocument();
    expect(screen.getByText("Đã xếp vào kế hoạch").nextElementSibling).toHaveTextContent("17 TC");
    expect(screen.getByRole("progressbar", { name: "Tiến độ tín chỉ" })).toHaveAttribute("aria-valuemax", "17");
    expect(within(term).getByText("8.00")).toBeInTheDocument();

    expect(screen.getByText("GPA hệ 4 ước tính")).toBeInTheDocument();
    expect(within(term).getByText("3.50")).toBeInTheDocument();
    expect(screen.getAllByText("3.50")).toHaveLength(2);
    expect(screen.queryByText("Mục tiêu tốt nghiệp (mô phỏng)")).not.toBeInTheDocument();
  });

  it("đọc điểm đã lưu và giữ điểm khi xếp môn đã học vào kỳ", () => {
    localStorage.setItem("uelcourses-user-scores", JSON.stringify({ TOAN1: 9, DAHOC: 7.5 }));
    usePlanner.setState((state) => ({
      completed: ["TOAN1", "DAHOC"],
      catalog: { ...state.catalog, DAHOC: { code: "DAHOC", name: "Đã học", credits: 3 } },
    }));
    render(<PlannerPage />);

    expect(screen.getByRole("heading", { name: "Đã học (chưa xếp kỳ)" })).toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: "Điểm hệ 10 của TOAN1" })).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Điểm hệ 10 của DAHOC" })).toHaveValue("7.5");
    expect(screen.getByText("8.25")).toBeInTheDocument();
    expect(screen.getByText("Đã xếp vào kế hoạch").nextElementSibling).toHaveTextContent("20 TC");

    act(() => usePlanner.getState().move("DAHOC", "t_sem2"));
    expect(screen.queryByRole("heading", { name: "Đã học (chưa xếp kỳ)" })).not.toBeInTheDocument();
    expect(within(document.getElementById("term-t_sem2")!).getByRole("textbox", { name: "Điểm hệ 10 của DAHOC" })).toHaveValue("7.5");
    expect(screen.getByText("8.25")).toBeInTheDocument();
  });

  it("thêm nhiều mã vào nơi đã chọn và cho nhập điểm ngay trên trang", async () => {
    vi.mocked(api.module).mockResolvedValueOnce({
      data: { code: "DAHOC", name: "Môn đã học", credits: 3 } as NonNullable<Awaited<ReturnType<typeof api.module>>["data"]>,
      mock: true,
    });
    render(<PlannerPage />);
    fireEvent.click(screen.getByRole("combobox", { name: "Thêm học phần vào" }));
    fireEvent.click(screen.getByRole("option", { name: "Đã học (chưa xếp kỳ)" }));
    fireEvent.click(screen.getByText("Thêm nhiều mã học phần"));
    const batchDialog = screen.getByRole("dialog", { name: "Thêm nhiều mã học phần" });
    expect(batchDialog).toHaveClass("absolute");
    fireEvent.change(screen.getByRole("textbox", { name: "Mã học phần cần thêm" }), { target: { value: "DAHOC" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm môn" }));

    const input = await screen.findByRole("textbox", { name: "Điểm hệ 10 của DAHOC" });
    expect(usePlanner.getState().backlog).toEqual([]);
    fireEvent.change(input, { target: { value: "8.0" } });
    expect(JSON.parse(localStorage.getItem("uelcourses-user-scores") ?? "{}").DAHOC).toBe(8);
    fireEvent.click(screen.getAllByRole("button", { name: "Đóng bảng thêm nhiều học phần" })[0]);
    expect(screen.queryByRole("dialog", { name: "Thêm nhiều mã học phần" })).not.toBeInTheDocument();
  });
});

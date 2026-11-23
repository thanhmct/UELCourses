import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ModulesPage from "@/app/modules/page";
import { Header } from "@/components/Header";
import { api } from "@/lib/api";
import { usePlanner, useSettings, useTimetable } from "@/lib/store";
import { useLang } from "@/i18n";
import type { ModuleFacets, ModuleSummary, Paged, ProgramSummary, Semester } from "@/lib/types";

const mockFacetsData: ModuleFacets = {
  total: 2,
  language: [{ value: "vi", count: 2 }],
  talent: [],
  credits: [
    { value: "2", count: 1 },
    { value: "3", count: 1 },
  ],
  faculty: [
    { value: "Khoa Kinh tế", count: 2 },
  ],
  department: [
    { value: "Bộ môn Kinh tế học", count: 2 },
  ],
  type: [
    { value: "Lý thuyết", count: 1 },
    { value: "Thực hành", count: 1 },
  ],
  semester: [],
  has_outline: [{ value: "false", count: 2 }],
  final_assessment: [],
};

const mockModulesData: Paged<ModuleSummary> = {
  items: [
    {
      code: "KTE1001",
      name: "Kinh tế vi mô",
      credits: 3,
      type: "Lý thuyết",
      faculty: "Kinh tế",
      has_equivalents: false,
    },
    {
      code: "KTE1002",
      name: "Kinh tế thực hành",
      credits: 2,
      type: "Thực hành",
      faculty: "Kinh tế",
      has_equivalents: false,
    },
  ],
  total: 2,
};

const mockProgramsData: ProgramSummary[] = [
  {
    program_id: "K23406",
    name: "Kinh doanh quốc tế",
    cohort: "K23",
    faculty: "Kinh tế",
    total_credits: 130,
  },
  {
    program_id: "K23406E",
    name: "Kinh doanh quốc tế (tiếng Anh)",
    cohort: "K23",
    faculty: "Kinh tế",
    total_credits: 130,
  },
  {
    program_id: "K23404",
    name: "Tài chính - Ngân hàng",
    cohort: "K23",
    faculty: "Khoa Tài chính - Ngân hàng",
    total_credits: 130,
  },
];

const mockSemestersData: Semester[] = [
  {
    id: "2026-2027-1",
    name: "Học kỳ 1 năm học 2026–2027",
    year: "2026-2027",
    term: 1,
    is_current: true,
  },
  {
    id: "2026-2027-2",
    name: "Học kỳ 2 năm học 2026–2027",
    year: "2026-2027",
    term: 2,
    is_current: false,
  },
];

describe("ModulesPage Filters and Placeholders", () => {
  beforeEach(() => {
    localStorage.clear();
    useTimetable.setState(useTimetable.getInitialState());
    usePlanner.setState(usePlanner.getInitialState());
    useSettings.setState(useSettings.getInitialState());
    useLang.getState().setLang("vi");
    vi.spyOn(api, "moduleFacets").mockResolvedValue({ data: mockFacetsData, mock: false });
    vi.spyOn(api, "modules").mockResolvedValue({ data: mockModulesData, mock: false });
    vi.spyOn(api, "programs").mockResolvedValue({ data: mockProgramsData, mock: false });
    vi.spyOn(api, "semesters").mockResolvedValue({ data: mockSemestersData, mock: false });
    vi.spyOn(api, "program").mockImplementation(async (id: string) => {
      const norm = id.trim().toUpperCase();
      const base = norm.replace(/E\d*$/, "");
      const match = mockProgramsData.find((p) => p.program_id === norm || p.program_id === base);
      return {
        data: match
          ? {
              program: {
                ...match,
                program_id: norm,
                name: norm.includes("E") ? `${match.name} (tiếng Anh)` : match.name,
              },
              blocks: [],
            }
          : null,
        mock: false,
      };
    });
    vi.spyOn(api, "electiveGroups").mockResolvedValue({ data: [], mock: false });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    useTimetable.setState(useTimetable.getInitialState());
    usePlanner.setState(usePlanner.getInitialState());
    useSettings.setState(useSettings.getInitialState());
    useLang.getState().setLang("vi");
  });

  it.each([
    { lang: "en", accessibleName: "Syllabus (PDF)", label: "Syllabus↗" },
    { lang: "vi", accessibleName: "Đề cương (PDF)", label: "Đề cương↗" },
  ] as const)("renders the syllabus link label in $lang", async ({ lang, accessibleName, label }) => {
    useLang.getState().setLang(lang);
    const outlineUrl = "https://example.com/syllabus.pdf";
    vi.mocked(api.modules).mockResolvedValue({
      data: {
        items: [{ ...mockModulesData.items[0], has_outline: true, outline_url: outlineUrl }],
        total: 1,
      },
      mock: false,
    });

    render(<ModulesPage />);

    const link = await screen.findByRole("link", { name: accessibleName });
    expect(link.textContent).toBe(label);
    expect(link).toHaveAttribute("href", outlineUrl);
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders the semester tabs and class count in English", async () => {
    useLang.getState().setLang("en");
    const course = {
      ...mockModulesData.items[0],
      open_semesters: [
        { semester: "2026-2027-1", classes: 1 },
        { semester: "2026-2027-2", classes: 20 },
      ],
    };
    vi.mocked(api.modules).mockResolvedValue({ data: { items: [course], total: 1 }, mock: false });
    render(<ModulesPage />);
    const tabs = within(await screen.findByRole("group", { name: "Semesters with open classes" }));
    expect(tabs.getByText("Term 1")).toHaveClass("whitespace-nowrap");
    expect(tabs.getByText("Term 2")).toHaveClass("whitespace-nowrap");
    expect(tabs.getByText("1 class")).toBeInTheDocument();
    expect(tabs.getByText("20 classes")).toBeInTheDocument();
  });

  it.each([
    { lang: "vi", add: "Thêm vào thời khóa biểu", remove: "Gỡ khỏi thời khóa biểu", warning: "Không có lớp mở ở học kỳ này", type: "Lý thuyết", practice: "Thực hành" },
    { lang: "en", add: "Add to timetable", remove: "Remove from timetable", warning: "No classes are open this semester", type: "Theory", practice: "Practice" },
  ] as const)("warns about unavailable timetable classes in $lang before and after adding", async ({ lang, add, remove, warning, type, practice }) => {
    useLang.getState().setLang(lang);
    const courseWithoutClasses = {
      ...mockModulesData.items[0],
      open_semesters: [
        { semester: "2026-2027-3", classes: 2 },
        { semester: "2026-2027-2", classes: 0 },
        { semester: "2026-2027-1", classes: 1 },
      ],
    };
    const courseWithClasses = {
      ...mockModulesData.items[1],
      open_semesters: [{ semester: "2026-2027-2", classes: 1 }],
    };
    vi.mocked(api.modules).mockResolvedValue({ data: { items: [courseWithoutClasses, courseWithClasses], total: 2 }, mock: false });

    render(<ModulesPage />);

    const unavailableCard = within((await screen.findByRole("link", { name: /KTE1001/ })).closest("li")!);
    const availableCard = within(screen.getByRole("link", { name: /KTE1002/ }).closest("li")!);
    const addButton = await unavailableCard.findByRole("button", { name: new RegExp(add) });
    expect(addButton).toBeEnabled();
    expect(addButton).toHaveAccessibleDescription(warning);
    expect(unavailableCard.getByText(warning)).toBeVisible();
    expect(availableCard.getByRole("button", { name: new RegExp(add) })).not.toHaveAccessibleDescription();
    expect(availableCard.queryByText(/Không có lớp mở ở học kỳ này|No classes are open this semester/)).not.toBeInTheDocument();
    expect(unavailableCard.getByText(new RegExp(` · ${type}$`))).toBeVisible();
    expect(availableCard.getByText(new RegExp(` · ${practice}$`))).toBeVisible();
    expect(await screen.findByRole("checkbox", { name: new RegExp(type) })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: new RegExp(practice) })).toBeInTheDocument();

    fireEvent.click(addButton);

    expect(unavailableCard.getByRole("button", { name: new RegExp(remove) })).toHaveAccessibleDescription(warning);
    expect(unavailableCard.getByText(warning)).toBeVisible();
    expect(unavailableCard.getByRole("status")).toBeEmptyDOMElement();
    expect(useTimetable.getState().bySemester["2026-2027-2"]?.map((entry) => entry.code)).toEqual([courseWithoutClasses.code]);
  });

  it("saves additions to Term 2 and the planner and shows both statuses after reopening", async ({ onTestFinished }) => {
    localStorage.clear();
    useTimetable.setState(useTimetable.getInitialState());
    usePlanner.setState(usePlanner.getInitialState());
    onTestFinished(() => {
      localStorage.clear();
      useTimetable.setState(useTimetable.getInitialState());
      usePlanner.setState(usePlanner.getInitialState());
    });
    const course = mockModulesData.items[0];
    vi.mocked(api.modules).mockResolvedValue({ data: { items: [course], total: 1 }, mock: false });
    vi.spyOn(api, "module").mockResolvedValue({ data: null, mock: false });
    useTimetable.getState().setSemester("2026-2027-1");

    const page = render(<ModulesPage />);
    const addTT = await screen.findByRole("button", { name: "Thêm vào thời khóa biểu Kỳ 2 năm học hiện tại" });
    expect(screen.queryByRole("button", { name: "Báo lỗi" })).not.toBeInTheDocument();
    const addPlan = screen.getByRole("button", { name: "Thêm vào kế hoạch" });
    for (const button of [addTT, addPlan]) {
      expect(button).toHaveClass(
        "enabled:hover:bg-brand-600", "enabled:hover:text-white",
        "dark:enabled:hover:bg-brand-300", "dark:enabled:hover:text-brand-900",
      );
    }
    fireEvent.click(addTT);
    fireEvent.click(addPlan);
    await screen.findByRole("button", { name: "Gỡ khỏi kế hoạch" });

    expect(useTimetable.getState().bySemester["2026-2027-2"]?.map((entry) => entry.code)).toEqual([course.code]);
    expect(useTimetable.getState().semester).toBe("2026-2027-1");
    expect(usePlanner.getState().terms[0].modules).not.toContain(course.code);
    expect(usePlanner.getState().backlog).toContain(course.code);
    expect(JSON.parse(localStorage.getItem("uelcourses-timetable")!).state.bySemester["2026-2027-2"]).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem("uelcourses-planner")!).state.backlog).toContain(course.code);

    page.unmount();
    render(<ModulesPage />);
    const removeTT = await screen.findByRole("button", { name: "Gỡ khỏi thời khóa biểu Kỳ 2 năm học hiện tại" });
    const removePlan = screen.getByRole("button", { name: "Gỡ khỏi kế hoạch" });
    expect(removeTT).toHaveClass(
      "border-brand-600", "bg-white", "text-brand-700",
      "hover:bg-brand-600", "hover:text-white",
      "focus-visible:bg-brand-600", "focus-visible:text-white",
      "dark:bg-slate-900", "dark:text-brand-300",
      "dark:hover:bg-brand-600", "dark:hover:text-white",
      "dark:focus-visible:bg-brand-600", "dark:focus-visible:text-white",
    );
    expect(removePlan).toHaveClass("btn", "brand-fill");
    expect(removeTT).toHaveTextContent("Gỡ khỏi thời khóa biểu");
    expect(removePlan).toHaveTextContent("Gỡ khỏi kế hoạch");
    expect(removePlan).toHaveClass("hover:bg-none", "hover:bg-white", "hover:text-brand-700", "focus-visible:bg-none");
    fireEvent.click(removeTT);
    fireEvent.click(removePlan);
    expect(useTimetable.getState().bySemester["2026-2027-2"]).toEqual([]);
    expect(useTimetable.getState().semester).toBe("2026-2027-1");
    expect(usePlanner.getState().backlog).not.toContain(course.code);
  });

  it("excludes past terms from filters and shows the full course description", async () => {
    const description = "Mô tả đầy đủ học phần. ".repeat(15).trim() + "Kết thúc mô tả.";
    const course = { ...mockModulesData.items[0], description };
    vi.mocked(api.modules).mockResolvedValue({ data: { items: [course], total: 1 }, mock: false });
    vi.mocked(api.moduleFacets).mockResolvedValue({
      data: { ...mockFacetsData, semester: [
        { value: "2025-2026-2", count: 3 },
        { value: "2025-2026-3", count: 45 },
        { value: "2026-2027-2", count: 1 },
      ] },
      mock: false,
    });
    render(<ModulesPage />);
    expect(await screen.findByText(description)).not.toHaveClass("line-clamp-3");
    expect(await screen.findByText("2026–2027", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("2025–2026", { exact: true })).not.toBeInTheDocument();
  });

  it("renders filter panel with reset button, separate Faculty/Department, and hides empty sections", async () => {
    useLang.getState().setLang("vi");
    render(<ModulesPage />);

    // Reset button exists and is initially disabled because no facet filters are active
    const resetBtn = screen.getByRole("button", { name: /xóa bộ lọc/i });
    expect(resetBtn).toBeInTheDocument();
    expect(resetBtn).toBeDisabled();

    // Separate Khoa and Bộ môn sections exist (Requirement 4)
    expect(screen.getByText("Khoa quản lý")).toBeInTheDocument();
    expect(screen.getByText("Bộ môn")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Tìm khoa…")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Tìm bộ môn…")).toBeInTheDocument();

    // Section Grading basis and Final assessment are HIDDEN when data is empty (Requirement 5)
    expect(screen.queryByText("Đánh giá và cách tính điểm")).not.toBeInTheDocument();
    expect(screen.queryByText("Đánh giá cuối kỳ")).not.toBeInTheDocument();

    // Global count note when no program is filtered (Requirement 3)
    const globalNotes = screen.getAllByText("Số lượng toàn trường");
    expect(globalNotes.length).toBeGreaterThan(0);
  });

  it("handles filter interactions: activating facets enables reset, and reset clears facets and faculty search while preserving module search and program context", async () => {
    useLang.getState().setLang("vi");
    useSettings.getState().setProgramCode("K23406E1");

    render(
      <>
        <Header />
        <ModulesPage />
      </>
    );

    // Personal program context is preserved (W11 banner: tên ngành + khóa 23)
    expect(await screen.findByText(/Kinh doanh quốc tế.*khóa 23/i)).toBeInTheDocument();

    // Reset button is initially disabled
    const resetBtn = screen.getByRole("button", { name: /xóa bộ lọc/i });
    expect(resetBtn).toBeDisabled();

    // Enter module search query
    const moduleSearchInput = screen.getByRole("searchbox", { name: /tìm học phần/i });
    fireEvent.change(moduleSearchInput, { target: { value: "kinh tế" } });
    expect(moduleSearchInput).toHaveValue("kinh tế");

    // Enter faculty search query
    const facultySearchInput = screen.getByPlaceholderText("Tìm khoa…");
    fireEvent.change(facultySearchInput, { target: { value: "kinh tế" } });
    expect(facultySearchInput).toHaveValue("kinh tế");

    // Reset button is enabled because facultySearch is active
    expect(resetBtn).not.toBeDisabled();

    // Activate multiple facet options: credits, type, faculty
    // 1. Credits facet
    const creditCheckbox = await screen.findByRole("checkbox", { name: /3 TC/i });
    fireEvent.click(creditCheckbox);
    expect(creditCheckbox).toBeChecked();

    // 2. Type facet
    const typeCheckbox = await screen.findByRole("checkbox", { name: /Lý thuyết/i });
    fireEvent.click(typeCheckbox);
    expect(typeCheckbox).toBeChecked();

    // 3. Faculty facet
    const facultyCheckbox = await screen.findByRole("checkbox", { name: /Khoa Kinh tế/i });
    fireEvent.click(facultyCheckbox);
    expect(facultyCheckbox).toBeChecked();

    // Verify reset button reflects active facets
    expect(resetBtn).not.toBeDisabled();

    // Click reset button
    fireEvent.click(resetBtn);

    // Reset button should now be disabled
    expect(resetBtn).toBeDisabled();

    // Faculty search input should be cleared
    expect(facultySearchInput).toHaveValue("");

    // Facet checkboxes should be deselected
    expect(creditCheckbox).not.toBeChecked();
    expect(typeCheckbox).not.toBeChecked();
    expect(facultyCheckbox).not.toBeChecked();

    // Module search query MUST be retained
    expect(moduleSearchInput).toHaveValue("kinh tế");

    // Personal program context MUST be retained (W11 banner: tên ngành + khóa 23)
    expect(screen.getByText(/Kinh doanh quốc tế.*khóa 23/i)).toBeInTheDocument();
  });

  it("updates count note by context: program vs dual programs (song ngành)", async () => {
    useLang.getState().setLang("vi");

    // Single program: K23406
    useSettings.getState().setProgramCode("K23406");
    const { unmount } = render(
      <>
        <Header />
        <ModulesPage />
      </>
    );

    expect(await screen.findByText(/Kinh doanh quốc tế.*khóa 23/i)).toBeInTheDocument();
    const programNotes = screen.getAllByText("Số lượng trong chương trình đang lọc");
    expect(programNotes.length).toBeGreaterThan(0);
    unmount();

    // Dual programs: K23406 + K23404
    useSettings.getState().setProgramCode("K23406+K23404");
    render(
      <>
        <Header />
        <ModulesPage />
      </>
    );

    const dualNotes = await screen.findAllByText("Số lượng trong các chương trình đang lọc");
    expect(dualNotes.length).toBeGreaterThan(0);
  });

  it("hides the result total below search while keeping facet counts", async () => {
    useLang.getState().setLang("vi");
    render(<ModulesPage />);

    expect(screen.getByPlaceholderText("Mã học phần, tên hoặc mô tả")).toBeInTheDocument();
    expect(screen.queryByText("2 học phần tìm thấy")).not.toBeInTheDocument();

    const allCounts = await screen.findAllByText("2");
    expect(allCounts.length).toBeGreaterThan(0);
  });

  it("renders semester filter squares when facets have semester data and allows selection and reset", async () => {
    useLang.getState().setLang("vi");
    const facetsWithSemester: ModuleFacets = {
      ...mockFacetsData,
      semester: [
        { value: "2026-2027-1", count: 2 },
      ],
    };
    vi.spyOn(api, "moduleFacets").mockResolvedValue({ data: facetsWithSemester, mock: false });

    render(<ModulesPage />);

    // Semester filter heading exists
    expect(await screen.findByText("Học kỳ có lớp mở")).toBeInTheDocument();

    // Square button exists: Kỳ 1 · 2
    const semSquare = await screen.findByRole("checkbox", { name: /Học kỳ 1.*2026–2027/i });
    expect(semSquare).toBeInTheDocument();
    expect(semSquare).toHaveTextContent("Kỳ 1");
    expect(semSquare).toHaveTextContent("· 2");

    // Click to select
    const resetBtn = screen.getByRole("button", { name: /xóa bộ lọc/i });
    expect(resetBtn).toBeDisabled();

    fireEvent.click(semSquare);
    expect(semSquare).toHaveAttribute("aria-checked", "true");
    expect(resetBtn).not.toBeDisabled();

    // Click reset
    fireEvent.click(resetBtn);
    expect(semSquare).toHaveAttribute("aria-checked", "false");
    expect(resetBtn).toBeDisabled();
  });
});

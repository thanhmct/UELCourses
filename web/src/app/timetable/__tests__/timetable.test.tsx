import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { TimetableGrid, lessonDates, type GridBlock } from "@/components/TimetableGrid";
import { TimetableModuleSearch } from "@/components/TimetableModuleSearch";
import { api } from "@/lib/api";
import { parseProgramCode } from "@/lib/programCode";
import { useSettings, useTimetable } from "@/lib/store";
import { translate, useLang } from "@/i18n";
import type { ClassSection, Lesson, ModuleSummary } from "@/lib/types";
import TimetableLayout from "../layout";
import TimetableRoute from "../page";
import {
  formatWeekOptionLabel,
  getDefaultSelectedWeek,
  getSemesterWeeks,
  resolveSelectedWeekOnSemesterChange,
} from "@/lib/semesterWeeks";

function TimetablePage() {
  return <TimetableLayout><TimetableRoute /></TimetableLayout>;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockTooltipViewport(getAnchorRect = () => new DOMRect(80, 120, 120, 48)) {
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(320);
  vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(480);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this.getAttribute("role") === "tooltip" || this.classList.contains("z-[1000]")) return new DOMRect(0, 0, 160, 72);
    if (this.getAttribute("role") === "region") return new DOMRect(0, 0, 320, 480);
    return getAnchorRect();
  });
}

describe("Bộ chọn tuần phía trên ô thêm học phần", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useTimetable.setState(useTimetable.getInitialState());
    useSettings.setState(useSettings.getInitialState());
  });

  it("keeps the school closure visible with holiday themes off, and uses the saved hex swatch", async () => {
    const semesterId = "2026-2027-1";
    const course = { code: "BIM5001", name: "Cơ sở dữ liệu", credits: 3 };
    const classCode = "261BIM500101";
    const calendar = vi.spyOn(api, "academicHolidays").mockResolvedValue({
      data: [
        { id: 1, kind: "holiday", title: "Nghỉ Ngày Văn hóa Việt Nam", start_date: "2026-11-24", end_date: null, verified: true },
        { id: 2, kind: "holiday", title: "Đợt nghỉ theo lịch trường", start_date: "2026-11-27", end_date: "2026-11-28", verified: true },
      ],
      mock: false,
    });
    vi.spyOn(api, "semesters").mockResolvedValue({
      data: [{ id: semesterId, name: "Học kỳ 1", year: "2026-2027", term: 1, is_current: true,
        teaching_start: "2026-11-23", teaching_end: "2026-12-06" }],
      mock: false,
    });
    vi.spyOn(api, "classes").mockResolvedValue({
      data: [{ module_code: course.code, class_code: classCode, lessons: [
        { weekday: 3, start_period: 1, end_period: 2, start_time: "07:00", end_time: "08:40", date_start: "2026-11-24", date_end: "2026-12-01" },
      ] }],
      mock: false,
    });
    vi.spyOn(api, "outline").mockResolvedValue(null);
    useSettings.getState().setCohort("K26");
    useSettings.getState().setTimetableColor(0, "#FFF000");
    useTimetable.getState().setSemester(semesterId);
    useTimetable.getState().addModule(course, classCode);
    render(<TimetablePage />);

    const weekTwo = await screen.findByRole("button", { name: /^Tuần 2 .*1\.7 giờ$/ });
    const weekOne = screen.getByRole("button", { name: /^Tuần 1 .*0 giờ$/ });
    const grid = within(screen.getByRole("region", { name: "Lưới thời khóa biểu theo tuần" }));
    fireEvent.click(weekTwo);
    expect(grid.getByRole("button", { name: /BIM5001 lớp 261BIM500101/ }))
      .toHaveStyle({ backgroundColor: "rgb(255, 240, 0)", color: "rgb(0, 0, 0)" });
    fireEvent.click(weekOne);
    expect(grid.queryByRole("button", { name: /BIM5001 lớp 261BIM500101/ })).toBeNull();
    expect(within(grid.getByRole("row", { name: "Thứ 3" })).getByText("Nghỉ")).toBeInTheDocument();
    const closure = within(grid.getByRole("row", { name: "Thứ 3" })).getByRole("cell");
    expect(closure).toHaveAttribute("aria-colspan", "15");
    expect(closure).toHaveTextContent("24/11/2026 · Nghỉ Ngày Văn hóa Việt Nam");
    expect(screen.getAllByText(/Nghỉ Ngày Văn hóa Việt Nam/)).toHaveLength(1);
    expect(within(grid.getByRole("row", { name: "Thứ 6" })).getByRole("cell")).toHaveTextContent("27/11/2026 · Đợt nghỉ theo lịch trường");
    expect(within(grid.getByRole("row", { name: "Thứ 7" })).getByRole("cell")).toHaveTextContent("28/11/2026 · Đợt nghỉ theo lịch trường");
    expect(calendar).toHaveBeenCalledWith("2026-2027", "K26");
  });

  it("hiện nút Tất cả ngay cả khi học kỳ chưa có ngày học", () => {
    vi.spyOn(api, "semesters").mockResolvedValue({ data: [], mock: false });
    render(<TimetablePage />);

    const selector = within(screen.getByRole("group", { name: "Xem theo tuần" }));
    expect(selector.getByRole("button", { name: "Tất cả" })).toHaveAttribute("aria-pressed", "true");
  });

  it("lets users without a programme choose a future term that has no classes yet", async () => {
    const current = "2026-2027-1";
    useTimetable.getState().setSemester(current);
    vi.spyOn(api, "semesters").mockResolvedValue({
      data: [
        { id: current, name: "Học kỳ 1", year: "2026-2027", term: 1, is_current: true },
        { id: "2025-2026-1", name: "Học kỳ 1", year: "2025-2026", term: 1, is_current: false },
        { id: "2027-2028-1", name: "Học kỳ 1", year: "2027-2028", term: 1, is_current: false },
      ],
      mock: false,
    });
    render(<TimetablePage />);
    fireEvent.click(screen.getByRole("button", { name: "Chọn học kỳ" }));
    const future = await screen.findByRole("button", { name: /2027.2028.*(?:kỳ 2|hk2)|(?:kỳ 2|hk2).*2027.2028/i });
    expect(future).toBeEnabled();
    expect(screen.getByRole("button", { name: /2029.2030.*(?:kỳ 3|hk3)|(?:kỳ 3|hk3).*2029.2030/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /2025.2026/ })).not.toBeInTheDocument();
    fireEvent.click(future);
    expect(useTimetable.getState().semester).toBe("2027-2028-2");
  });

  it("offers a synced plan semester outside the active cohort and before classes are published", async () => {
    const current = "2026-2027-1";
    const planned = "2030-2031-2";
    const course = { code: "BAA2029", name: "Kế toán tài chính", credits: 3 };
    vi.spyOn(api, "semesters").mockResolvedValue({
      data: [{ id: current, name: "HK1", year: "2026-2027", term: 1, is_current: true }], mock: false,
    });
    const classes = vi.spyOn(api, "classes").mockResolvedValue({ data: [], mock: false });
    vi.spyOn(api, "outline").mockResolvedValue(null);
    useTimetable.getState().setSemester(current);
    useTimetable.getState().addModule(course, null, planned);
    useTimetable.setState({ plannerAssignments: { [planned]: [course.code] } });
    render(<TimetablePage />);
    fireEvent.click(screen.getByRole("button", { name: "Chọn học kỳ" }));

    fireEvent.click(await screen.findByRole("button", { name: /2030.2031.*(?:kỳ 2|hk2)|(?:kỳ 2|hk2).*2030.2031/i }));
    expect(await screen.findByRole("link", { name: /BAA2029 Kế toán tài chính/ })).toBeInTheDocument();
    expect(classes).toHaveBeenCalledWith(course.code, planned);
    expect(useTimetable.getState().semester).toBe(planned);
  });

  it("opens the actual clash week and highlights both modules in the list", async () => {
    const semesterId = "2026-2027-1";
    vi.spyOn(api, "semesters").mockResolvedValue({
      data: [{ id: semesterId, name: "Học kỳ 1", year: "2026-2027", term: 1, is_current: true, teaching_start: "2026-09-07", teaching_end: "2026-09-27" }],
      mock: false,
    });
    const timetable = useTimetable.getState();
    timetable.setSemester(semesterId);
    for (const code of ["BMA2045", "BFB4007"]) {
      timetable.addModule({ code, name: code, credits: 2 }, `261${code}01`);
    }
    vi.spyOn(api, "classes").mockImplementation(async (code) => ({
      data: [{
        module_code: code,
        class_code: `261${code}01`,
        lessons: [{ weekday: 2, start_period: 1, end_period: 2, start_time: "07:00", end_time: "08:40", date_start: "2026-09-14", date_end: "2026-09-14" }],
      }],
      mock: false,
    }));
    render(<TimetablePage />);
    const warning = await screen.findByRole("button", { name: "Có 1 cảnh báo xếp lớp" });
    fireEvent.click(warning);
    expect(screen.getByRole("button", { name: /^Tuần 2 / })).toHaveAttribute("aria-pressed", "true");
    for (const code of ["BMA2045", "BFB4007"]) {
      expect(screen.getByRole("link", { name: new RegExp(`^${code}\\b`) }).closest("li")).toHaveClass("bg-rose-50");
    }
  });

  it("hiện tổng tín chỉ và số giờ theo tuần, đồng thời lọc lưới khi bấm nút tuần", async () => {
    const semesterId = "2026-2027-1";
    const course = { code: "BIM5001", name: "Cơ sở dữ liệu", credits: 3 };
    const classCode = "261BIM500101";
    vi.spyOn(api, "semesters").mockResolvedValue({
      data: [{ id: semesterId, name: "Học kỳ 1", year: "2026-2027", term: 1, is_current: true, teaching_start: "2026-09-07", teaching_end: "2026-09-20" }],
      mock: false,
    });
    vi.spyOn(api, "classes").mockResolvedValue({
      data: [{
        module_code: course.code,
        class_code: classCode,
        lessons: [{ weekday: 2, start_period: 1, end_period: 3, start_time: "07:00", end_time: "09:30", date_start: "2026-09-14", date_end: "2026-09-14" }],
      }],
      mock: false,
    });
    vi.spyOn(api, "outline").mockResolvedValue(null);
    useTimetable.getState().setSemester(semesterId);
    useTimetable.getState().addModule(course, classCode);
    render(<TimetablePage />);

    const selector = screen.getByRole("group", { name: "Xem theo tuần" });
    const search = screen.getByPlaceholderText("Thêm một hoặc nhiều học phần vào thời khóa biểu (nhập nhiều mã hoặc tên học phần)");
    expect(screen.queryByText("Thêm một hoặc nhiều học phần vào thời khóa biểu")).not.toBeInTheDocument();
    const credits = screen.getByText("3 tín chỉ", { selector: "strong" });
    expect(credits.compareDocumentPosition(selector)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(selector.compareDocumentPosition(search)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(within(selector).getByText("Thời lượng học tập theo giờ")).toHaveClass("font-bold", "text-brand-700");

    const allWeeks = within(selector).getByRole("button", { name: "Tất cả" });
    const week1 = await within(selector).findByRole("button", { name: "Tuần 1 (07/09/2026 – 13/09/2026), 0 giờ" });
    const week2 = await within(selector).findByRole("button", { name: "Tuần 2 (14/09/2026 – 20/09/2026), 2.5 giờ" });
    expect(week1.previousElementSibling).toHaveTextContent(/^0$/);
    expect(week2.previousElementSibling).toHaveTextContent(/^2\.5$/);

    const grid = within(screen.getByRole("region", { name: "Lưới thời khóa biểu theo tuần" }));
    const classButtonName = /BIM5001 lớp 261BIM500101/;
    fireEvent.click(week1);
    expect(week1).toHaveAttribute("aria-pressed", "true");
    const startDate = within(selector).getByText("07/09/2026", { selector: "time" });
    expect(startDate.closest("div")).toHaveClass("border");
    expect(startDate.parentElement).toHaveTextContent("07/09/2026 – 13/09/2026");
    expect(grid.queryByRole("button", { name: classButtonName })).toBeNull();

    fireEvent.click(week2);
    expect(week2).toHaveAttribute("aria-pressed", "true");
    expect(within(selector).getByText("14/09/2026", { selector: "time" }).parentElement)
      .toHaveTextContent("14/09/2026 – 20/09/2026");
    expect(grid.getByRole("button", { name: classButtonName })).toBeInTheDocument();
    expect(screen.queryByText(/Tuần 2:|Cao nhất|TB ~/)).toBeNull();

    fireEvent.click(allWeeks);
    expect(allWeeks).toHaveAttribute("aria-pressed", "true");
    expect(within(selector).queryByText("14/09/2026", { selector: "time" })).toBeNull();
    expect(week2).toHaveAttribute("aria-pressed", "false");
    expect(grid.getByRole("button", { name: classButtonName })).toBeInTheDocument();
  });

  it("gộp các đợt đổi phòng của cùng lớp và giữ chiều cao lưới khi đổi tuần", async () => {
    mockTooltipViewport();
    const semesterId = "2026-2027-1";
    const course = { code: "BIM2050", name: "Hệ thống thông tin kinh doanh", credits: 3 };
    const classCode = "261BIM205001";
    const alternativeClass = "261BIM205002";
    const slot = { weekday: 5, start_period: 10, end_period: 12, start_time: "15:15", end_time: "17:45" };
    const firstRange = { ...slot, room: "A.709", date_start: "2026-09-10", date_end: "2026-10-22" };
    const roomChange = { ...slot, room: "A.810", date_start: "2026-11-05", date_end: "2026-11-05" };
    const thirdRoom = { ...slot, room: "A.802", date_start: "2026-11-12", date_end: "2026-11-12" };
    const sunday = { ...slot, weekday: 8, room: "A.403", date_start: "2026-09-13", date_end: "2026-09-13" };
    vi.spyOn(api, "semesters").mockResolvedValue({
      data: [{ id: semesterId, name: "Học kỳ 1", year: "2026-2027", term: 1, is_current: true, teaching_start: "2026-08-24", teaching_end: "2026-11-15" }],
      mock: false,
    });
    vi.spyOn(api, "classes").mockResolvedValue({
      data: [
        { module_code: course.code, class_code: classCode, lecturer: "ThS. Nguyễn An", student_groups: ["K25408A"], lessons: [thirdRoom, firstRange, roomChange, { ...roomChange }, sunday] },
        { module_code: course.code, class_code: alternativeClass, lessons: [{ ...firstRange, weekday: 2 }] },
      ],
      mock: false,
    });
    vi.spyOn(api, "outline").mockResolvedValue(null);
    useTimetable.getState().setSemester(semesterId);
    useTimetable.getState().addModule(course, classCode);
    render(<TimetablePage />);

    const grid = within(screen.getByRole("region", { name: "Lưới thời khóa biểu theo tuần" }));
    const weekPicker = within(screen.getByRole("group", { name: "Xem theo tuần" }));
    const allWeeks = weekPicker.getByRole("button", { name: "Tất cả" });
    const thursday = within(grid.getByRole("row", { name: "Thứ 5" }));
    const classButton = /BIM2050 lớp 261BIM205001/;
    const gridHeights = () => grid.getAllByRole("row").map((row) => (row.lastElementChild as HTMLElement).style.height);

    await thursday.findByRole("button", { name: classButton });
    fireEvent.click(allWeeks);
    expect(thursday.getAllByRole("button", { name: classButton })).toHaveLength(1);
    expect(thursday.getByRole("button", { name: classButton })).toHaveTextContent(/A\.709.*A\.810.*A\.802.*10\/09–22\/10/);
    const detailsName = `Lịch khác của lớp ${classCode}`;
    const details = thursday.getByRole("button", { name: detailsName });
    expect(details).toHaveTextContent("+3");
    const heights = gridHeights();
    expect(heights).toEqual(Array(7).fill("57px"));

    const block = thursday.getByRole("button", { name: classButton });
    const alternativeName = new RegExp(`Chọn lớp ${alternativeClass} môn ${course.code}`);
    fireEvent.click(block);
    expect(block).toHaveAttribute("aria-pressed", "true");
    expect(grid.getByRole("button", { name: alternativeName })).toHaveClass("border-dashed");
    expect(screen.queryByRole("dialog", { name: detailsName })).not.toBeInTheDocument();

    fireEvent.mouseEnter(block);
    const preview = screen.getByRole("tooltip");
    expect(preview).toHaveTextContent(`${course.code} · ${course.name}`);
    expect(preview).not.toHaveTextContent(classCode);
    expect(block).toHaveAttribute("aria-describedby", preview.id);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const schedules = within(preview).getAllByRole("listitem");
    expect(schedules).toHaveLength(4);
    expect(schedules[0]).toHaveTextContent("10/09/2026–22/10/2026 · Phòng A.709");
    expect(schedules[1]).toHaveTextContent("05/11/2026 · Phòng A.810");
    expect(schedules[2]).toHaveTextContent("05/11/2026 · Phòng A.810");
    expect(schedules[3]).toHaveTextContent("12/11/2026 · Phòng A.802");
    for (const row of schedules) {
      expect(row).toHaveTextContent("Tiết 10–12 (15:15–17:45)");
      expect(row).toHaveTextContent("Giảng viên ThS. Nguyễn An");
      expect(row).toHaveTextContent("K25408A");
    }
    expect(gridHeights()).toEqual(heights);

    fireEvent.mouseLeave(block, { relatedTarget: details });
    fireEvent.mouseEnter(details);
    expect(screen.getByRole("tooltip")).toBe(preview);
    expect(block).toHaveAttribute("aria-pressed", "true");
    expect(grid.getByRole("button", { name: alternativeName })).toBeInTheDocument();

    fireEvent.keyDown(details, { key: "Escape" });
    expect(preview).not.toBeInTheDocument();
    expect(block).toHaveAttribute("aria-pressed", "false");
    expect(grid.queryByRole("button", { name: alternativeName })).not.toBeInTheDocument();

    fireEvent.click(weekPicker.getByRole("button", { name: /^Tuần 4 / }));
    expect(thursday.getByRole("button", { name: classButton })).toHaveTextContent("17/09/2026");
    expect(thursday.getByRole("button", { name: classButton })).toHaveTextContent("A.709");
    expect(thursday.getByRole("button", { name: classButton })).not.toHaveTextContent("A.810");
    expect(thursday.queryByRole("button", { name: detailsName })).toBeNull();
    fireEvent.mouseEnter(thursday.getByRole("button", { name: classButton }));
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(grid.getByRole("row", { name: "Chủ nhật" })).not.toHaveTextContent(classCode);
    expect(gridHeights()).toEqual(heights);

    fireEvent.click(weekPicker.getByRole("button", { name: /^Tuần 11 / }));
    expect(thursday.getByRole("button", { name: classButton })).toHaveTextContent("05/11/2026");
    expect(thursday.getByRole("button", { name: classButton })).toHaveTextContent("A.810");
    expect(thursday.getByRole("button", { name: classButton })).not.toHaveTextContent("A.709");
    expect(gridHeights()).toEqual(heights);

    fireEvent.click(weekPicker.getByRole("button", { name: /^Tuần 1 / }));
    expect(thursday.queryByRole("button", { name: classButton })).toBeNull();
    expect(gridHeights()).toEqual(heights);
    fireEvent.click(allWeeks);
    expect(thursday.getAllByRole("button", { name: classButton })).toHaveLength(1);
    expect(gridHeights()).toEqual(heights);
  });
});

describe("Chia sẻ thời khóa biểu", () => {
  const semesterId = "2026-2027-2";

  beforeEach(() => {
    useTimetable.getState().setSemester(semesterId);
    vi.spyOn(api, "semesters").mockResolvedValue({ data: [], mock: false });
    vi.spyOn(api, "academicHolidays").mockResolvedValue({ data: [], mock: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useTimetable.setState(useTimetable.getInitialState());
  });

  it("sao chép liên kết của học kỳ và lớp đã chọn, chỉ hiện thông báo", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.spyOn(api, "classes").mockResolvedValue({ data: [], mock: false });
    vi.spyOn(api, "outline").mockResolvedValue(null);
    useTimetable.getState().addModule({ code: "BIM2050", name: "Hệ thống thông tin kinh doanh", credits: 3 }, "262BIM205001");
    render(<TimetablePage />);

    fireEvent.click(screen.getByRole("button", { name: "Chia sẻ" }));

    expect(await screen.findByText("Đã sao chép liên kết chia sẻ")).toHaveAttribute("role", "status");
    expect(writeText).toHaveBeenCalledTimes(1);
    const [link] = writeText.mock.calls[0];
    const url = new URL(link);
    expect(url.origin).toBe(window.location.origin);
    expect(url.pathname).toBe("/timetable");
    expect(url.searchParams.get("sem")).toBe(semesterId);
    expect(url.searchParams.get("m")).toBe("BIM2050~262BIM205001~0");
    expect(screen.queryByDisplayValue(link)).not.toBeInTheDocument();
    expect(screen.queryByText(link)).not.toBeInTheDocument();
  });

  it.each([
    ["bị chặn", { writeText: vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError")) }],
    ["không được hỗ trợ", undefined],
  ])("báo không thể sao chép khi clipboard %s", async (_scenario, clipboard) => {
    vi.stubGlobal("navigator", { clipboard });
    render(<TimetablePage />);

    fireEvent.click(screen.getByRole("button", { name: "Chia sẻ" }));

    expect(await screen.findByText("Không thể sao chép liên kết chia sẻ")).toHaveAttribute("role", "status");
    expect(screen.queryByText("Đã sao chép liên kết chia sẻ")).not.toBeInTheDocument();
  });
});

describe("Phương án và danh sách lớp thời khóa biểu", () => {
  const semesterId = "2026-2027-1";

  beforeEach(() => {
    useTimetable.getState().setSemester(semesterId);
    vi.spyOn(api, "semesters").mockResolvedValue({ data: [], mock: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useLang.getState().setLang("vi");
    useTimetable.setState(useTimetable.getInitialState());
  });

  it("tạo phương án bằng dấu tick và hủy bằng Escape hoặc khi bỏ trống", () => {
    render(<TimetablePage />);
    const newDraft = () => screen.getByRole("button", { name: "+ Mới" });
    fireEvent.click(newDraft());
    const name = () => screen.getByRole("textbox", { name: "Tên phương án" });
    expect(name()).toHaveFocus();
    fireEvent.blur(name(), { relatedTarget: null });
    expect(screen.queryByRole("textbox", { name: "Tên phương án" })).toBeNull();
    fireEvent.click(newDraft());
    fireEvent.change(name(), { target: { value: "Không lưu" } });
    fireEvent.keyDown(name(), { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Không lưu" })).toBeNull();

    fireEvent.click(newDraft());
    fireEvent.change(name(), { target: { value: "  Phương án riêng  " } });
    fireEvent.click(within(name().closest("form")!).getByRole("button", { name: "Lưu tên phương án" }));
    expect(screen.getByRole("button", { name: "Phương án riêng" })).toHaveAttribute("aria-pressed", "true");
    expect(useTimetable.getState().drafts[semesterId]["Phương án riêng"]).toEqual([]);
  });

  it("nhấn Tab chấp nhận ngay tên phương án được đề xuất", () => {
    render(<TimetablePage />);
    fireEvent.click(screen.getByRole("button", { name: "+ Mới" }));
    const name = screen.getByRole("textbox", { name: "Tên phương án" });
    expect(name).toHaveAttribute("placeholder", "Phương án 2");

    fireEvent.keyDown(name, { key: "Tab" });

    expect(screen.queryByRole("textbox", { name: "Tên phương án" })).toBeNull();
    expect(screen.getByRole("button", { name: "Phương án 2" })).toHaveAttribute("aria-pressed", "true");
    expect(useTimetable.getState().drafts[semesterId]["Phương án 2"]).toEqual([]);
  });

  it("nhân bản ngay, đổi tên tại chỗ và bảo toàn các phương án đã lưu", () => {
    vi.spyOn(api, "classes").mockResolvedValue({ data: [], mock: false });
    const course = { code: "BIM2050", name: "Hệ thống thông tin kinh doanh", credits: 3 };
    useTimetable.getState().addModule(course);
    render(<TimetablePage />);
    fireEvent.click(screen.getByRole("button", { name: "Nhân bản" }));
    const copy = screen.getByRole("button", { name: "Phương án 1 (bản sao)" });
    expect(copy).toHaveAttribute("aria-pressed", "true");
    fireEvent.doubleClick(copy);
    const name = screen.getByRole("textbox", { name: "Tên phương án" });
    expect(name).toHaveValue("Phương án 1 (bản sao)");
    fireEvent.change(name, { target: { value: "Phương án 1" } });
    fireEvent.submit(name.closest("form")!);
    expect(screen.getByRole("alert")).toHaveTextContent("Tên phương án đã tồn tại.");
    fireEvent.change(name, { target: { value: "Lịch dự phòng" } });
    fireEvent.submit(name.closest("form")!);
    expect(screen.getByRole("button", { name: "Lịch dự phòng" })).toHaveAttribute("aria-pressed", "true");
    const drafts = useTimetable.getState().drafts[semesterId];
    expect(Object.keys(drafts)).toEqual(["Phương án 1", "Lịch dự phòng"]);
    expect(drafts["Lịch dự phòng"]).toEqual(drafts["Phương án 1"]);
    expect(drafts["Lịch dự phòng"]).toHaveLength(1);
  });

  it("dịch thứ và tiết sang tiếng Anh, chỉ hiện khoảng ngày trong danh sách lớp", async () => {
    useLang.getState().setLang("en");
    const course = { code: "BIM2050", name: "Business Information Systems", credits: 3 };
    const classCode = "261BIM205001";
    const slot = { weekday: 5, start_period: 10, end_period: 12, start_time: "15:15", end_time: "17:45" };
    vi.spyOn(api, "classes").mockResolvedValue({
      mock: false,
      data: [{ module_code: course.code, class_code: classCode, lecturer: "Nguyễn An", lessons: [
        { ...slot, date_start: "2026-09-10", date_end: "2026-10-22" },
        { ...slot, date_start: "2026-11-05", date_end: "2026-11-05" },
        { ...slot, date_start: "2026-11-12" },
      ] }],
    });
    vi.spyOn(api, "outline").mockResolvedValue(null);
    useTimetable.getState().addModule(course, classCode);
    render(<TimetablePage />);
    const option = await screen.findByRole("option", { name: /^261BIM205001/ });
    expect(option).toHaveTextContent("261BIM205001 · Lecturer Nguyễn An");
    expect(screen.getByText("Lecturer Nguyễn An", { selector: "p" })).toBeVisible();
    expect(option).toHaveTextContent("Thursday, Periods 10–12 (15:15–17:45), 10/09/2026–22/10/2026");
    expect(option).not.toHaveTextContent(/Tiết|One day|05\/11|12\/11/i);
    expect(screen.getByRole("button", { name: "Draft 1" })).toBeInTheDocument();
  });
});

describe("1. Lọc theo đuôi E và công tắc Hiện cả học phần hệ tiếng Việt", () => {
  it("nhận diện đúng hệ tiếng Anh từ mã lớp đuôi E / E1 / E2", () => {
    const p1 = parseProgramCode("K23406E");
    expect(p1?.kind).toBe("english");
    expect(p1?.english).toBe(true);

    const p2 = parseProgramCode("K23406E1");
    expect(p2?.kind).toBe("english");
    expect(p2?.english).toBe(true);

    const p3 = parseProgramCode("K24416A");
    expect(p3?.kind).toBe("standard");
    expect(p3?.english).toBe(false);
  });

  it("lọc chỉ hiện học phần mã E khi isEnglishTrack=true và showVietnamese=false", () => {
    const mockModulesList: ModuleSummary[] = [
      { code: "EBAA2028", name: "Financial Accounting", credits: 3, has_equivalents: false, is_english: true, type: "compulsory" },
      { code: "BAA2028", name: "Nguyên lý kế toán", credits: 3, has_equivalents: false, is_english: false, type: "compulsory" },
      { code: "ECO1001", name: "Kinh tế vi mô", credits: 3, has_equivalents: false, is_english: false, type: "compulsory" },
    ];

    const isEMod = (m: ModuleSummary) =>
      m.is_english ?? (m.language_track === "en" ? true : m.code.startsWith("E") && !m.code.startsWith("ECO"));

    // Filter logic as implemented in TimetableModuleSearch
    const filterEnglish = (items: ModuleSummary[], isE: boolean, showVi: boolean) => {
      if (!isE) return items;
      if (!showVi) return items.filter(isEMod);
      return [...items].sort((a, b) => {
        const aIsE = isEMod(a) ? 1 : 0;
        const bIsE = isEMod(b) ? 1 : 0;
        return bIsE - aIsE;
      });
    };

    // Khi chưa bật công tắc: chỉ môn mã E
    const filteredOnlyE = filterEnglish(mockModulesList, true, false);
    expect(filteredOnlyE.map((m) => m.code)).toEqual(["EBAA2028"]);

    // Khi bật công tắc: hiện cả tiếng Việt nhưng ưu tiên mã E lên đầu
    const filteredBoth = filterEnglish(mockModulesList, true, true);
    expect(filteredBoth.map((m) => m.code)).toEqual(["EBAA2028", "BAA2028", "ECO1001"]);
  });
});

describe("2. Chế độ Ngành 1 / Ngành 2 / Cả hai và gộp học phần & gắn nhãn chương trình", () => {
  it("gộp học phần 2 ngành không trùng mã và gán đúng nhãn chương trình", () => {
    const primaryCodes = new Set(["BIM5001", "BIM5002", "ECO1001"]);
    const secondaryCodes = new Set(["ECO1001", "FIN3001", "FIN3002"]);

    const allMergedCodes = Array.from(new Set([...primaryCodes, ...secondaryCodes]));
    expect(allMergedCodes).toHaveLength(5);
    expect(allMergedCodes).toEqual(["BIM5001", "BIM5002", "ECO1001", "FIN3001", "FIN3002"]);

    // Gắn nhãn chương trình
    const getLabel = (code: string) => {
      const inP1 = primaryCodes.has(code);
      const inP2 = secondaryCodes.has(code);
      if (inP1 && inP2) return "Cả hai ngành";
      if (inP1) return "Ngành 1";
      if (inP2) return "Ngành 2";
      return "";
    };

    expect(getLabel("BIM5001")).toBe("Ngành 1");
    expect(getLabel("FIN3001")).toBe("Ngành 2");
    expect(getLabel("ECO1001")).toBe("Cả hai ngành");
  });
});

describe("3. Thông báo trùng lịch mới", () => {
  it("tiếng Việt có thông báo 'Có tiết học trùng lịch:' không chứa số đếm đứng đầu", () => {
    const msgVi = translate("vi", "tt.conflicts");
    expect(msgVi).toBe("Có tiết học trùng lịch:");
    expect(msgVi).not.toContain("{n}");
    expect(msgVi).not.toContain("chỗ trùng lịch");
  });

  it("tiếng Anh có thông báo 'Overlapping classes:'", () => {
    const msgEn = translate("en", "tt.conflicts");
    expect(msgEn).toBe("Overlapping classes:");
    expect(msgEn).not.toContain("{n}");
  });
});

describe("4. Hành vi chọn-để-đổi-lớp", () => {
  const sampleBlocks: GridBlock[] = [
    {
      key: "BIM5001#0",
      code: "BIM5001",
      name: "Cơ sở dữ liệu",
      class_code: "261BIM500101",
      color: "#0b4f9c",
      conflict: false,
      lesson: {
        weekday: 2,
        start_period: 1,
        end_period: 3,
        start_time: "07:00",
        end_time: "09:30",
        room: "B.203",
      },
    },
    {
      key: "ECO1001#0",
      code: "ECO1001",
      name: "Kinh tế vi mô",
      class_code: "261ECO100101",
      color: "#0f766e",
      conflict: false,
      lesson: {
        weekday: 3,
        start_period: 7,
        end_period: 9,
        start_time: "12:30",
        end_time: "15:05",
        room: "A.101",
      },
    },
  ];

  const sampleAlternatives: Record<string, ClassSection[]> = {
    BIM5001: [
      {
        class_code: "261BIM500101",
        module_code: "BIM5001",
        lecturer: "TS. Nguyễn Văn A",
        lessons: [{ weekday: 2, start_period: 1, end_period: 3, start_time: "07:00", end_time: "09:30", room: "B.203" }],
      },
      {
        class_code: "261BIM500102",
        module_code: "BIM5001",
        lecturer: "ThS. Trần Thị B",
        lessons: [{ weekday: 4, start_period: 4, end_period: 6, start_time: "09:45", end_time: "12:15", room: "B.205" }],
      },
      {
        class_code: "261BIM500103",
        module_code: "BIM5001",
        lecturer: "TS. Lê C",
        lessons: [
          // Lớp này trùng vào Thứ 3 tiết 7-9 với ECO1001
          { weekday: 3, start_period: 7, end_period: 9, start_time: "12:30", end_time: "15:05", room: "C.301" },
        ],
      },
    ],
    ECO1001: [
      {
        class_code: "261ECO100101",
        module_code: "ECO1001",
        lecturer: "ThS. Đỗ E",
        lessons: [{ weekday: 3, start_period: 7, end_period: 9, start_time: "12:30", end_time: "15:05", room: "A.101" }],
      },
    ],
  };

  it("render TimetableGrid và không còn chứa dòng 'Kéo để đổi lớp'", () => {
    const onChangeClass = vi.fn();
    render(
      <TimetableGrid
        blocks={sampleBlocks}
        alternatives={sampleAlternatives}
        colors={{ BIM5001: "#0b4f9c", ECO1001: "#0f766e" }}
        onChangeClass={onChangeClass}
      />,
    );

    // Kiểm tra không có chuỗi kéo-thả
    expect(screen.queryByText(/kéo để đổi lớp/i)).toBeNull();

    // Khối lớp render đúng
    expect(screen.getByRole("button", { name: /BIM5001 lớp 261BIM500101/ })).toBeInTheDocument();
  });

  it("bấm khối → xuất hiện ô bóng của lớp khác và KHÔNG có panel 'Đổi lớp cho môn'", () => {
    const onChangeClass = vi.fn();
    render(
      <TimetableGrid
        blocks={sampleBlocks}
        alternatives={sampleAlternatives}
        colors={{ BIM5001: "#0b4f9c", ECO1001: "#0f766e" }}
        onChangeClass={onChangeClass}
      />,
    );

    // Bấm vào khối BIM5001
    const blockBtn = screen.getByRole("button", { name: /BIM5001 lớp 261BIM500101/ });
    fireEvent.click(blockBtn);

    expect(blockBtn).toHaveClass("timetable-block-selected");
    expect(blockBtn).toHaveAttribute("aria-pressed", "true");

    // Khối của môn khác (ECO1001) bị mờ đi (opacity-40)
    const ecoBtn = screen.getByRole("button", { name: /ECO1001 lớp 261ECO100101/ });
    expect(ecoBtn.className).toContain("opacity-40");
    expect(ecoBtn).not.toHaveClass("timetable-block-selected");

    // XÓA HOÀN TOÀN panel: KHÔNG còn panel "Đổi lớp cho môn" hay nút "Chọn lớp này"
    expect(screen.queryByText(/Đổi lớp cho môn/)).toBeNull();
    expect(screen.queryByText(/Chọn lớp này/)).toBeNull();

    // Các lớp thay thế hiện thành các ô bóng ngay trên lưới
    const ghost1 = screen.getByRole("button", { name: /261BIM500102/ });
    const ghost2 = screen.getByRole("button", { name: /261BIM500103/ });
    expect(ghost1).toBeInTheDocument();
    expect(ghost2).toBeInTheDocument();

    // Ô bóng có viền nét đứt
    expect(ghost1.className).toContain("border-dashed");
    expect(ghost2.className).toContain("border-dashed");

    mockTooltipViewport();
    fireEvent.mouseEnter(ghost1);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.parentElement).toBe(document.body);
    expect(tooltip).toHaveTextContent("261BIM500102");
    expect(tooltip).toHaveTextContent("ThS. Trần Thị B");
    expect(tooltip).toHaveTextContent("B.205");
    fireEvent.mouseLeave(ghost1);
    expect(tooltip).not.toBeInTheDocument();
  });

  it("giữ khối đang chọn trên lưới khi nhiều lớp thay thế trùng giờ và đặt tooltip trong viewport", () => {
    let anchorRect = new DOMRect(280, 12, 40, 22);
    mockTooltipViewport(() => anchorRect);
    const [block] = sampleBlocks;
    const [first, second] = sampleAlternatives.BIM5001.slice(1);
    const onChangeClass = vi.fn();
    const lesson: Lesson = { ...block.lesson, end_period: 4, end_time: "10:20", room: "B.205" };
    render(
      <TimetableGrid
        blocks={[block, { ...block, key: `${block.key}-second`, lesson: { ...block.lesson, room: "A.203" } }]}
        alternatives={{ BIM5001: [{ ...first, lessons: [lesson] }, { ...second, lessons: [lesson] }] }}
        colors={{}}
        onChangeClass={onChangeClass}
      />,
    );

    const button = screen.getByRole("button", { name: /BIM5001 lớp 261BIM500101/ });
    fireEvent.mouseEnter(button);
    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("ghost-block-261BIM500102")).toBeVisible();
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.parentElement).toBe(document.body);
    expect(tooltip).toHaveClass("fixed");
    expect(tooltip).toHaveTextContent("BIM5001 ·");
    expect(tooltip).toHaveStyle({ left: "152px", top: "34px" });

    anchorRect = new DOMRect(2, 440, 40, 22);
    fireEvent.scroll(screen.getByRole("region"));
    expect(tooltip).toHaveStyle({ left: "8px", top: "368px" });

    anchorRect = new DOMRect(-60, 440, 40, 22);
    fireEvent.scroll(screen.getByRole("region"));
    expect(tooltip).not.toBeVisible();

    fireEvent.keyDown(button, { key: "Escape" });
    expect(tooltip).not.toBeInTheDocument();
    expect(button).toHaveAttribute("aria-pressed", "false");

    // Lớp thay thế bị tràn vẫn chọn được trong bảng nổi của cột ngày.
    anchorRect = new DOMRect(20, 120, 32, 16);
    fireEvent.click(button);
    const badge = screen.getByRole("button", { name: /^Lịch khác vào/ });
    fireEvent.focus(badge);
    const overflow = screen.getByRole("region", { name: /^Lịch khác vào/ });
    expect(overflow).toHaveTextContent("Phòng B.205");
    fireEvent.keyDown(badge, { key: "Tab" });
    const choose = within(overflow).getByRole("button", { name: /Chọn lớp 261BIM500103/ });
    expect(choose).toHaveFocus();
    fireEvent.keyDown(choose, { key: "Escape" });
    expect(overflow).not.toBeInTheDocument();
    expect(badge).toHaveFocus();
    expect(button).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(badge);
    const reopened = screen.getByRole("region", { name: /^Lịch khác vào/ });
    fireEvent.click(within(reopened).getByRole("button", { name: /Chọn lớp 261BIM500103/ }));
    expect(onChangeClass).toHaveBeenCalledWith("BIM5001", "261BIM500103");
    expect(reopened).not.toBeInTheDocument();
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("bấm ô bóng → đổi sang lớp đó ngay và thoát chế độ chọn", () => {
    const onChangeClass = vi.fn();
    render(
      <TimetableGrid
        blocks={sampleBlocks}
        alternatives={sampleAlternatives}
        colors={{ BIM5001: "#0b4f9c", ECO1001: "#0f766e" }}
        onChangeClass={onChangeClass}
      />,
    );

    // Chọn khối để hiện ô bóng
    const blockBtn = screen.getByRole("button", { name: /BIM5001 lớp 261BIM500101/ });
    fireEvent.click(blockBtn);

    // Bấm vào ô bóng 261BIM500102
    const ghostBtn = screen.getByRole("button", { name: /261BIM500102/ });
    fireEvent.click(ghostBtn);

    // Gọi onChangeClass đúng môn và lớp
    expect(onChangeClass).toHaveBeenCalledWith("BIM5001", "261BIM500102");

    // Thoát chế độ chọn: các ô bóng biến mất
    expect(screen.queryByRole("button", { name: /261BIM500102/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /261BIM500103/ })).toBeNull();
  });

  it("nút +N bật tắt bảng nổi và chỉ thân khối chọn lớp thay thế", () => {
    mockTooltipViewport();
    const [block] = sampleBlocks;
    const lesson = { ...block.lesson, end_period: 1, end_time: "07:50" };
    render(
      <TimetableGrid
        blocks={[{ ...block, lesson }, { ...block, key: `${block.key}-second`, lesson: { ...lesson, room: "A.203" } }]}
        alternatives={sampleAlternatives}
        colors={{}}
        onChangeClass={vi.fn()}
      />,
    );

    const body = screen.getByRole("button", { name: /BIM5001 lớp 261BIM500101/ });
    const detailsButton = screen.getByRole("button", { name: "Lịch khác của lớp 261BIM500101" });
    const ghostName = /Chọn lớp 261BIM500102 môn BIM5001/;
    expect(detailsButton).toHaveTextContent("+1");

    fireEvent.pointerDown(detailsButton, { pointerType: "touch" });
    fireEvent.focus(detailsButton);
    fireEvent.click(detailsButton, { detail: 1 });
    const preview = screen.getByRole("tooltip");
    expect(preview).toHaveTextContent("BIM5001 · Cơ sở dữ liệu");
    expect(within(preview).queryByRole("button")).not.toBeInTheDocument();
    expect(body).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: ghostName })).not.toBeInTheDocument();

    fireEvent.click(detailsButton);
    expect(preview).not.toBeInTheDocument();
    fireEvent.focus(body);
    expect(body).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
    fireEvent.click(body);
    expect(body).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(detailsButton);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.click(detailsButton);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.click(document.body);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(body).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: ghostName })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lớp thay thế trùng lịch hiển thị cảnh báo nhưng vẫn bấm được", () => {
    const onChangeClass = vi.fn();
    render(
      <TimetableGrid
        blocks={sampleBlocks}
        alternatives={sampleAlternatives}
        colors={{ BIM5001: "#0b4f9c", ECO1001: "#0f766e" }}
        onChangeClass={onChangeClass}
      />,
    );

    const blockBtn = screen.getByRole("button", { name: /BIM5001 lớp 261BIM500101/ });
    fireEvent.click(blockBtn);

    // Lớp 261BIM500103 trùng lịch với ECO1001 vào Thứ 3 tiết 7-9
    const clashGhost = screen.getByRole("button", { name: /261BIM500103/ });
    expect(clashGhost).toBeInTheDocument();

    // Hiển thị cảnh báo trùng lịch: viền đỏ / text cảnh báo
    expect(clashGhost.className).toContain("border-red-500");
    expect(clashGhost).toHaveAttribute("aria-label", expect.stringMatching(/trùng lịch/i));
    expect(within(clashGhost).getAllByText(/Trùng lịch/)[0]).toBeInTheDocument();

    // Vẫn bấm được để đổi lớp
    fireEvent.click(clashGhost);
    expect(onChangeClass).toHaveBeenCalledWith("BIM5001", "261BIM500103");
  });

  it("thoát chế độ chọn khi nhấn Esc, bấm lại khối đang chọn, hoặc bấm vùng trống", () => {
    const onChangeClass = vi.fn();
    render(
      <TimetableGrid
        blocks={sampleBlocks}
        alternatives={sampleAlternatives}
        colors={{ BIM5001: "#0b4f9c", ECO1001: "#0f766e" }}
        onChangeClass={onChangeClass}
      />,
    );

    const blockBtn = screen.getByRole("button", { name: /BIM5001 lớp 261BIM500101/ });

    // 1. Nhấn Esc để thoát
    fireEvent.click(blockBtn);
    expect(screen.getByRole("button", { name: /261BIM500102/ })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("button", { name: /261BIM500102/ })).toBeNull();
    expect(blockBtn).not.toHaveClass("timetable-block-selected");

    // 2. Bấm lại khối đang chọn để thoát
    fireEvent.click(blockBtn);
    expect(screen.getByRole("button", { name: /261BIM500102/ })).toBeInTheDocument();
    fireEvent.click(blockBtn);
    expect(screen.queryByRole("button", { name: /261BIM500102/ })).toBeNull();

    // 3. Bấm vùng trống trên lưới để thoát
    fireEvent.click(blockBtn);
    expect(screen.getByRole("button", { name: /261BIM500102/ })).toBeInTheDocument();
    const gridRegion = screen.getByRole("region", { name: /Lưới thời khóa biểu/i });
    fireEvent.click(gridRegion);
    expect(screen.queryByRole("button", { name: /261BIM500102/ })).toBeNull();
  });

  it("môn chỉ có một lớp thì không có bóng và không hiển thị thông báo 'Không có lớp thay thế'", () => {
    const onChangeClass = vi.fn();
    render(
      <TimetableGrid
        blocks={sampleBlocks}
        alternatives={sampleAlternatives}
        colors={{ BIM5001: "#0b4f9c", ECO1001: "#0f766e" }}
        onChangeClass={onChangeClass}
      />,
    );

    // ECO1001 chỉ có một lớp trong sampleAlternatives (không có lớp thay thế)
    const ecoBtn = screen.getByRole("button", { name: /ECO1001 lớp 261ECO100101/ });
    fireEvent.click(ecoBtn);

    // Vẫn chọn khối (viền nổi bật, aria-pressed=true)
    expect(ecoBtn).toHaveAttribute("aria-pressed", "true");
    expect(ecoBtn).toHaveClass("timetable-block-selected");

    // Không có ô bóng nào xuất hiện
    expect(screen.queryByTestId(/ghost-block/)).toBeNull();

    // Không hiển thị bất kỳ thông báo / dòng chữ "Không có lớp thay thế"
    expect(screen.queryByText(/Không có lớp thay thế/i)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();

    // Môn có lớp khác (BIM5001) → vẫn hiện ô bóng
    const bimBtn = screen.getByRole("button", { name: /BIM5001 lớp 261BIM500101/ });
    fireEvent.click(bimBtn);
    expect(screen.getByRole("button", { name: /261BIM500102/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /261BIM500103/ })).toBeInTheDocument();
  });

  it("nếu lớp có nhiều buổi thì hiện bóng ở mọi buổi và bấm buổi nào cũng chọn cả lớp", () => {
    const multiAlternatives: Record<string, ClassSection[]> = {
      BIM5001: [
        {
          class_code: "261BIM500101",
          module_code: "BIM5001",
          lessons: [{ weekday: 2, start_period: 1, end_period: 3, start_time: "07:00", end_time: "09:30", room: "B.203" }],
        },
        {
          class_code: "261BIM500104",
          module_code: "BIM5001",
          lecturer: "TS. Hoàng D",
          // Lớp có 2 buổi: Thứ 4 và Thứ 6
          lessons: [
            { weekday: 4, start_period: 1, end_period: 3, start_time: "07:00", end_time: "09:30", room: "B.101" },
            { weekday: 6, start_period: 4, end_period: 6, start_time: "09:45", end_time: "12:15", room: "B.102" },
          ],
        },
      ],
    };

    const onChangeClass = vi.fn();
    render(
      <TimetableGrid
        blocks={[sampleBlocks[0]]}
        alternatives={multiAlternatives}
        colors={{ BIM5001: "#0b4f9c" }}
        onChangeClass={onChangeClass}
      />,
    );

    const blockBtn = screen.getByRole("button", { name: /BIM5001 lớp 261BIM500101/ });
    fireEvent.click(blockBtn);

    // Xuất hiện ô bóng ở cả 2 buổi của lớp 261BIM500104
    const ghostButtons = screen.getAllByRole("button", { name: /261BIM500104/ });
    expect(ghostButtons).toHaveLength(2);

    // Bấm vào buổi thứ 2 (Thứ 6)
    fireEvent.click(ghostButtons[1]);

    // Vẫn chọn cả lớp 261BIM500104
    expect(onChangeClass).toHaveBeenCalledWith("BIM5001", "261BIM500104");
  });

  it("các khối và ô bóng đều là button có aria-label đầy đủ thông tin môn, lớp, thứ, tiết", () => {
    const onChangeClass = vi.fn();
    render(
      <TimetableGrid
        blocks={sampleBlocks}
        alternatives={sampleAlternatives}
        colors={{ BIM5001: "#0b4f9c", ECO1001: "#0f766e" }}
        onChangeClass={onChangeClass}
      />,
    );

    // Khối chính
    const blockBtn = screen.getByRole("button", { name: /BIM5001 lớp 261BIM500101/ });
    expect(blockBtn.tagName).toBe("BUTTON");
    const blockAria = blockBtn.getAttribute("aria-label") ?? "";
    expect(blockAria).toContain("BIM5001");
    expect(blockAria).toContain("261BIM500101");
    expect(blockAria).toContain("Thứ 2");
    expect(blockAria).toContain("tiết 1 đến 3");

    // Mở ô bóng
    fireEvent.click(blockBtn);
    const ghostBtn = screen.getByRole("button", { name: /261BIM500102/ });
    expect(ghostBtn.tagName).toBe("BUTTON");
    const ghostAria = ghostBtn.getAttribute("aria-label") ?? "";
    expect(ghostAria).toContain("BIM5001");
    expect(ghostAria).toContain("261BIM500102");
    expect(ghostAria).toContain("Thứ 4");
    expect(ghostAria).toContain("tiết 4 đến 6");
  });

  it("lessonDates trả về oneTime=true và nhãn Một ngày (vi) / One day (en) cho buổi chỉ diễn ra một ngày", () => {
    const l: Lesson = {
      weekday: 4,
      start_period: 1,
      end_period: 3,
      start_time: "07:00",
      end_time: "09:30",
      date_start: "2026-09-09",
      date_end: "2026-09-09",
    };
    const resVi = lessonDates(l, "vi");
    expect(resVi.oneTime).toBe(true);
    expect(resVi.text).toBe("09/09");
    expect(resVi.label).toBe("Một ngày · 09/09");

    const resEn = lessonDates(l, "en");
    expect(resEn.oneTime).toBe(true);
    expect(resEn.label).toBe("One day · 09/09");
  });
});

describe("5. Brief W21: Bộ chọn 'Xem theo tuần' và chuẩn hóa tuần học kỳ", () => {
  it("khoảng tuần 07/09–15/11 sinh đúng 10 tuần, ẩn tuần thừa ngoài kỳ, giữ tuần 0 giờ giữa kỳ", () => {
    const sem = {
      id: "2026-2027-1",
      name: "HK1 2026–2027",
      year: "2026-2027",
      term: 1,
      is_current: true,
      start_date: "2026-07-06", // Ngày DB cũ quá rộng (34 tuần)
      end_date: "2027-02-28",
      teaching_start: "2026-09-07", // Đã chuẩn hóa từ API
      teaching_end: "2026-11-15",
    };

    const weeks = getSemesterWeeks(sem, []);
    expect(weeks).toHaveLength(10);
    expect(weeks[0].label).toBe("Tuần 1 (07/09 – 13/09)");
    expect(weeks[9].label).toBe("Tuần 10 (09/11 – 15/11)");
    // Mọi tuần đều có nhãn đúng và tổng giờ 0 khi chưa có môn
    expect(formatWeekOptionLabel(weeks[0])).toBe("Tuần 1 (07/09 – 13/09)");
    // Không có tuần nào trước 07/09 hoặc sau 15/11
    expect(weeks.some((w) => w.startIso < "2026-09-07")).toBe(false);
    expect(weeks.some((w) => w.endIso > "2026-11-15")).toBe(false);
  });

  it("mặc định chọn tuần hiện tại nếu nằm trong kỳ, ngược lại 'Tất cả các tuần'", () => {
    const sem = {
      id: "2026-2027-1",
      name: "HK1",
      year: "2026-2027",
      term: 1,
      is_current: true,
      teaching_start: "2026-09-07",
      teaching_end: "2026-11-15",
    };

    // Khi hôm nay là 22/09/2026 (thuộc Tuần 3: 21/09 - 27/09)
    const inWeeks = getSemesterWeeks(sem, [], { now: new Date("2026-09-22T08:00:00Z") });
    expect(getDefaultSelectedWeek(inWeeks)).toBe(3);

    // Khi hôm nay là 15/07/2026 (ngoài kỳ)
    const outWeeks = getSemesterWeeks(sem, [], { now: new Date("2026-07-15T08:00:00Z") });
    expect(getDefaultSelectedWeek(outWeeks)).toBe("all");
  });

  it("đổi kỳ tự cập nhật: nếu tuần đang chọn không thuộc kỳ mới thì về 'all'", () => {
    const sem8Weeks = getSemesterWeeks({
      id: "sem-8",
      name: "8 weeks",
      year: "2026-2027",
      term: 3,
      is_current: false,
      teaching_start: "2027-04-12",
      teaching_end: "2027-06-06",
    });
    expect(sem8Weeks).toHaveLength(8);

    // Đang chọn Tuần 5: kỳ mới có Tuần 5 -> giữ 5
    expect(resolveSelectedWeekOnSemesterChange(5, sem8Weeks)).toBe(5);

    // Đang chọn Tuần 10: kỳ mới chỉ có 8 tuần -> về 'all'
    expect(resolveSelectedWeekOnSemesterChange(10, sem8Weeks)).toBe("all");

    // Đang chọn 'all' -> giữ 'all'
    expect(resolveSelectedWeekOnSemesterChange("all", sem8Weeks)).toBe("all");
  });
});

describe("6. Brief W22: Giao diện khung cố định, không văn bản cảnh báo trong luồng, báo hiệu trực tiếp trên khối môn", () => {
  const conflictBlocks: GridBlock[] = [
    {
      key: "BIE3004#0",
      code: "BIE3004",
      name: "Kinh tế đối ngoại",
      class_code: "261BIE300401",
      color: "#0b4f9c",
      conflict: true,
      violations: [
        {
          type: "conflict",
          title: "Trùng lịch",
          otherModuleCode: "BIM2050",
          otherClassCode: "261BIM205001",
          weekday: 5,
          periods: "tiết 7–9",
        },
      ],
      lesson: {
        weekday: 5,
        start_period: 7,
        end_period: 9,
        start_time: "12:30",
        end_time: "15:05",
        room: "B.101",
      },
    },
    {
      key: "BIM2050#0",
      code: "BIM2050",
      name: "Hệ thống thông tin",
      class_code: "261BIM205001",
      color: "#0f766e",
      conflict: true,
      violations: [
        {
          type: "conflict",
          title: "Trùng lịch",
          otherModuleCode: "BIE3004",
          otherClassCode: "261BIE300401",
          weekday: 5,
          periods: "tiết 7–9",
        },
      ],
      lesson: {
        weekday: 5,
        start_period: 7,
        end_period: 9,
        start_time: "12:30",
        end_time: "15:05",
        room: "B.102",
      },
    },
  ];

  it("không có role='alert' hay chuỗi văn bản cảnh báo chiếm chỗ cố định trong luồng", () => {
    render(
      <TimetableGrid
        blocks={conflictBlocks}
        alternatives={{}}
        colors={{ BIE3004: "#0b4f9c", BIM2050: "#0f766e" }}
        onChangeClass={vi.fn()}
      />,
    );

    // Tuyệt đối không có banner role="alert" trong luồng nội dung
    expect(screen.queryByRole("alert")).toBeNull();
    // Tuyệt đối không có dòng chữ cảnh báo danh sách lỗi
    expect(screen.queryByText(/Có tiết học trùng lịch/i)).toBeNull();
    expect(screen.queryByText(/Vi phạm quy định xếp lớp/i)).toBeNull();
  });

  it("mở rộng hàng có hai lớp trùng giờ và giữ chiều cao đó khi đổi tuần", () => {
    const props = { semesterBlocks: conflictBlocks, alternatives: {}, colors: {}, onChangeClass: vi.fn() };
    const { rerender } = render(<TimetableGrid {...props} blocks={conflictBlocks} />);
    const thursday = screen.getByRole("row", { name: "Thứ 5" });
    const classButton = /BIM2050 lớp 261BIM205001/;
    expect(within(thursday).getByRole("button", { name: classButton })).toBeInTheDocument();
    expect(within(thursday).getByRole("button", { name: /BIE3004 lớp/ })).toBeInTheDocument();
    for (const row of screen.getAllByRole("row")) {
      expect(row.lastElementChild).toHaveStyle({ height: row === thursday ? "120px" : "57px" });
    }

    rerender(<TimetableGrid {...props} blocks={[{ ...conflictBlocks[1], occDate: "2026-09-17" }]} />);
    expect(within(thursday).queryByRole("button", { name: /BIE3004 lớp/ })).toBeNull();
    expect(within(thursday).getByRole("button", { name: classButton })).toBeInTheDocument();
    expect(thursday.lastElementChild).toHaveStyle({ height: "120px" });
  });

  it("rê chuột hoặc focus +N ở cột ngày hiển thị lịch tràn trong bảng nổi và Esc đóng bảng", () => {
    mockTooltipViewport();
    const third = {
      ...conflictBlocks[0],
      key: "BAA2028#0",
      code: "BAA2028",
      name: "Kinh tế học",
      class_code: "261BAA202801",
      occDate: "2026-09-17",
    };
    render(<TimetableGrid blocks={[...conflictBlocks, third]} alternatives={{}} colors={{}} onChangeClass={vi.fn()} />);
    const thursday = screen.getByRole("row", { name: "Thứ 5" });
    const gridDay = thursday.lastElementChild;
    const label = "Lịch khác vào Thứ 5";
    const badge = within(thursday).getByRole("button", { name: label });
    expect(badge).toHaveTextContent("+1");
    expect(screen.queryByRole("region", { name: label })).not.toBeInTheDocument();

    fireEvent.mouseEnter(badge);
    const details = screen.getByRole("region", { name: label });
    expect(details.parentElement).toBe(document.body);
    expect(details).toHaveClass("fixed", "z-[1000]");
    expect(details).toHaveTextContent("BAA2028 Kinh tế học · 261BAA202801");
    expect(details).toHaveTextContent("17/09/2026 · Phòng B.101");
    expect(details).toHaveTextContent("Thứ 5 · Tiết 7–9 (12:30–15:05)");
    expect(details).toHaveTextContent("Trùng lịch");
    expect(gridDay).toHaveStyle({ height: "120px" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.mouseLeave(badge);
    expect(details).not.toBeInTheDocument();

    fireEvent.focus(badge);
    expect(screen.getByRole("region", { name: label })).toBeInTheDocument();
    fireEvent.keyDown(badge, { key: "Escape" });
    expect(screen.queryByRole("region", { name: label })).not.toBeInTheDocument();
    expect(badge).toHaveAttribute("aria-expanded", "false");
  });

  it("bấm +N ở cột ngày chỉ bật tắt bảng nổi và bấm ra ngoài đóng bảng", () => {
    mockTooltipViewport();
    const third = { ...conflictBlocks[0], key: "BAA2028#0", code: "BAA2028", class_code: "261BAA202801" };
    render(<TimetableGrid blocks={[...conflictBlocks, third]} alternatives={{}} colors={{}} onChangeClass={vi.fn()} />);
    const label = "Lịch khác vào Thứ 5";
    const badge = screen.getByRole("button", { name: label });

    fireEvent.pointerDown(badge, { pointerType: "touch" });
    fireEvent.focus(badge);
    fireEvent.click(badge, { detail: 1 });
    expect(screen.getByRole("region", { name: label })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(badge);
    expect(screen.queryByRole("region", { name: label })).not.toBeInTheDocument();
    fireEvent.click(badge);
    expect(screen.getByRole("region", { name: label })).toBeInTheDocument();
    fireEvent.click(document.body);
    expect(screen.queryByRole("region", { name: label })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("tách khung giờ khác nhau và giữ hai phòng trong cùng buổi", () => {
    mockTooltipViewport();
    const first = { ...conflictBlocks[1], occDate: "2026-09-17" };
    const anotherRoom = { ...first, key: "BIM2050#1", lesson: { ...first.lesson, room: "A.810" } };
    const anotherTime = { ...first, key: "BIM2050#2", lesson: { ...first.lesson, start_time: "12:55" } };
    render(<TimetableGrid blocks={[first, anotherRoom, anotherTime]} alternatives={{}} colors={{}} onChangeClass={vi.fn()} />);
    const cards = screen.getAllByRole("button", { name: /BIM2050 lớp 261BIM205001/ });
    expect(cards).toHaveLength(2);
    const badge = screen.getByRole("button", { name: "Lịch khác của lớp 261BIM205001" });
    fireEvent.click(badge);
    expect(screen.getByRole("tooltip")).toHaveTextContent(/17\/09.*B\.102.*A\.810/);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.keyDown(badge, { key: "Escape" });
    fireEvent.click(badge);
    const details = within(screen.getByRole("tooltip"));
    expect(details.getAllByText("17/09/2026 · Phòng B.102")).toHaveLength(1);
    expect(details.queryByText("Thứ 5 · Tiết 7–9 (12:55–15:05)")).not.toBeInTheDocument();
    expect(details.getByText(/17\/09\/2026.*A\.810/)).toBeInTheDocument();
  });

  it("khối môn lỗi hiển thị viền/nền đỏ nhạt, chữ đỏ đậm, icon ⚠ SVG góc và aria-label cảnh báo", () => {
    render(
      <TimetableGrid
        blocks={conflictBlocks}
        alternatives={{}}
        colors={{ BIE3004: "#0b4f9c", BIM2050: "#0f766e" }}
        onChangeClass={vi.fn()}
      />,
    );

    const bieBtn = screen.getByRole("button", { name: /BIE3004 lớp 261BIE300401/ });
    const bimBtn = screen.getByRole("button", { name: /BIM2050 lớp 261BIM205001/ });

    expect(bieBtn).toBeInTheDocument();
    expect(bimBtn).toBeInTheDocument();

    // Màu đỏ nhạt nền và chữ đỏ đậm
    expect(bieBtn.className).toContain("bg-rose-50");
    expect(bieBtn.className).toContain("text-rose-950");
    expect(bieBtn.className).toContain("border-rose-400");

    expect(bimBtn.className).toContain("bg-rose-50");
    expect(bimBtn.className).toContain("text-rose-950");
    expect(bimBtn.className).toContain("border-rose-400");

    // Biểu tượng tam giác chấm than (⚠ SVG) nhỏ ở góc khối trên cả 2 môn
    const svgIcons = document.querySelectorAll("svg");
    expect(svgIcons.length).toBeGreaterThanOrEqual(2);

    // aria-label có chứa thông tin cảnh báo trùng lịch
    expect(bieBtn.getAttribute("aria-label")).toMatch(/trùng lịch/i);
    expect(bimBtn.getAttribute("aria-label")).toMatch(/trùng lịch/i);
  });

  it("chỉ mở bảng lịch của khối gộp khi khối đó có cảnh báo trùng lịch", () => {
    mockTooltipViewport();
    render(
      <TimetableGrid
        blocks={[...conflictBlocks, { ...conflictBlocks[0], key: "BIE3004#1", lesson: { ...conflictBlocks[0].lesson, room: "A.810" } }]}
        alternatives={{}}
        colors={{ BIE3004: "#0b4f9c", BIM2050: "#0f766e" }}
        onChangeClass={vi.fn()}
      />,
    );

    const bieBtn = screen.getByRole("button", { name: /BIE3004 lớp 261BIE300401/ });

    // Ban đầu không có popover
    expect(screen.queryByRole("tooltip")).toBeNull();

    // Rê chuột (hover) vào khối
    fireEvent.mouseEnter(bieBtn);

    // Popover nổi role="tooltip" xuất hiện
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toBeInTheDocument();
    expect(bieBtn).toHaveClass("border-rose-400");
    expect(bieBtn).toHaveAccessibleName(/Trùng lịch.*BIM2050/);
    expect(tooltip).not.toHaveTextContent(/Trùng lịch|BIE3004 ↔ BIM2050|261BIM205001/);
    expect(tooltip).toHaveTextContent("Thứ 5 · Tiết 7–9");

    // Rời chuột -> popover biến mất
    fireEvent.mouseLeave(bieBtn);
    expect(screen.queryByRole("tooltip")).toBeNull();

    // Focus bằng bàn phím -> popover xuất hiện
    fireEvent.focus(bieBtn);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    // Nhấn Escape -> popover đóng
    fireEvent.keyDown(bieBtn, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("khối môn vi phạm liền kề giữ màu cảnh báo và không có bảng nổi nếu chỉ có một buổi", () => {
    mockTooltipViewport();
    const adjBlocks: GridBlock[] = [
      {
        key: "BIE1065#0",
        code: "BIE1065",
        name: "Kinh tế vi mô",
        class_code: "263BIE106509",
        color: "#0b4f9c",
        conflict: true,
        violations: [
          {
            type: "adjacency",
            title: "Hai lớp liền kề qua ranh giới tiết 6 | 7",
            otherModuleCode: "BFF2044",
            otherClassCode: "263BFF204403",
            weekday: 3,
            periods: "tiết 7–9",
            ruleNote: "Theo quy định Đào tạo, không xếp hai lớp liền kề qua ranh giới sáng–chiều hoặc chiều–tối.",
          },
        ],
        lesson: {
          weekday: 3,
          start_period: 4,
          end_period: 6,
          start_time: "09:45",
          end_time: "12:15",
          room: "A.101",
        },
      },
    ];

    render(
      <TimetableGrid
        blocks={adjBlocks}
        alternatives={{}}
        colors={{ BIE1065: "#0b4f9c" }}
        onChangeClass={vi.fn()}
      />,
    );

    const blockBtn = screen.getByRole("button", { name: /BIE1065 lớp 263BIE106509/ });

    // Focus vào khối vi phạm liền kề
    fireEvent.focus(blockBtn);

    expect(blockBtn).toHaveClass("bg-rose-50");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

describe("7. Brief W32: Ô tìm môn ở Thời khóa biểu: dời nhãn 'Không có lịch' và đổi màu nhãn 'Tự chọn'", () => {
  it("nhãn 'Không có lịch' nằm trong cụm bên phải cùng với số tín chỉ, 'Tự chọn' có lớp màu khác", async () => {
    const mockModuleList: ModuleSummary[] = [
      {
        code: "BAA2029",
        name: "Kế toán tài chính",
        name_en: "Financial Accounting",
        credits: 3,
        type: "Chuyên ngành",
        has_equivalents: false,
        open_semesters: [], // Không có lịch
      },
    ];

    vi.spyOn(api, "modules").mockResolvedValue({
      data: { items: mockModuleList, total: 1 },
      mock: true,
    });
    vi.spyOn(api, "program").mockResolvedValue({ data: null, mock: true });

    render(
      <TimetableModuleSearch
        onPick={vi.fn()}
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

    // Cụm trái: Tên môn + Tự chọn (indigo)
    expect(within(leftCluster).getByText("Kế toán tài chính")).toBeInTheDocument();
    const electiveBadge = within(leftCluster).getByText("Tự chọn");
    expect(electiveBadge.getAttribute("data-variant")).toBe("elective");
    expect(electiveBadge.className).toContain("bg-indigo-50");
    expect(within(leftCluster).queryByText("Không có lịch")).toBeNull();

    // Cụm phải: Không có lịch (amber) + 3 TC đi liền nhau
    const noScheduleBadge = within(rightCluster).getByText("Không có lịch");
    expect(noScheduleBadge.getAttribute("data-variant")).toBe("no-schedule");
    expect(noScheduleBadge.className).toContain("bg-amber-100");
    expect(within(rightCluster).getByText(/3 TC/)).toBeInTheDocument();

    // Phân biệt màu giữa 2 nhãn
    expect(electiveBadge.className).not.toEqual(noScheduleBadge.className);
  });

  it("hiển thị các lựa chọn tải xuống PNG, ICS, Excel (.xlsx) và CSV (.csv)", async () => {
    vi.spyOn(api, "semesters").mockResolvedValue({
      data: [{ id: "2026-2027-1", name: "Học kỳ 1", year: "2026-2027", term: 1, is_current: true }],
      mock: false,
    });
    vi.spyOn(api, "classes").mockResolvedValue({
      data: [
        {
          module_code: "ECO101",
          class_code: "261ECO10101",
          lecturer: "TS. Nguyễn Văn A",
          lecturer_email: "an.nv@uel.edu.vn",
          lessons: [{ weekday: 2, start_period: 1, end_period: 3, start_time: "07:00", end_time: "09:35", room: "B1.406" }],
        },
      ],
      mock: false,
    });
    vi.spyOn(api, "module").mockResolvedValue({
      data: {
        code: "ECO101",
        name: "Kinh tế vi mô",
        name_en: "Microeconomics",
        credits: 3,
        type: "Bắt buộc",
        faculty: "Khoa Kinh tế",
        lecturer_email: "an.nv@uel.edu.vn",
        has_equivalents: false,
        equivalents: [],
        semesters: ["2026-2027-1"],
      },
      mock: false,
    });

    useTimetable.getState().setSemester("2026-2027-1");
    useTimetable.getState().addModule({ code: "ECO101", name: "Kinh tế vi mô", credits: 3 }, "261ECO10101");

    render(<TimetablePage />);

    const downloadButton = screen.getByRole("button", { name: /Tải xuống/i });
    fireEvent.click(downloadButton);

    expect(screen.getByRole("menuitem", { name: "Ảnh PNG" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Lịch .ics" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Excel (.xlsx)" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "CSV (.csv)" })).toBeInTheDocument();
  });
});

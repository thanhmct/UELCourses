import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AppDialog } from "@/components/AppDialog";
import { api } from "@/lib/api";
import { useLang } from "@/i18n";
import { periodEndTime, periodStartTime } from "@/lib/periods";
import { useTimetable } from "@/lib/store";
import TimetablePage from "../page";
import OptimizeTimetablePage from "../optimize/page";
import TimetableLayout from "../layout";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/navigation")>(),
  useRouter: () => ({ push }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  push.mockClear();
  useLang.setState({ lang: "vi" });
  useTimetable.setState(useTimetable.getInitialState());
});

it.each([
  {
    lang: "vi" as const,
    shortcutName: "Tối ưu Phương án 2",
    shortcutText: "Tối ưu phương án này",
    tabName: "Tối ưu lịch học",
    draftBar: "Phương án hiện có",
    defaultDraft: "Phương án 1",
    status: "Đang tối ưu: Phương án 2",
  },
  {
    lang: "en" as const,
    shortcutName: "Optimize Phương án 2",
    shortcutText: "Optimize this draft",
    tabName: "Optimizer",
    draftBar: "Available drafts",
    defaultDraft: "Draft 1",
    status: "Optimizing: Phương án 2",
  },
])("opens optimization from the active draft and identifies that draft in $lang", ({ lang, shortcutName, shortcutText, tabName, draftBar, defaultDraft, status }) => {
  const semester = "2026-2027-1";
  useLang.setState({ lang });
  vi.spyOn(api, "semesters").mockResolvedValue({ data: [], mock: false });
  const timetable = useTimetable.getState();
  timetable.setSemester(semester);
  timetable.createDraft(semester, "Phương án 2");

  const { rerender } = render(<TimetablePage />, { wrapper: TimetableLayout });

  const shortcut = screen.getByRole("link", { name: shortcutName });
  expect(shortcut).toHaveTextContent(shortcutText);
  expect(shortcut).toHaveAttribute("href", "/timetable/optimize");
  expect(screen.queryByRole("tab", { name: tabName })).toBeNull();
  rerender(<OptimizeTimetablePage />);
  expect(screen.queryByRole("heading", { name: tabName, level: 1 })).not.toBeInTheDocument();
  const drafts = within(screen.getByRole("group", { name: draftBar }));
  expect(drafts.queryByText(draftBar)).not.toBeInTheDocument();
  expect(drafts.getByRole("button", { name: defaultDraft, pressed: false })).toBeInTheDocument();
  expect(drafts.getByRole("button", { name: "Phương án 2", pressed: true })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent(status);
});

it("switches between saved drafts in the selected term and clears the old optimization", async () => {
  const semester = "2026-2027-1";
  const nextSemester = "2026-2027-2";
  vi.spyOn(api, "semesters").mockResolvedValue({
    data: [
      { id: semester, name: "Học kỳ 1", year: "2026-2027", term: 1, is_current: true,
        teaching_start: "2026-09-07", teaching_end: "2026-09-27" },
      { id: nextSemester, name: "Học kỳ 2", year: "2026-2027", term: 2, is_current: false },
    ],
    mock: false,
  });
  vi.spyOn(api, "classes").mockImplementation(async (code) => ({
    data: [1, 2].map((n) => ({
      module_code: code, class_code: `${code}-${n}`,
      lessons: [{ weekday: n + 1, start_period: 2, end_period: 3, start_time: periodStartTime(2), end_time: periodEndTime(3) }],
    })),
    mock: false,
  }));

  const timetable = useTimetable.getState();
  timetable.setSemester(semester);
  timetable.addModule({ code: "BMA2045", name: "Quản trị", credits: 2 }, "BMA2045-1");
  timetable.createDraft(semester, "Phương án tối ưu 2", true);
  timetable.setClass("BMA2045", "BMA2045-2");
  timetable.switchDraft(semester, "Phương án 1");
  timetable.createDraft(nextSemester, "Lịch kỳ sau");

  render(<OptimizeTimetablePage />, { wrapper: TimetableLayout });
  const drafts = within(screen.getByRole("group", { name: "Phương án hiện có" }));
  const run = screen.getByRole("button", { name: "Tìm lịch phù hợp" });
  const keepClass = "Giữ nguyên lớp hiện tại cho BMA2045";
  await vi.waitFor(() => expect(run).toBeEnabled());
  expect(drafts.queryByRole("button", { name: "Lịch kỳ sau" })).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: keepClass }));
  fireEvent.click(run);
  expect(await screen.findByRole("heading", { name: "Lịch gợi ý" })).toBeInTheDocument();

  const optimized = drafts.getByRole("button", { name: "Phương án tối ưu 2", pressed: false });
  optimized.focus();
  fireEvent.click(optimized);
  expect(optimized).toHaveFocus();
  expect(optimized).toHaveAttribute("aria-pressed", "true");
  expect(useTimetable.getState().activeDrafts[semester]).toBe("Phương án tối ưu 2");
  expect(screen.getByText("BMA2045-2")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: keepClass })).not.toBeChecked();
  expect(screen.queryByRole("heading", { name: "Lịch gợi ý" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Học kỳ sau" }));
  expect(drafts.queryByRole("button", { name: "Phương án tối ưu 2" })).toBeNull();
  expect(drafts.getByRole("button", { name: "Lịch kỳ sau", pressed: true })).toBeInTheDocument();
  expect(screen.getByText("Thêm học phần trong tab Thời khóa biểu để bắt đầu tối ưu.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Học kỳ trước" }));
  expect(drafts.getByRole("button", { name: "Phương án tối ưu 2", pressed: true })).toBeInTheDocument();
});

it("discloses the single relaxation, saves an independent draft and returns to the timetable", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-14T10:00:00Z"));
  const semester = "2026-2027-1";
  const original = "Phương án 1";
  const optimized = "Phương án tối ưu";
  vi.spyOn(api, "semesters").mockResolvedValue({
    data: [{ id: semester, name: "Học kỳ 1", year: "2026-2027", term: 1, is_current: true,
      teaching_start: "2026-09-07", teaching_end: "2026-09-27" }],
    mock: false,
  });
  vi.spyOn(api, "classes").mockImplementation(async (code) => ({
    data: (code === "BFB4007" ? [2, 3] : [2]).map((weekday, index) => ({
      module_code: code,
      class_code: `${code}-${index + 1}`,
      lessons: [{ weekday, start_period: 2, end_period: 3, start_time: periodStartTime(2), end_time: periodEndTime(3) }],
    })),
    mock: false,
  }));
  const timetable = useTimetable.getState();
  timetable.setSemester(semester);
  for (const code of ["BMA2045", "BFB4007", "BIM2050"]) {
    timetable.addModule({ code, name: code, credits: 2 }, `${code}-1`);
  }

  const { rerender } = render(<><OptimizeTimetablePage /><AppDialog /></>, { wrapper: TimetableLayout });
  fireEvent.click(screen.getByRole("checkbox", { name: "Giữ nguyên lớp hiện tại cho BMA2045" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Dự thính BIM2050" }));
  fireEvent.change(screen.getByLabelText("Bắt đầu sớm nhất"), { target: { value: "09:00" } });
  const run = screen.getByRole("button", { name: "Tìm lịch phù hợp" });
  await vi.waitFor(() => expect(run).toBeEnabled());
  fireEvent.click(run);
  expect(await screen.findByText("BFB4007-1 → BFB4007-2")).toBeInTheDocument();
  expect(screen.getByText(/Giờ bắt đầu sớm hơn tối đa 70 phút/)).toBeInTheDocument();
  expect(useTimetable.getState().activeDrafts[semester]).toBe(original);
  fireEvent.click(screen.getByRole("button", { name: "Lưu và xem phương án" }));
  expect(push).toHaveBeenCalledWith("/timetable");
  expect(useTimetable.getState().activeDrafts[semester]).toBe(optimized);
  expect(useTimetable.getState().bySemester[semester]).toEqual([
    expect.objectContaining({ code: "BMA2045", class_code: "BMA2045-1" }),
    expect.objectContaining({ code: "BFB4007", class_code: "BFB4007-2" }),
    expect.objectContaining({ code: "BIM2050", class_code: "BIM2050-1", hidden: true }),
  ]);
  expect(useTimetable.getState().drafts[semester][original][1].class_code).toBe("BFB4007-1");
  expect(useTimetable.getState().drafts[semester][original][2].hidden).toBe(false);

  rerender(<><TimetablePage /><AppDialog /></>);
  expect(screen.getByRole("button", { name: /^Tất cả$/ })).toHaveAttribute("aria-pressed", "true");
  const deleteDraft = screen.getByRole("button", { name: "Xóa phương án" });
  fireEvent.click(deleteDraft);
  const dialog = screen.getByRole("dialog", { name: "Xóa phương án?" });
  expect(dialog).toHaveClass("w-fit");
  expect(within(dialog).getAllByRole("button").map((button) => button.textContent)).toEqual(["Hủy", "Xóa"]);
  expect(within(dialog).getByRole("button", { name: "Hủy" })).toHaveFocus();
  fireEvent.click(within(dialog).getByRole("button", { name: "Hủy" }));
  expect(useTimetable.getState().activeDrafts[semester]).toBe(optimized);
  fireEvent.click(deleteDraft);
  fireEvent.click(within(screen.getByRole("dialog", { name: "Xóa phương án?" })).getByRole("button", { name: "Xóa" }));
  await vi.waitFor(() => expect(useTimetable.getState().drafts[semester]).not.toHaveProperty(optimized));
  expect(useTimetable.getState().activeDrafts[semester]).toBe(original);
});

it.each([
  [new Error("API unavailable"), "Chưa tải được dữ liệu lớp học phần."],
  [Object.assign(new Error("Network error"), { status: 0 }), "Chờ tí UELer, tui quay lại giờ!!!"],
])("lets the user retry loading class schedules after %s", async (failure, message) => {
  const semester = "2026-2027-1";
  vi.spyOn(api, "semesters").mockResolvedValue({ data: [], mock: false });
  const classes = vi.spyOn(api, "classes").mockRejectedValueOnce(failure)
    .mockResolvedValue({ data: [], mock: false });
  useTimetable.getState().setSemester(semester);
  useTimetable.getState().addModule({ code: "BMA2045", name: "Quản trị", credits: 2 });

  render(<OptimizeTimetablePage />, { wrapper: TimetableLayout });
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  const run = screen.getByRole("button", { name: "Tìm lịch phù hợp" });
  expect(run).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Tải lại dữ liệu" }));
  await vi.waitFor(() => expect(run).toBeEnabled());
  expect(classes).toHaveBeenCalledTimes(2);
  fireEvent.click(run);
  expect(screen.getByText("BMA2045 chưa có lớp với lịch học trong học kỳ này.")).toBeInTheDocument();
});

it("keeps audit and keep-class checkboxes pinned to the far right for long course names", async () => {
  const semester = "2026-2027-1";
  vi.spyOn(api, "semesters").mockResolvedValue({ data: [], mock: false });
  vi.spyOn(api, "classes").mockResolvedValue({ data: [], mock: false });
  const timetable = useTimetable.getState();
  timetable.setSemester(semester);
  timetable.addModule(
    { code: "BFB4007", name: "Công nghệ tiền điện tử và hệ thống thanh toán điện tử", credits: 3 },
    "261BFB400701",
  );

  render(<OptimizeTimetablePage />, { wrapper: TimetableLayout });
  const courseList = screen.getByRole("group", { name: "Học phần trong phương án" });
  const row = within(courseList).getByRole("listitem");
  const info = within(row).getByText("BFB4007").closest("div");
  const controls = within(row).getByRole("checkbox", { name: "Dự thính BFB4007" }).closest("div");

  expect(row).not.toHaveClass("flex-wrap");
  expect(info).toHaveClass("min-w-0", "flex-1");
  expect(controls).toHaveClass("ml-auto", "shrink-0");
});

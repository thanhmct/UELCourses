import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ModuleDetailPage from "../page";
import ModulesPage from "../../page";
import { api } from "@/lib/api";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { useLang } from "@/i18n";
import { useSettings } from "@/lib/store";
import type { ModuleDetail, ModuleSummary, Paged, Semester } from "@/lib/types";

let currentCode = "BKB4060";

vi.mock("next/navigation", () => ({
  useParams: () => ({ code: currentCode }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => `/modules/${currentCode}`,
  useSearchParams: () => new URLSearchParams(),
}));

const mockBkb4060: ModuleDetail = {
  code: "BKB4060",
  name: "Luật sở hữu trí tuệ",
  name_en: "Intellectual Property Law",
  credits: 3,
  type: "Bắt buộc",
  faculty: "Khoa Luật",
  faculty_en: "Faculty of Law",
  description: "Mô tả luật sở hữu trí tuệ tiếng Việt.",
  description_en: "Intellectual property law description in English.",
  outline_url: "https://drive.google.com/file/d/1DUmavTFNn-Hh3VC2TDY2pDo18VKnaPMF/view?usp=sharing",
  outline_url_en: "https://drive.google.com/file/d/1aJ0fWojSP3_np7ZgAouLXMJnvm6unRPR/view?usp=sharing",
  outline_links: [
    { kind: "Link đề cương hiện tại (chuẩn)", url: "https://drive.google.com/file/d/1DUmavTFNn-Hh3VC2TDY2pDo18VKnaPMF/view?usp=sharing" },
    { kind: "Link đề cương hiện tại (E)", url: "https://drive.google.com/file/d/1aJ0fWojSP3_np7ZgAouLXMJnvm6unRPR/view?usp=sharing" },
  ],
  has_equivalents: false,
  equivalents: [],
  semesters: ["2026-2027-1"],
  has_outline: true,
};

const mockSingleVi: ModuleDetail = {
  code: "LAW1001",
  name: "Luật đại cương",
  name_en: "General Law",
  credits: 2,
  type: "Bắt buộc",
  faculty: "Khoa Luật",
  outline_url: "https://drive.google.com/file/d/law_vi_only/view",
  outline_url_en: null,
  outline_links: [{ kind: "Link đề cương hiện tại (chuẩn)", url: "https://drive.google.com/file/d/law_vi_only/view" }],
  has_equivalents: false,
  equivalents: [],
  semesters: ["2026-2027-1"],
};

const mockSingleEn: ModuleDetail = {
  code: "BUS2001E",
  name: "Business Ethics",
  name_en: "Business Ethics",
  credits: 3,
  type: "Tự chọn",
  faculty: "Khoa Quản trị kinh doanh",
  outline_url: null,
  outline_url_en: "https://drive.google.com/file/d/bus_en_only/view",
  outline_links: [{ kind: "Link đề cương hiện tại (E)", url: "https://drive.google.com/file/d/bus_en_only/view" }],
  has_equivalents: false,
  equivalents: [],
  semesters: ["2026-2027-1"],
};

const mockNoOutline: ModuleDetail = {
  code: "NOLINK99",
  name: "Môn không có đề cương",
  credits: 3,
  type: "Tự chọn",
  faculty: "Khoa Kinh tế",
  outline_url: null,
  outline_url_en: null,
  outline_links: [],
  has_equivalents: false,
  equivalents: [],
  semesters: ["2026-2027-1"],
};

const mockSemestersData: Semester[] = [
  { id: "2026-2027-1", name: "HK1 2026–2027", year: "2026-2027", term: 1, is_current: true },
  { id: "2026-2027-2", name: "HK2 2026–2027", year: "2026-2027", term: 2, is_current: false },
];

describe("Brief B7: Hiển thị liên kết PDF đề cương trên trang chi tiết và danh sách theo ngôn ngữ", () => {
  beforeEach(() => {
    currentCode = "BKB4060";
    act(() => {
      useLang.getState().setLang("vi");
      useSettings.getState().setProgramProfile("", "");
    });

    vi.spyOn(api, "semesters").mockResolvedValue({ data: mockSemestersData, mock: true });
    vi.spyOn(api, "programs").mockResolvedValue({ data: [], mock: true });
    vi.spyOn(api, "classes").mockResolvedValue({ data: [], mock: true });
    vi.spyOn(api, "outline").mockResolvedValue(null);
    vi.spyOn(api, "moduleTree").mockResolvedValue({ data: null, mock: true });
  });

  afterEach(() => {
    cleanup();
    act(() => {
      useLang.getState().setLang("vi");
      useSettings.getState().setProgramProfile("", "");
    });
    vi.restoreAllMocks();
  });

  it.each([
    { lang: "vi", add: "Thêm vào thời khóa biểu", warning: "Không có lớp mở ở học kỳ này", type: "Lý thuyết" },
    { lang: "en", add: "Add to timetable", warning: "No classes are open this semester", type: "Theory" },
  ] as const)("shows the timetable warning and module type in $lang", async ({ lang, add, warning, type }) => {
    useLang.getState().setLang(lang);
    vi.spyOn(api, "module").mockResolvedValue({
      data: {
        ...mockBkb4060,
        type: "Lý thuyết",
        open_semesters: [{ semester: "2026-2027-3", classes: 1 }],
      },
      mock: true,
    });

    render(<ModuleDetailPage />);

    const button = await screen.findByRole("button", { name: new RegExp(add) });
    expect(button).toBeEnabled();
    expect(button).toHaveAccessibleDescription(warning);
    expect(screen.getByText(warning)).toBeVisible();
    expect(screen.getByText(type, { selector: ".chip" })).toBeVisible();
  });

  it("does not warn when classes are open in the timetable term", async () => {
    vi.spyOn(api, "module").mockResolvedValue({
      data: { ...mockBkb4060, open_semesters: [{ semester: "2026-2027-2", classes: 1 }] },
      mock: true,
    });

    render(<ModuleDetailPage />);

    const button = await screen.findByRole("button", { name: /Thêm vào thời khóa biểu/ });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAccessibleDescription();
    expect(screen.queryByText(/Không có lớp mở ở học kỳ này/)).not.toBeInTheDocument();
  });

  it("places the syllabus in the course header without a Required/Elective label", async () => {
    useLang.getState().setLang("en");
    useSettings.getState().setProgramProfile("K25414", "");
    vi.spyOn(api, "module").mockResolvedValue({ data: mockBkb4060, mock: true });
    const { code, name, credits } = mockBkb4060;
    vi.spyOn(api, "program").mockResolvedValue({
      data: {
        program: { program_id: "K25414", name: "Luật", cohort: "K25", total_credits: 120 },
        blocks: [{ name: "Chuyên ngành", modules: [{ code, name, credits, required: true }] }],
      },
      mock: true,
    });
    vi.spyOn(api, "electiveGroups").mockResolvedValue({ data: [], mock: true });
    render(<ModuleDetailPage />);

    const syllabus = await screen.findByRole("group", { name: "Syllabus (PDF)" });
    expect(screen.queryByText("Required")).toBeNull();
    expect(syllabus.closest("header")).toContainElement(screen.getByRole("heading", { name: /BKB4060/ }));
  });

  it("updates class capacity, remaining seats, and full sections when switching language", async () => {
    vi.spyOn(api, "module").mockResolvedValue({ data: mockBkb4060, mock: true });
    vi.mocked(api.classes).mockResolvedValue({
      data: [
        { module_code: currentCode, class_code: "01", lessons: [], quota_max: 40 },
        { module_code: currentCode, class_code: "02", lessons: [], quota: 41, registered: 29 },
        { module_code: currentCode, class_code: "03", lessons: [], quota: 40, registered: 40 },
      ],
      mock: true,
    });
    render(<ModuleDetailPage />);

    await screen.findByRole("cell", { name: "Tối đa 40" });
    expect(screen.getByRole("cell", { name: "29/41 · còn 12 chỗ" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "40/40 · Hết chỗ" })).toBeVisible();

    act(() => useLang.getState().setLang("en"));

    expect(screen.getByRole("cell", { name: "Maximum 40" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "29/41 · 12 left" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "40/40 · Full" })).toBeVisible();
  });

  it("mở bản nháp báo lỗi học phần với đúng khoa và thông tin sinh viên", async () => {
    vi.spyOn(api, "module").mockResolvedValue({ data: mockBkb4060, mock: true });
    let draft: URL | undefined;
    const openDraft = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      draft = new URL(this.href);
    });
    render(<><ModuleDetailPage /><FeedbackWidget /></>);

    const report = await screen.findByRole("button", { name: "Báo lỗi" });
    expect(report.closest("header")).toContainElement(report);
    expect(report.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(report);
    const form = within(screen.getByRole("dialog", { name: "Báo lỗi học phần BKB4060" }));
    const faculty = form.getByLabelText("Khoa/bộ môn phụ trách học phần");
    const email = form.getByLabelText("Email trường");
    const submit = form.getByRole("button", { name: "Mở bản nháp email" });
    expect(faculty).toHaveValue("khoaluat@uel.edu.vn");
    expect(form.getByText(/khoaluat@uel\.edu\.vn/)).toBeInTheDocument();
    expect(form.queryByRole("radiogroup")).not.toBeInTheDocument();
    fireEvent.click(submit);
    expect(openDraft).not.toHaveBeenCalled();

    fireEvent.change(form.getByLabelText("Họ và tên"), { target: { value: "Sinh viên Kiểm thử" } });
    fireEvent.change(form.getByLabelText("Mã số sinh viên (không bắt buộc)"), { target: { value: "K000000000" } });
    fireEvent.change(faculty, { target: { value: "khoaluatkinhte@uel.edu.vn" } });
    fireEvent.change(form.getByLabelText("Mô tả chi tiết vấn đề với học phần"), { target: { value: "Lịch học & số tín chỉ chưa khớp.\nVui lòng đối chiếu." } });
    fireEvent.change(email, { target: { value: "student@example.com" } });
    fireEvent.click(submit);
    expect(email).toBeInvalid();
    expect(openDraft).not.toHaveBeenCalled();

    fireEvent.change(email, { target: { value: "test@st.uel.edu.vn" } });
    fireEvent.click(submit);
    expect(openDraft).toHaveBeenCalledTimes(1);
    expect(draft?.protocol).toBe("mailto:");
    expect(draft?.pathname).toBe("khoaluatkinhte@uel.edu.vn");
    expect(draft?.searchParams.get("subject")).toBe("Báo lỗi học phần BKB4060");
    expect(draft?.searchParams.get("body")).toBe([
      "Học phần: BKB4060 — Luật sở hữu trí tuệ",
      "Họ và tên: Sinh viên Kiểm thử",
      "Mã số sinh viên: K000000000",
      "Khoa/bộ môn: Khoa Luật Kinh tế",
      "Email trường: test@st.uel.edu.vn",
      "",
      "Mô tả vấn đề:",
      "Lịch học & số tín chỉ chưa khớp.",
      "Vui lòng đối chiếu.",
    ].join("\r\n"));
  });

  it("hiện kênh tiếp nhận chung khi thiếu khoa và cho phép chuyển sang báo lỗi trang web", async () => {
    currentCode = mockNoOutline.code;
    vi.spyOn(api, "module").mockResolvedValue({ data: { ...mockNoOutline, faculty: "Bộ môn ngoài danh sách" }, mock: true });
    render(<><ModuleDetailPage /><FeedbackWidget /></>);

    fireEvent.click(await screen.findByRole("button", { name: "Báo lỗi" }));
    const dialog = within(screen.getByRole("dialog", { name: `Báo lỗi học phần ${currentCode}` }));
    const faculty = dialog.getByLabelText("Khoa/bộ môn phụ trách học phần");
    expect(faculty).toHaveValue("");
    fireEvent.change(faculty, { target: { value: "toicoykien@uel.edu.vn" } });
    expect(dialog.getByText(/toicoykien@uel\.edu\.vn/)).toBeInTheDocument();

    fireEvent.click(dialog.getByRole("button", { name: "Báo lỗi trong UELPATH" }));
    const siteBug = within(screen.getByRole("dialog", { name: "Báo lỗi" }));
    expect(siteBug.getByLabelText("Loại góp ý")).toHaveValue("bug");
    expect(siteBug.queryByLabelText("Mã số sinh viên (không bắt buộc)")).not.toBeInTheDocument();
  });

  it("1. Trang chi tiết có cả 2 link (BKB4060) hiển thị cả 2 nút tiếng Việt và English ở giao diện tiếng Việt", async () => {
    vi.spyOn(api, "module").mockResolvedValue({ data: mockBkb4060, mock: true });

    render(<ModuleDetailPage />);

    const viLink = await screen.findByRole("link", { name: /Tiếng Việt/ });
    const enLink = await screen.findByRole("link", { name: /English/ });

    expect(viLink).toBeInTheDocument();
    expect(enLink).toBeInTheDocument();
    expect(viLink).toHaveAttribute("href", mockBkb4060.outline_url!);
    expect(enLink).toHaveAttribute("href", mockBkb4060.outline_url_en!);
    expect(viLink).toHaveAttribute("target", "_blank");
    expect(enLink).toHaveAttribute("target", "_blank");
  });

  it("2. Trang chi tiết có cả 2 link (BKB4060) hiển thị cả 2 nút ở giao diện tiếng Anh", async () => {
    act(() => {
      useLang.getState().setLang("en");
    });
    vi.spyOn(api, "module").mockResolvedValue({ data: mockBkb4060, mock: true });

    render(<ModuleDetailPage />);

    const viLink = await screen.findByRole("link", { name: /Vietnamese/ });
    const enLink = await screen.findByRole("link", { name: /English/ });

    expect(viLink).toBeInTheDocument();
    expect(enLink).toBeInTheDocument();
    expect(viLink).toHaveAttribute("href", mockBkb4060.outline_url!);
    expect(enLink).toHaveAttribute("href", mockBkb4060.outline_url_en!);

    const group = screen.getByRole("group", { name: /Syllabus \(PDF\)/ });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Intellectual Property Law/ })).toBeInTheDocument();
    expect(screen.queryByText(mockBkb4060.name)).not.toBeInTheDocument();
  });

  it("3. Trang chi tiết chỉ có link tiếng Việt hiển thị nút đơn theo ngôn ngữ", async () => {
    currentCode = "LAW1001";
    vi.spyOn(api, "module").mockResolvedValue({ data: mockSingleVi, mock: true });

    // Giao diện Tiếng Việt
    const { unmount } = render(<ModuleDetailPage />);
    const btnVi = await screen.findByRole("link", { name: /Đề cương \(PDF\)/ });
    expect(btnVi).toBeInTheDocument();
    expect(btnVi).toHaveAttribute("href", mockSingleVi.outline_url!);
    expect(screen.queryByRole("link", { name: /Tiếng Việt ↗/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /English ↗/ })).toBeNull();
    unmount();

    // Giao diện Tiếng Anh
    act(() => {
      useLang.getState().setLang("en");
    });
    render(<ModuleDetailPage />);
    const btnEn = await screen.findByRole("link", { name: /Syllabus \(PDF\)/ });
    expect(btnEn).toBeInTheDocument();
    expect(btnEn).toHaveAttribute("href", mockSingleVi.outline_url!);
  });

  it("4. Trang chi tiết chỉ có link tiếng Anh hiển thị nút đơn dùng link tiếng Anh", async () => {
    currentCode = "BUS2001E";
    vi.spyOn(api, "module").mockResolvedValue({ data: mockSingleEn, mock: true });

    // Giao diện Tiếng Việt
    const { unmount } = render(<ModuleDetailPage />);
    const btnVi = await screen.findByRole("link", { name: /Đề cương \(PDF\)/ });
    expect(btnVi).toBeInTheDocument();
    expect(btnVi).toHaveAttribute("href", mockSingleEn.outline_url_en!);
    unmount();

    // Giao diện Tiếng Anh
    act(() => {
      useLang.getState().setLang("en");
    });
    render(<ModuleDetailPage />);
    const btnEn = await screen.findByRole("link", { name: /Syllabus \(PDF\)/ });
    expect(btnEn).toBeInTheDocument();
    expect(btnEn).toHaveAttribute("href", mockSingleEn.outline_url_en!);
  });

  it("5. Trang chi tiết không có link đề cương thì không hiển thị nút liên kết nào", async () => {
    currentCode = "NOLINK99";
    vi.spyOn(api, "module").mockResolvedValue({ data: mockNoOutline, mock: true });

    render(<ModuleDetailPage />);

    // Đợi tải xong
    await screen.findByText("NOLINK99");

    expect(screen.queryByRole("link", { name: /Đề cương \(PDF\)/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Syllabus \(PDF\)/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Tiếng Việt/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /English/ })).toBeNull();
  });

  it("6. Trang danh sách học phần (/modules) chọn outline_url hoặc outline_url_en theo ngôn ngữ", async () => {
    const listResult: Paged<ModuleSummary> = {
      items: [mockBkb4060, mockNoOutline],
      total: 2,
      page: 1,
      size: 20,
    };

    vi.spyOn(api, "modules").mockResolvedValue({ data: listResult, mock: true });
    vi.spyOn(api, "moduleFacets").mockResolvedValue({
      data: {
        total: 2,
        language: [],
        talent: [],
        credits: [],
        faculty: [],
        department: [],
        type: [],
        semester: [],
        has_outline: [],
      },
      mock: true,
    });

    // Khi ở giao diện Tiếng Việt: ưu tiên link outline_url
    act(() => {
      useLang.getState().setLang("vi");
    });
    const { unmount } = render(<ModulesPage />);

    const badgeVi = await screen.findByRole("link", { name: /Đề cương \(PDF\)/ });
    expect(badgeVi).toHaveAttribute("href", mockBkb4060.outline_url!);
    unmount();

    // Khi ở giao diện Tiếng Anh: ưu tiên link outline_url_en
    act(() => {
      useLang.getState().setLang("en");
    });
    render(<ModulesPage />);

    const badgeEn = await screen.findByRole("link", { name: /Syllabus \(PDF\)/ });
    expect(badgeEn).toHaveAttribute("href", mockBkb4060.outline_url_en!);
  });

  it("7. Trang chi tiết học phần (/modules/[code]) có nút BackButton quay lại danh sách học phần", async () => {
    vi.spyOn(api, "module").mockResolvedValue({ data: mockBkb4060, mock: true });

    // Giao diện Tiếng Việt
    const { unmount } = render(<ModuleDetailPage />);
    const backBtnVi = await screen.findByRole("link", { name: "Quay lại danh sách học phần" });
    expect(backBtnVi).toBeInTheDocument();
    expect(backBtnVi).toHaveAttribute("href", "/modules");
    expect(backBtnVi).toHaveAttribute("title", "Quay lại danh sách học phần");
    expect(screen.queryByText(/← Học phần/)).toBeNull();
    unmount();

    // Giao diện Tiếng Anh
    act(() => {
      useLang.getState().setLang("en");
    });
    render(<ModuleDetailPage />);
    const backBtnEn = await screen.findByRole("link", { name: "Back to modules list" });
    expect(backBtnEn).toBeInTheDocument();
    expect(backBtnEn).toHaveAttribute("href", "/modules");
    expect(backBtnEn).toHaveAttribute("title", "Back to modules list");
    expect(screen.queryByText(/← Modules/)).toBeNull();
  });
});

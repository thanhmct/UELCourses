import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CourseReviewsPage from "../page";
import { api } from "@/lib/api";
import { useTimetable } from "@/lib/store";
import { useLang } from "@/i18n";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/feedback/courses",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    semesters: vi.fn(),
    postModuleComment: vi.fn(),
    moduleComments: vi.fn(),
    authMe: vi.fn(),
    authProviders: vi.fn(),
    reviewGuidelines: vi.fn(),
    moduleReviews: vi.fn(),
  },
  authLoginUrl: (provider: string) => `http://localhost:8000/api/auth/${provider}/login`,
  FACEBOOK_LOGIN_ENABLED: false,
  API_URL: "http://localhost:8000",
}));

vi.mock("@/lib/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics")>()),
  getAnonId: () => "anon-test",
}));

const SEMESTERS = [
  { id: "2025-2026-2", name: "Học kỳ 2 2025-2026", year: "2025-2026", term: 2, is_current: false },
  { id: "2026-2027-1", name: "Học kỳ 1 2026-2027", year: "2026-2027", term: 1, is_current: true },
];

function seedTimetable(bySemester: Record<string, { code: string }[]>) {
  useTimetable.setState({
    bySemester: Object.fromEntries(
      Object.entries(bySemester).map(([sem, rows]) => [
        sem,
        rows.map((r) => ({ code: r.code, class_code: null, color: 0, hidden: false })),
      ]),
    ),
    drafts: {},
    activeDrafts: {},
    info: {
      IS1128: { code: "IS1128", name: "IT, Management and Organisation", credits: 3 },
      IS4228: { code: "IS4228", name: "Information Technologies in Financial Services", credits: 3 },
      FIN3702A: { code: "FIN3702A", name: "Investment Analysis and Portfolio Management", credits: 3 },
    },
  });
}

const DEFAULT_TIMETABLE = {
  "2025-2026-2": [{ code: "FIN3702A" }],
  "2026-2027-1": [{ code: "IS1128" }, { code: "IS4228" }, { code: "IS1128" }],
};

async function openReview(code: string) {
  const codeEl = await screen.findByText(code);
  const card = codeEl.closest("li") as HTMLElement;
  fireEvent.click(within(card).getByRole("button", { name: "Góp ý" }));
}

async function writeReview(code: string) {
  await openReview(code);
  fireEvent.click(await screen.findByRole("button", { name: "5 sao" }));
  fireEvent.change(screen.getByLabelText("Nội dung bình luận"), {
    target: { value: "Giảng viên dạy rõ ràng, bài tập vừa sức." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Gửi bình luận" }));
}

describe("CourseReviewsPage", () => {
  beforeEach(() => {
    localStorage.clear();
    useLang.setState({ lang: "vi" });
    seedTimetable(DEFAULT_TIMETABLE);
    vi.mocked(api.semesters).mockResolvedValue({ data: SEMESTERS, mock: false } as never);
    vi.mocked(api.postModuleComment).mockReset();
    vi.mocked(api.moduleComments).mockResolvedValue({
      data: { items: [], total: 0, page: 1, size: 50, average_rating: null },
      mock: false,
    } as never);
    vi.mocked(api.authMe).mockResolvedValue({ user: null } as never);
    vi.mocked(api.authProviders).mockResolvedValue({ google: { ready: true }, facebook: { ready: true } } as never);
    vi.mocked(api.reviewGuidelines).mockResolvedValue({ items: ["Hãy góp ý trung thực."] } as never);
    vi.mocked(api.moduleReviews).mockResolvedValue({
      items: [],
      summary: { count: 0, avg_rating: null, avg_difficulty: null, avg_workload: null },
      page: 1,
      size: 20,
      total: 0,
    } as never);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("hiển thị học kỳ trước và học kỳ này, mỗi môn một lần, lấy từ thời khóa biểu", async () => {
    render(<CourseReviewsPage />);

    expect(await screen.findByRole("heading", { name: "Học kỳ 2 2025-2026" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Học kỳ 1 2026-2027" })).toBeInTheDocument();
    expect(screen.getByText("FIN3702A")).toBeInTheDocument();
    expect(screen.getByText("IS4228")).toBeInTheDocument();
    expect(screen.getAllByText("IS1128")).toHaveLength(1);
  });

  it("bấm vào môn: hiện đúng UI đánh giá môn học (như tab chi tiết học phần)", async () => {
    render(<CourseReviewsPage />);
    await openReview("IS4228");

    expect(
      await screen.findByText("Bạn đang đánh giá môn IS4228 · Information Technologies in Financial Services"),
    ).toBeInTheDocument();
    // Khối bình luận (ModuleReviews) và khối đánh giá có đăng nhập (LecturerReviewPanel) đều hiển thị
    expect(screen.getByLabelText("Nội dung bình luận")).toBeInTheDocument();
    expect(screen.getByText("Nguyên tắc cộng đồng")).toBeInTheDocument();
    // Chưa đăng nhập: hiện nút Google; nút Facebook đang tạm tắt (FACEBOOK_LOGIN_ENABLED = false)
    expect(screen.getByRole("link", { name: "Đăng nhập bằng Google" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Đăng nhập bằng Facebook" })).not.toBeInTheDocument();
  });

  it("bắt buộc nội dung ít nhất 5 ký tự trước khi gửi", async () => {
    render(<CourseReviewsPage />);
    await openReview("IS4228");

    const submitBtn = await screen.findByRole("button", { name: "Gửi bình luận" });
    expect(submitBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Nội dung bình luận"), { target: { value: "abc" } });
    expect(screen.getByRole("button", { name: "Gửi bình luận" })).toBeDisabled();
    expect(api.postModuleComment).not.toHaveBeenCalled();
  });

  it("gửi kèm học kỳ; nội dung được tự duyệt thì hiện 'Đã đăng' và không đóng khối đánh giá", async () => {
    vi.mocked(api.postModuleComment).mockResolvedValue({ id: 1, status: "approved" } as never);
    render(<CourseReviewsPage />);

    await writeReview("IS4228");

    await waitFor(() =>
      expect(api.postModuleComment).toHaveBeenCalledWith("IS4228", {
        body: "Giảng viên dạy rõ ràng, bài tập vừa sức.",
        rating: 5,
        anon_id: "anon-test",
        semester: "2026-2027-1",
      }),
    );
    expect(await screen.findByText("Góp ý đã được đăng. Cảm ơn bạn đã chia sẻ!")).toBeInTheDocument();
    const card = screen.getByText("IS4228").closest("li") as HTMLElement;
    expect(within(card).getByText("Đã đăng")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("uelcourses-course-reviews") ?? "{}")).toEqual({
      "2026-2027-1::IS4228": "approved",
    });
    // Khối đánh giá vẫn mở để người dùng có thể tiếp tục xem/viết đánh giá có đăng nhập
    expect(screen.getByText("Bạn đang đánh giá môn IS4228 · Information Technologies in Financial Services")).toBeInTheDocument();
  });

  it("khi bị giữ để duyệt thì hiện 'Chờ duyệt'", async () => {
    vi.mocked(api.postModuleComment).mockResolvedValue({ id: 2, status: "pending" } as never);
    render(<CourseReviewsPage />);

    await writeReview("IS4228");

    expect(
      await screen.findByText(
        "Góp ý đã được gửi và đang chờ quản trị viên duyệt vì có nội dung cần kiểm tra lại.",
      ),
    ).toBeInTheDocument();
    const card = screen.getByText("IS4228").closest("li") as HTMLElement;
    expect(within(card).getByText("Chờ duyệt")).toBeInTheDocument();
  });

  it("nội dung bị từ chối (422) thì báo lỗi và giữ form để sửa", async () => {
    vi.mocked(api.postModuleComment).mockRejectedValue(Object.assign(new Error("HTTP 422"), { status: 422 }));
    render(<CourseReviewsPage />);

    await writeReview("IS4228");

    expect(
      await screen.findByText("Nội dung chưa phù hợp với nguyên tắc cộng đồng. Vui lòng chỉnh sửa rồi gửi lại."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nội dung bình luận")).toHaveValue("Giảng viên dạy rõ ràng, bài tập vừa sức.");
  });

  it("đã góp ý trước đó (409) thì khóa thẻ với nhãn 'Đã góp ý'", async () => {
    vi.mocked(api.postModuleComment).mockRejectedValue(Object.assign(new Error("HTTP 409"), { status: 409 }));
    render(<CourseReviewsPage />);

    await writeReview("IS4228");

    expect(await screen.findByText("Bạn đã góp ý học phần này trong học kỳ này.")).toBeInTheDocument();
    await waitFor(() => {
      const card = screen.getByText("IS4228").closest("li") as HTMLElement;
      expect(within(card).getByText("Đã góp ý")).toBeInTheDocument();
    });
  });

  it("học kỳ không có môn nào thì hiện trạng thái rỗng kèm liên kết tới thời khóa biểu", async () => {
    seedTimetable({});
    render(<CourseReviewsPage />);

    const empty = await screen.findAllByText("Thời khóa biểu của học kỳ này chưa có học phần nào.");
    expect(empty).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Mở thời khóa biểu" })[0]).toHaveAttribute("href", "/timetable");
  });
});

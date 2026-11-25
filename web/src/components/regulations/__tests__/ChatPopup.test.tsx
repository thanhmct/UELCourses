import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegulationsChatPopup } from "../RegulationsChatPopup";
import { activeConversation, useRegChat } from "@/lib/regChatStore";
import { useLang } from "@/i18n";
import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
import { useSettings, useTimetable } from "@/lib/store";

let currentPathname = "/today";

vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/lib/useMounted", () => ({
  useMounted: () => true,
}));

vi.mock("@/lib/api", () => ({
  api: {
    regulations: vi.fn(),
    modules: vi.fn(),
    askSources: vi.fn(),
    ask: vi.fn().mockResolvedValue({
      data: {
        answer: "Sinh viên được đăng ký tối đa 25 tín chỉ trong một học kỳ chính.",
        mode: "extractive",
        warnings: [],
        citations: [
          {
            doc_id: "qd-2022",
            decision_no: "123/QĐ-ĐHKTL",
            article: "Điều 5",
            clause: "2",
            quote: "Sinh viên có học lực bình thường được đăng ký tối đa 25 tín chỉ.",
          },
        ],
      },
    }),
  },
}));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

describe("W9: Cửa sổ chat pop-up Quy chế & Hỏi đáp AI", () => {
  beforeEach(() => {
    currentPathname = "/today";
    useLang.getState().setLang("vi");
    vi.mocked(track).mockClear();
    act(() => {
      useRegChat.getState().closeChat();
      useRegChat.setState({ conversations: [], activeId: null, pendingIds: [] });
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("hiển thị nút nổi (FAB) ở trang thông thường (/today)", () => {
    currentPathname = "/today";
    render(<RegulationsChatPopup />);

    const fab = screen.getByRole("button", { name: "Hỏi quy chế / AI" });
    expect(fab).toBeInTheDocument();
  });

  it("TUYỆT ĐỐI KHÔNG hiển thị FAB ở trang hỏi đáp toàn màn hình (/regulations)", () => {
    currentPathname = "/regulations";
    render(<RegulationsChatPopup />);

    const fab = screen.queryByRole("button", { name: "Hỏi quy chế / AI" });
    expect(fab).not.toBeInTheDocument();
  });

  it("bấm FAB mở cửa sổ chat nhỏ với tiêu đề, chọn khóa, phóng to, thu nhỏ, đóng", () => {
    currentPathname = "/timetable";
    render(<RegulationsChatPopup />);

    const fab = screen.getByRole("button", { name: "Hỏi quy chế / AI" });
    fireEvent.click(fab);

    // Dialog appears
    const dialog = screen.getByRole("dialog", { name: "Hỏi đáp Quy chế & AI" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Hỏi đáp Quy chế & AI")).toBeInTheDocument();

    // Controls in header
    expect(screen.getByRole("button", { name: "Phóng to" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thu nhỏ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đóng" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mở trang đầy đủ" })).toBeInTheDocument();
  });

  it("phóng to và thu nhỏ giữ nguyên hội thoại", async () => {
    currentPathname = "/modules";
    render(<RegulationsChatPopup />);

    // Open popup
    fireEvent.click(screen.getByRole("button", { name: "Hỏi quy chế / AI" }));

    // Ask a question
    const input = screen.getByPlaceholderText(/Đặt câu hỏi…/i);
    fireEvent.change(input, { target: { value: "Tối đa bao nhiêu tín chỉ?" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));

    await waitFor(() => {
      expect(within(screen.getByRole("log")).getByText("Tối đa bao nhiêu tín chỉ?")).toBeInTheDocument();
      expect(
        screen.getByText("Sinh viên được đăng ký tối đa 25 tín chỉ trong một học kỳ chính."),
      ).toBeInTheDocument();
    });

    // Click Maximize
    const maxBtn = screen.getByRole("button", { name: "Phóng to" });
    fireEvent.click(maxBtn);

    expect(useRegChat.getState().status).toBe("maximized");
    // Messages must still be visible in maximized state
    expect(within(screen.getByRole("log")).getByText("Tối đa bao nhiêu tín chỉ?")).toBeInTheDocument();
    expect(
      screen.getByText("Sinh viên được đăng ký tối đa 25 tín chỉ trong một học kỳ chính."),
    ).toBeInTheDocument();

    // Click Restore
    const restoreBtn = screen.getByRole("button", { name: "Thu nhỏ kích thước" });
    fireEvent.click(restoreBtn);

    expect(useRegChat.getState().status).toBe("popup");
    expect(within(screen.getByRole("log")).getByText("Tối đa bao nhiêu tín chỉ?")).toBeInTheDocument();
  });

  it("không còn ô chọn khóa hay chế độ; khóa lấy từ hồ sơ CTĐT", async () => {
    act(() => useSettings.getState().setCohort("K26"));
    render(<RegulationsChatPopup />);
    fireEvent.click(screen.getByRole("button", { name: "Hỏi quy chế / AI" }));

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText(/Tra cứu đang áp dụng khóa 26 theo hồ sơ CTĐT/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Đặt câu hỏi…/i), { target: { value: "Khi nào bị buộc thôi học?" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));
    await waitFor(() => expect(api.ask).toHaveBeenLastCalledWith("Khi nào bị buộc thôi học?", "K26"));
    act(() => useSettings.getState().setCohort(""));
  });

  it("thiếu khóa thì trợ lý hỏi lại, chọn khóa sẽ hỏi lại đúng câu với khóa đó", async () => {
    act(() => useSettings.getState().setCohort(""));
    vi.mocked(api.ask).mockResolvedValueOnce({
      data: {
        answer: "Quy định này khác nhau giữa các khóa. Bạn thuộc khóa nào?",
        mode: "clarify", found: false, warnings: [], citations: [],
        clarify: { kind: "cohort", question: "Quy định này khác nhau giữa các khóa. Bạn thuộc khóa nào?", options: [] },
      },
    } as never);
    render(<RegulationsChatPopup />);
    fireEvent.click(screen.getByRole("button", { name: "Hỏi quy chế / AI" }));
    expect(screen.getByText(/trợ lý sẽ hỏi khi quy định khác nhau/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Đặt câu hỏi…/i), { target: { value: "Khi nào bị buộc thôi học?" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));
    await waitFor(() => expect(screen.getByText(/Bạn thuộc khóa nào\?/)).toBeInTheDocument());
    expect(api.ask).toHaveBeenLastCalledWith("Khi nào bị buộc thôi học?", undefined);

    fireEvent.click(screen.getByRole("button", { name: "K24" }));
    await waitFor(() => expect(api.ask).toHaveBeenLastCalledWith("Khi nào bị buộc thôi học?", "K24"));
    expect(activeConversation(useRegChat.getState())?.cohort).toBe("K24");
    expect(screen.getByText(/Áp dụng khóa 24 bạn đã chọn/)).toBeInTheDocument();
  });

  it("phím Escape đóng popup khi đang mở", () => {
    currentPathname = "/today";
    render(<RegulationsChatPopup />);

    // Open popup
    fireEvent.click(screen.getByRole("button", { name: "Hỏi quy chế / AI" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Press Escape
    fireEvent.keyDown(window, { key: "Escape" });

    // Popup closed, FAB returns
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hỏi quy chế / AI" })).toBeInTheDocument();
  });

  it("tra /Công tác cố vấn từ danh mục, lưu mã văn bản và giữ lịch sử trên thiết bị", async () => {
    vi.mocked(api.regulations).mockResolvedValue({ mock: false, data: [{
      doc_id: "uel-cvht-1912-2024", title: "Quy định công tác Cố vấn học tập", decision_no: "1912/QĐ-ĐHKTL",
      issued_date: "2024-08-13", effective_from: "", status: "active", applies_to_cohorts: [], file: "", indexed: false,
    }] });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RegulationsChatPopup />);
    fireEvent.click(screen.getByRole("button", { name: "Hỏi quy chế / AI" }));
    fireEvent.click(screen.getByRole("button", { name: "/ Tra quy định" }));
    expect(await screen.findByRole("group", { name: "Gợi ý tra cứu" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Câu hỏi" }), { target: { value: "/Cong tac co van" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));
    expect(await screen.findByText(/chưa có nội dung để trích dẫn/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /1912\/QĐ-ĐHKTL/ })).toHaveAttribute("href", "/regulations/uel-cvht-1912-2024");
    expect(track).toHaveBeenCalledWith("chat_regulation", { query: "uel-cvht-1912-2024" });

    const saved = localStorage.getItem("uelcourses-reg-chat")!;
    expect(JSON.parse(saved).state.conversations[0].messages).toHaveLength(2);
    act(() => useRegChat.setState({ conversations: [], activeId: null }));
    localStorage.setItem("uelcourses-reg-chat", saved);
    await act(async () => { await useRegChat.persist.rehydrate(); });
    expect(within(screen.getByRole("log")).getByText("/Cong tac co van")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lịch sử" }));
    fireEvent.click(screen.getByRole("button", { name: "Xóa cuộc trò chuyện /Cong tac co van" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(JSON.parse(localStorage.getItem("uelcourses-reg-chat")!).state.conversations).toEqual([]);
  });

  it("gắn thẻ văn bản bằng / rồi hỏi chi tiết trong văn bản đó, hỏi tiếng Anh vẫn gửi đúng phạm vi", async () => {
    vi.mocked(api.regulations).mockResolvedValue({ mock: false, data: [{
      doc_id: "uel-qcdt-2261-2025", title: "Quy chế đào tạo trình độ đại học", decision_no: "2261/QĐ-ĐHKTL",
      issued_date: "2025-08-01", effective_from: "", status: "active", applies_to_cohorts: [], file: "", indexed: true,
    }] });
    vi.mocked(api.ask).mockResolvedValueOnce({ mock: false, data: {
      answer: "To be considered for graduation, students must meet all conditions.", found: true, mode: "llm",
      warnings: [], citations: [], answer_lang: "en",
    } });
    render(<RegulationsChatPopup />);
    fireEvent.click(screen.getByRole("button", { name: "Hỏi quy chế / AI" }));
    fireEvent.click(screen.getByRole("button", { name: "/ Tra quy định" }));
    fireEvent.click(await screen.findByRole("button", { name: /2261\/QĐ-ĐHKTL/ }));

    // The document becomes a chip; no extra question is sent yet.
    const chips = await screen.findByRole("group", { name: "Đang hỏi trong:" });
    expect(within(chips).getByRole("link", { name: "2261/QĐ-ĐHKTL" })).toBeInTheDocument();
    expect(api.ask).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Câu hỏi" })).toHaveAttribute("placeholder", "Hỏi chi tiết về văn bản đã chọn…");

    fireEvent.change(screen.getByRole("textbox", { name: "Câu hỏi" }), { target: { value: "What are the graduation conditions?" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));
    expect(await screen.findByText(/students must meet all conditions/)).toBeInTheDocument();
    expect(screen.queryByText(/Tóm tắt tiếng Anh/)).not.toBeInTheDocument();
    const [, , , options] = vi.mocked(api.ask).mock.calls.at(-1)!;
    expect(options).toMatchObject({ docIds: ["uel-qcdt-2261-2025"] });

    // Removing the chip returns to answering from all documents.
    fireEvent.click(screen.getByRole("button", { name: "Bỏ chọn 2261/QĐ-ĐHKTL" }));
    expect(screen.queryByRole("group", { name: "Đang hỏi trong:" })).not.toBeInTheDocument();
  });

  it.each(["@BBA4001", "Đề cương BBA4001"])("không kích hoạt tra đề cương khi nhập '%s'", async (text) => {
    render(<RegulationsChatPopup />);
    fireEvent.click(screen.getByRole("button", { name: "Hỏi quy chế / AI" }));
    expect(screen.queryByRole("button", { name: /Tra đề cương/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Câu hỏi" }), { target: { value: text } });
    expect(screen.queryByRole("group", { name: "Gợi ý tra cứu" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));
    await waitFor(() => expect(api.ask).toHaveBeenLastCalledWith(text, undefined));
    expect(api.modules).not.toHaveBeenCalled();
    expect(api.askSources).not.toHaveBeenCalled();
  });

  it("dùng lại câu hỏi gốc khi người dùng gõ khóa để làm rõ", async () => {
    const question = "Chuẩn đầu ra tiếng Anh của khóa tôi là gì?";
    vi.mocked(api.ask).mockResolvedValueOnce({ mock: false, data: {
      answer: "Bạn thuộc khóa nào và học chương trình nào?", mode: "clarify", warnings: [], citations: [],
      clarify: { kind: "question", question: "Bạn thuộc khóa nào và học chương trình nào?", options: [] },
    } });
    render(<RegulationsChatPopup />);
    fireEvent.click(screen.getByRole("button", { name: "Hỏi quy chế / AI" }));
    const input = screen.getByRole("textbox", { name: "Câu hỏi" });
    fireEvent.change(input, { target: { value: question } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));
    await screen.findByText("Bạn thuộc khóa nào và học chương trình nào?");
    fireEvent.change(input, { target: { value: "Tôi học khóa 26" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));
    await waitFor(() => expect(api.ask).toHaveBeenLastCalledWith(question, "K26"));
    expect(within(screen.getByRole("log")).getByText("Tôi học khóa 26")).toBeInTheDocument();
  });

  it("gửi mã CTĐT và tóm tắt thời khóa biểu của câu hỏi liên quan", async () => {
    const settingsBefore = useSettings.getState();
    const timetableBefore = useTimetable.getState();
    const semester = "2026-2027-1";
    const question = "Thời khóa biểu của tôi có bao nhiêu tín chỉ?";
    vi.mocked(api.ask).mockResolvedValueOnce({ mock: false, data: {
      answer: "Phương án có 3 tín chỉ.", mode: "context", found: true, citations: [], warnings: [],
    } });
    try {
      act(() => {
        useSettings.getState().setProgramProfile("K26409E1");
        useTimetable.setState({
          semester,
          bySemester: { [semester]: [{ code: "BBA4001", class_code: "BBA4001.01", color: 0, hidden: false }] },
          info: { BBA4001: { code: "BBA4001", name: "Quản trị chuỗi cung ứng", credits: 3 } },
        });
      });
      render(<RegulationsChatPopup />);
      fireEvent.click(screen.getByRole("button", { name: "Hỏi quy chế / AI" }));
      fireEvent.change(screen.getByRole("textbox", { name: "Câu hỏi" }), { target: { value: question } });
      fireEvent.click(screen.getByRole("button", { name: "Gửi" }));
      expect(await screen.findByText("Theo dữ liệu trên thiết bị")).toBeInTheDocument();
      expect(api.ask).toHaveBeenLastCalledWith(question, "K26", {
        program_ids: ["K26409E"], degree: "dai_hoc", timetable: { semester, modules: 1, credits: 3 },
      });
      expect(track).not.toHaveBeenCalled();
    } finally {
      act(() => {
        useSettings.setState(settingsBefore);
        useTimetable.setState(timetableBefore);
      });
    }
  });

  it("tạo cuộc trò chuyện mới, mở lại cuộc cũ và giữ phản hồi đang tải đúng chỗ", async () => {
    type AskResult = Awaited<ReturnType<typeof api.ask>>;
    let completeFirst!: (answer: AskResult) => void;
    vi.mocked(api.ask).mockImplementationOnce(() => new Promise<AskResult>((resolve) => { completeFirst = resolve; }));
    vi.mocked(api.ask).mockResolvedValueOnce({ mock: false, data: {
      answer: "Phản hồi ở cuộc thứ hai.", warnings: [], citations: [], mode: "extractive",
    } });
    render(<RegulationsChatPopup />);
    fireEvent.click(screen.getByRole("button", { name: "Hỏi quy chế / AI" }));
    const send = (text: string) => {
      fireEvent.change(screen.getByRole("textbox", { name: "Câu hỏi" }), { target: { value: text } });
      fireEvent.click(screen.getByRole("button", { name: "Gửi" }));
    };
    const openHistory = () => fireEvent.click(screen.getByRole("button", { name: "Lịch sử" }));
    const history = () => within(screen.getByRole("complementary", { name: "Lịch sử trò chuyện" }));
    const log = () => within(screen.getByRole("log"));
    send("Tôi muốn hỏi về tín chỉ.");
    openHistory();
    fireEvent.click(history().getByRole("button", { name: "Trò chuyện mới" }));
    expect(log().queryByText("Tôi muốn hỏi về tín chỉ.")).not.toBeInTheDocument();
    send("Tôi muốn hỏi về học bổng.");
    expect(await log().findByText("Phản hồi ở cuộc thứ hai.")).toBeInTheDocument();
    await act(async () => completeFirst({ mock: false, data: {
      answer: "Phản hồi ở cuộc đầu tiên.", warnings: [], citations: [], mode: "extractive",
    } }));
    expect(log().queryByText("Phản hồi ở cuộc đầu tiên.")).not.toBeInTheDocument();

    const saved = localStorage.getItem("uelcourses-reg-chat")!;
    act(() => useRegChat.setState({ conversations: [], activeId: null }));
    localStorage.setItem("uelcourses-reg-chat", saved);
    await act(async () => { await useRegChat.persist.rehydrate(); });
    openHistory();
    expect(history().getByRole("button", { name: "Tôi muốn hỏi về học bổng." })).toHaveAttribute("aria-current", "true");
    fireEvent.click(history().getByRole("button", { name: "Tôi muốn hỏi về tín chỉ." }));
    expect(log().getByText("Phản hồi ở cuộc đầu tiên.")).toBeInTheDocument();
    expect(log().queryByText("Phản hồi ở cuộc thứ hai.")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Câu hỏi" })).toHaveFocus();
  });

  it("đưa lịch sử từ phiên bản cũ vào một cuộc trò chuyện", async () => {
    localStorage.setItem("uelcourses-reg-chat", JSON.stringify({ version: 0, state: {
      status: "popup", cohort: "K24", messages: [
        { role: "user", text: "Câu hỏi đã lưu" }, { role: "ai", text: "Câu trả lời đã lưu" },
      ],
    } }));
    await act(async () => { await useRegChat.persist.rehydrate(); });
    render(<RegulationsChatPopup />);
    expect(within(screen.getByRole("log")).getByText("Câu trả lời đã lưu")).toBeInTheDocument();
    expect(activeConversation(useRegChat.getState())?.cohort).toBe("K24");
    fireEvent.click(screen.getByRole("button", { name: "Lịch sử" }));
    expect(screen.getByRole("button", { name: "Câu hỏi đã lưu" })).toHaveAttribute("aria-current", "true");
  });
});

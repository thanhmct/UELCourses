import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ReactMarkdown from "react-markdown";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLang } from "@/i18n";
import { api } from "@/lib/api";
import { remarkVault } from "@/lib/remarkVault";
import AskPage from "./page";

describe("Ask UEL", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useLang.setState({ lang: "vi" });
  });

  it("renders the source as text, uses an internal link, and saves anonymous feedback", async () => {
    const payload = "<img src=x onerror=alert(1)>";
    vi.spyOn(api, "askSources").mockResolvedValue({
      answer: payload,
      found: true,
      mode: "llm",
      reason: null,
      answer_id: "example-response",
      warnings: ["Đang tra bản CTĐT 2025."],
      citations: [{ code: "BBA4001", kind: "assessment", quote: payload, ctdt_year: 2025, href: "https://example.org/" }],
    });
    const vote = vi.spyOn(api, "rateAnswer").mockResolvedValue(undefined);
    const { container } = render(<AskPage />);
    fireEvent.change(screen.getByLabelText("Câu hỏi"), { target: { value: "BBA4001 đánh giá thế nào?" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" }));
    expect(await screen.findByRole("link", { name: "BBA4001 · Đánh giá" })).toHaveAttribute("href", "/modules/BBA4001");
    expect(screen.getAllByText(payload)).toHaveLength(2);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Đang tra bản CTĐT 2025.")).toBeInTheDocument();
    expect(screen.getByText("AI trả lời – hãy đối chiếu văn bản gốc.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Không hữu ích" }));
    expect(await screen.findByText("Đã lưu phản hồi ẩn danh.")).toBeInTheDocument();
    expect(vote).toHaveBeenCalledWith("modules", "example-response", false);
  });

  it("offers the planner for course advice in English", async () => {
    useLang.setState({ lang: "en" });
    const ask = vi.spyOn(api, "askSources").mockResolvedValue({
      answer: "",
      found: false,
      mode: "extractive",
      reason: "planner",
      citations: [],
      warnings: [],
    });
    render(<AskPage />);
    expect(screen.queryByLabelText("Filter by cohort")).toBeNull();
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Which course should I choose?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByRole("link", { name: /open the planner/i })).toHaveAttribute("href", "/planner");
    expect(ask).toHaveBeenCalledWith("modules", "Which course should I choose?", undefined, "en");
  });

  it("asks back for the cohort and re-asks the same question with the chosen one", async () => {
    const ask = vi.spyOn(api, "askSources")
      .mockResolvedValueOnce({
        answer: "Quy định này khác nhau giữa các khóa. Bạn thuộc khóa nào?", found: false, mode: "clarify",
        citations: [], warnings: [],
        clarify: { kind: "cohort", question: "Quy định này khác nhau giữa các khóa. Bạn thuộc khóa nào?", options: [] },
      })
      .mockResolvedValueOnce({ answer: "Theo Điều 34 …", found: true, mode: "llm", citations: [], warnings: [] });
    render(<AskPage />);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "regulations" } });
    fireEvent.change(screen.getByLabelText("Câu hỏi"), { target: { value: "Khi nào bị buộc thôi học?" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" }));
    fireEvent.click(await screen.findByRole("button", { name: "K25" }));
    expect(await screen.findByText("Theo Điều 34 …")).toBeInTheDocument();
    expect(ask).toHaveBeenLastCalledWith("regulations", "Khi nào bị buộc thôi học?", "K25", "vi");
    expect(screen.getByText(/Áp dụng khóa 25 bạn đã chọn/)).toBeInTheDocument();
  });

  it("labels a handbook citation and links to its rendered page segment", async () => {
    const label = "Sổ tay SV K25, tr. 8 — KÝ TÚC XÁ";
    const sourceLabel = "Nguồn tóm tắt: sổ tay";
    const anchor = "trang-8-muc-1";
    const quote = "Sinh viên báo tại quầy tiếp nhận.";
    vi.spyOn(api, "askSources").mockResolvedValue({
      answer: quote,
      found: true,
      mode: "extractive",
      warnings: ["Tóm tắt trong sổ tay sinh viên; đối chiếu văn bản gốc"],
      citations: [{ doc_id: "uel-sotay-sv-k25", decision_no: "", article: null, page: 8, anchor, label,
        source_label: sourceLabel, quote }],
    });
    render(<AskPage />);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "regulations" } });
    fireEvent.change(screen.getByLabelText("Câu hỏi"), { target: { value: "K25 làm mất thẻ ký túc xá?" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" }));
    expect(await screen.findByRole("link", { name: label }))
      .toHaveAttribute("href", "/regulations?doc=uel-sotay-sv-k25#trang-8-muc-1");
    expect(screen.getByText(sourceLabel)).toBeInTheDocument();
    const reader = render(<ReactMarkdown remarkPlugins={[remarkVault]}>
      {"## Trang 8\n\n1\\. " + quote + " ^" + anchor}
    </ReactMarkdown>);
    expect(reader.container.querySelector("#" + anchor)).toHaveTextContent(quote);
    expect(reader.container).not.toHaveTextContent("^" + anchor);
  });

  it("opens an official citation source in a new tab when source_url is available", async () => {
    const sourceUrl = "https://pdt.uel.edu.vn/van-ban/1268.pdf";
    vi.spyOn(api, "askSources").mockResolvedValue({
      answer: "Theo Khoản 2 Điều 5.",
      found: true,
      mode: "extractive",
      warnings: [],
      citations: [{
        doc_id: "uel-qcdt-1268-2022",
        decision_no: "1268/QĐ-ĐHKTL",
        article: "5",
        clause: "2",
        anchor: "dieu-5-khoan-2",
        quote: "Sinh viên đăng ký theo giới hạn tín chỉ.",
        source_url: sourceUrl,
      }],
    });
    render(<AskPage />);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "regulations" } });
    fireEvent.change(screen.getByLabelText("Câu hỏi"), { target: { value: "Giới hạn tín chỉ?" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" }));

    const citation = await screen.findByRole("link", { name: /1268\/QĐ-ĐHKTL/ });
    expect(citation).toHaveAttribute("href", sourceUrl);
    expect(citation).toHaveAttribute("target", "_blank");
    expect(citation).toHaveAttribute("rel", "noopener noreferrer");
  });
});

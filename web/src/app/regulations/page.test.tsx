import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRegChat } from "@/lib/regChatStore";
import RegulationDocumentPage from "./[docId]/page";
import RegulationsPage from "./page";

const { ask, regulation, replace } = vi.hoisted(() => ({ ask: vi.fn(), regulation: vi.fn(), replace: vi.fn() }));
const router = { replace };

vi.mock("next/navigation", () => ({
  useParams: () => ({ docId: "qd-2022" }),
  useRouter: () => router,
}));
vi.mock("@/lib/api", () => ({ api: { ask, regulation } }));

afterEach(() => {
  cleanup();
  ask.mockReset();
  regulation.mockReset();
  regulation.mockResolvedValue({
    data: {
      doc_id: "qd-2022",
      title: "Quy chế đào tạo đại học",
      decision_no: "123/QĐ-ĐHKTL",
      issuer: "Trường Đại học Kinh tế – Luật",
      issued_date: "2022-07-15",
      effective_from: "2022-09-01",
      effective_to: null,
      status: "active",
      applies_to_cohorts: ["K22", "K23", "K24"],
      supersedes: ["qd-2019"],
      source_url: "https://pdt.uel.edu.vn/van-ban/qd-2022.pdf",
      file: "raw/qd-2022.pdf",
      metadata_verified: false,
      articles: [{ article: "5", text: "Giới hạn tín chỉ." }],
    },
    mock: false,
  });
  replace.mockClear();
  useRegChat.setState({ conversations: [], activeId: null, pendingIds: [] });
  window.history.replaceState(null, "", "/regulations");
});

describe("RegulationsPage", () => {
  it("hiển thị khung chat, lịch sử và gửi câu hỏi có trích dẫn", async () => {
    ask.mockResolvedValue({
      data: {
        answer: "Đây là câu trả lời có nguồn.",
        mode: "extractive",
        warnings: [],
        citations: [{
          doc_id: "qd-2022",
          decision_no: "123/QĐ-ĐHKTL",
          article: "Điều 5",
          clause: "2",
          quote: "Giới hạn tín chỉ.",
          source_url: "https://pdt.uel.edu.vn/van-ban/qd-2022.pdf",
        }],
      },
    });
    render(<RegulationsPage />);

    expect(screen.getByRole("heading", { name: "Hỏi AI về quy chế" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Lịch sử trò chuyện" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trò chuyện mới" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Tìm văn bản/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Câu hỏi" }), {
      target: { value: "Được đăng ký bao nhiêu tín chỉ?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));

    expect(await screen.findByText("Đây là câu trả lời có nguồn.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /123\/QĐ-ĐHKTL/ }))
      .toHaveAttribute("href", "https://pdt.uel.edu.vn/van-ban/qd-2022.pdf");
    expect(screen.getByRole("link", { name: /123\/QĐ-ĐHKTL/ })).toHaveAttribute("target", "_blank");
  });

  it("chuyển liên kết cũ sang trang đọc và giữ Điều/Khoản được dẫn", () => {
    window.history.replaceState(null, "", "/regulations?doc=qd-2022#dieu-5-khoan-2");
    render(<RegulationsPage />);

    expect(replace).toHaveBeenCalledWith("/regulations/qd-2022#dieu-5-khoan-2");
  });

  it("hiển thị thẻ thông tin, không hiển thị toàn văn và bỏ qua anchor cũ", async () => {
    window.history.replaceState(null, "", "/regulations/qd-2022#dieu-5-khoan-2");
    render(<RegulationDocumentPage />);

    expect(await screen.findByRole("heading", { name: "Quy chế đào tạo đại học" })).toBeInTheDocument();
    expect(screen.getByText("Trường Đại học Kinh tế – Luật")).toBeInTheDocument();
    expect(screen.getByText("K22, K23, K24")).toBeInTheDocument();
    expect(screen.getByText("Metadata chưa xác minh")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Xem văn bản gốc.*pdt\.uel\.edu\.vn/ }))
      .toHaveAttribute("href", "https://pdt.uel.edu.vn/van-ban/qd-2022.pdf");
    expect(screen.getByRole("link", { name: "qd-2019" })).toHaveAttribute("href", "/regulations/qd-2019");
    expect(screen.queryByText("Giới hạn tín chỉ.")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Câu hỏi" })).not.toBeInTheDocument();
  });
});

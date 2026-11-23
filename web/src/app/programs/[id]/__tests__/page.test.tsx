import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProgramDetailPage from "../page";
import { api } from "@/lib/api";
import { useLang } from "@/i18n";
import type { ProgramDetail } from "@/lib/types";

let currentProgramId = "K25404";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: currentProgramId }),
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
  }),
}));

const mockProgramDetail: ProgramDetail = {
  program: {
    program_id: "K25404",
    name: "Tài chính - Ngân hàng",
    cohort: "K25",
    faculty: "Khoa Tài chính - Ngân hàng",
    total_credits: 141,
  },
  blocks: [],
};

describe("Brief W17: Trang chi tiết CTĐT (/programs/[id]) dùng BackButton vuông thay cho link chữ trần", () => {
  beforeEach(() => {
    currentProgramId = "K25404";
    act(() => {
      useLang.getState().setLang("vi");
    });

    vi.spyOn(api, "program").mockResolvedValue({ data: mockProgramDetail, mock: true });
    vi.spyOn(api, "programGraph").mockResolvedValue({ data: { nodes: [], edges: [] }, mock: true });
    vi.spyOn(api, "electiveGroups").mockResolvedValue({ data: [], mock: true });
    vi.spyOn(api, "checkProgram").mockResolvedValue({
      data: {
        eligible_now: [],
        blocked: [],
        warnings: [],
        rule_refs: [],
      },
      mock: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("1. Hiển thị nút BackButton có role link, href='/programs' và aria-label đầy đủ", async () => {
    render(<ProgramDetailPage />);

    const backBtn = await screen.findByRole("link", {
      name: "Quay lại danh sách chương trình đào tạo",
    });
    expect(backBtn).toBeInTheDocument();
    expect(backBtn).toHaveAttribute("href", "/programs");
    expect(backBtn).toHaveAttribute("title", "Quay lại danh sách chương trình đào tạo");
  });

  it("2. Không còn text '← Danh sách chương trình đào tạo' trên trang chi tiết CTĐT", async () => {
    render(<ProgramDetailPage />);

    await screen.findByRole("link", {
      name: "Quay lại danh sách chương trình đào tạo",
    });

    expect(screen.queryByText(/← Danh sách chương trình đào tạo/)).toBeNull();
    expect(screen.queryByText(/←/)).toBeNull();
  });

  it("3. Hỗ trợ giao diện tiếng Anh: nhãn nút quay lại đổi sang tiếng Anh", async () => {
    act(() => {
      useLang.getState().setLang("en");
    });

    render(<ProgramDetailPage />);

    const backBtn = await screen.findByRole("link", {
      name: "Back to programme list",
    });
    expect(backBtn).toBeInTheDocument();
    expect(backBtn).toHaveAttribute("href", "/programs");
    expect(backBtn).toHaveAttribute("title", "Back to programme list");
    expect(screen.queryByText(/← Programme list/)).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { api } from "@/lib/api";
import ProgramDetailPage from "../[id]/page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "K25410E" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Chương trình hệ tiếng Anh chính thức (Brief D7)", () => {
  it("môn B trong hệ E có nhãn 'Học bằng tiếng Việt' và môn không thuộc sheet E không xuất hiện", async () => {
    // Mock dữ liệu chính thức cho CTĐT 410E
    const mockOfficialDetail = {
      program: {
        program_id: "K25410E",
        name: "Marketing (tiếng Anh) Khóa 25",
        cohort: "K25",
        faculty: "Khoa Quản trị kinh doanh",
        total_credits: 130,
        track_source: "official" as const,
      },
      blocks: [
        {
          name: "Kiến thức đại cương",
          required_credits: 6,
          total_credits: 6,
          modules: [
            {
              code: "BDG1001",
              name: "Triết học Mác - Lênin",
              credits: 3,
              required: true,
              suggested_order: 1,
              suggested_term: 1,
              is_vietnamese_track: true,
            },
            {
              code: "BDG1014",
              name: "Giáo dục quốc phòng",
              credits: 0,
              required: true,
              suggested_order: 1,
              suggested_term: 1,
              is_vietnamese_track: true,
            },
            {
              code: "EAA2028",
              name: "Principles of Accounting",
              credits: 3,
              required: true,
              suggested_order: 1,
              suggested_term: 1,
              is_vietnamese_track: false,
            },
          ],
        },
        {
          name: "Kiến thức cơ sở ngành",
          required_credits: 3,
          total_credits: 3,
          modules: [
            {
              code: "EBM1001",
              name: "Principles of Marketing",
              credits: 3,
              required: true,
              suggested_order: 2,
              suggested_term: 2,
              is_vietnamese_track: false,
            },
          ],
        },
      ],
      track_source: "official" as const,
    };

    vi.spyOn(api, "program").mockResolvedValue({
      data: mockOfficialDetail,
      mock: false,
    });
    vi.spyOn(api, "programGraph").mockResolvedValue({
      data: {
        nodes: [
          { code: "BDG1001", name: "Triết học Mác - Lênin", credits: 3, required: true },
          { code: "BDG1014", name: "Giáo dục quốc phòng", credits: 0, required: true },
          { code: "EAA2028", name: "Principles of Accounting", credits: 3, required: true },
          { code: "EBM1001", name: "Principles of Marketing", credits: 3, required: true },
        ],
        edges: [],
      },
      mock: false,
    });
    vi.spyOn(api, "electiveGroups").mockResolvedValue({
      data: [],
      mock: false,
    });

    render(<ProgramDetailPage />);

    // Chờ dữ liệu nạp xong
    await waitFor(() => {
      expect(screen.getByText("Marketing (tiếng Anh) Khóa 25 (K25410E)")).toBeInTheDocument();
    });

    // Chuyển sang tab Khối kiến thức
    const blocksTabBtn = screen.getByRole("tab", { name: /Khối kiến thức/i });
    fireEvent.click(blocksTabBtn);

    // 1. Kiểm tra 2 môn B (BDG1001, BDG1014) hiển thị nhãn "Học bằng tiếng Việt"
    const vnBadges = screen.getAllByText("Học bằng tiếng Việt");
    expect(vnBadges.length).toBeGreaterThanOrEqual(2);

    // 2. Môn tiếng Anh chính thức hiển thị bình thường
    expect(screen.getByText("BDG1001")).toBeInTheDocument();
    expect(screen.getByText("BDG1014")).toBeInTheDocument();
    expect(screen.getByText("EAA2028")).toBeInTheDocument();
    expect(screen.getByText("EBM1001")).toBeInTheDocument();

    // 3. Môn không thuộc sheet E (BBM5023, BBM4086...) tuyệt đối KHÔNG xuất hiện
    expect(screen.queryByText("BBM5023")).toBeNull();
    expect(screen.queryByText("BBM4086")).toBeNull();
    expect(screen.queryByText("Marketing nội dung")).toBeNull();
  });
});

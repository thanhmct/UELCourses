import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgramProfileDialog } from "../ProgramProfileDialog";
import { useSettings } from "@/lib/store";
import { useLang } from "@/i18n";

vi.mock("@/lib/api", () => ({
  api: {
    programs: vi.fn(async () => ({
      mock: false,
      data: [
        { program_id: "K25405", name: "Kế toán Khóa 25" },
        { program_id: "K26405", name: "Kế toán Khóa 26" },
        { program_id: "K26405E", name: "Kế toán (Tiếng Anh)" },
        { program_id: "K26405TE", name: "Kế toán (Cử nhân tài năng tiếng Anh)" },
        { program_id: "K26414", name: "Công nghệ tài chính Khóa 26" },
        { program_id: "K26404", name: "Tài chính - Ngân hàng Khóa 26" },
        { program_id: "K25404", name: "Tài chính - Ngân hàng Khóa 25" },
        { program_id: "K24404", name: "Tài chính - Ngân hàng Khóa 24" },
        { program_id: "K26414H", name: "Công nghệ tài chính – Coop Khóa 26" },
        { program_id: "K23406", name: "Hệ thống thông tin quản lý Khóa 23" },
        { program_id: "K26KDNNS", name: "Kinh doanh nông nghiệp số Khóa 26" },
        { program_id: "K26KDTMHQ", name: "KDTMHQ Khóa 26" },
        { program_id: "M601NC", name: "Kinh tế chính trị – Thạc sĩ nghiên cứu", module_count: 12 },
        { program_id: "M601UD", name: "Kinh tế chính trị – Thạc sĩ ứng dụng", module_count: 14 },
      ],
    })),
    validGroups: vi.fn(async () => ({
      mock: false,
      data: [],
    })),
  },
}));

describe("ProgramProfileDialog", () => {
  beforeEach(() => {
    useSettings.getState().setProgramProfile("");
    useLang.getState().setLang("vi");
  });
  afterEach(() => {
    cleanup();
    useSettings.getState().setProgramProfile("");
    useLang.getState().setLang("vi");
  });
  it("groups name results by major, then lets the user select a cohort or look up a full code", async () => {
    render(<ProgramProfileDialog open={true} onClose={() => {}} />);
    const input = screen.getByLabelText(/^Ngành chính$/i);
    fireEvent.change(input, { target: { value: "ke toan" } });
    const major = await screen.findByRole("button", { name: "Kế toán · Cử nhân · 405 · Accounting" });
    expect(screen.queryByRole("button", { name: /K26405/ })).not.toBeInTheDocument();
    fireEvent.click(major);
    fireEvent.click(screen.getByRole("button", { name: "Tiếng Việt · Khóa 26 · K26405" }));
    expect(input).toHaveValue("K26405");

    fireEvent.change(input, { target: { value: "K26405E" } });
    expect(screen.getByRole("button", { name: "Kế toán · Tiếng Anh · Khóa 26 · K26405E" })).toBeInTheDocument();
  });

  it("expands KDTMHQ in the outer programme filter", async () => {
    render(<ProgramProfileDialog open={true} onClose={() => {}} />);
    const input = screen.getByLabelText(/^Ngành chính$/i);
    fireEvent.change(input, { target: { value: "han quoc" } });

    expect(await screen.findByRole("button", {
      name: /Kinh doanh thương mại Hàn Quốc · Cử nhân · KDTMHQ/,
    })).toBeInTheDocument();
    expect(screen.queryByText(/^KDTMHQ$/)).not.toBeInTheDocument();
  });

  it("renders natural program description when valid primary code is entered", async () => {
    render(<ProgramProfileDialog open={true} onClose={() => {}} />);

    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByLabelText("Ngành chính")).toBeInTheDocument();
    expect(dialog.getByPlaceholderText("Mã hoặc tên ngành/chuyên ngành thứ hai…")).toBeInTheDocument();
    expect(dialog.queryByRole("checkbox")).toBeNull();
    const primaryInput = screen.getByLabelText(/^Ngành chính$/i);
    fireEvent.change(primaryInput, { target: { value: "K25405A" } });

    await waitFor(() => {
      expect(
        screen.getByText(
          /→ Khóa 2025, chương trình đào tạo ngành Kế toán, chương trình tiếng Việt\./,
        ),
      ).toBeInTheDocument();
    });
  });

  it("renders English track description for suffix E1", async () => {
    render(<ProgramProfileDialog open={true} onClose={() => {}} />);

    const primaryInput = screen.getByLabelText(/^Ngành chính$/i);
    fireEvent.change(primaryInput, { target: { value: "K23406E1" } });

    await waitFor(() => {
      expect(
        screen.getByText(
          /→ Khóa 2023, chương trình đào tạo ngành Hệ thống thông tin quản lý, chương trình tiếng Anh\./,
        ),
      ).toBeInTheDocument();
    });
  });

  it("renders Coop description for suffix H", async () => {
    render(<ProgramProfileDialog open={true} onClose={() => {}} />);

    const primaryInput = screen.getByLabelText(/^Ngành chính$/i);
    fireEvent.change(primaryInput, { target: { value: "K23406H" } });

    await waitFor(() => {
      expect(
        screen.getByText(
          /→ Khóa 2023, chương trình đào tạo ngành Hệ thống thông tin quản lý, chương trình Coop \(hợp tác doanh nghiệp\)\./,
        ),
      ).toBeInTheDocument();
    });
  });

  it("renders major code fallback when program is not found in API", async () => {
    render(<ProgramProfileDialog open={true} onClose={() => {}} />);

    const primaryInput = screen.getByLabelText(/^Ngành chính$/i);
    fireEvent.change(primaryInput, { target: { value: "K26999A" } });

    await waitFor(() => {
      expect(
        screen.getByText(
          /→ Khóa 2026, chương trình đào tạo mã ngành 999, chương trình tiếng Việt\./,
        ),
      ).toBeInTheDocument();
    });
  });

  it("describes secondary program code similarly", async () => {
    render(<ProgramProfileDialog open={true} onClose={() => {}} />);

    const secondaryInput = screen.getByLabelText(/Ngành học thứ hai/i);
    fireEvent.change(secondaryInput, { target: { value: "K25405A" } });

    await waitFor(() => {
      expect(
        screen.getByText(
          /→ Khóa 2025, chương trình đào tạo ngành Kế toán, chương trình tiếng Việt\./,
        ),
      ).toBeInTheDocument();
    });
  });

  it("renders Master's programme description and badge for C24601", async () => {
    render(<ProgramProfileDialog open={true} onClose={() => {}} />);

    const primaryInput = screen.getByLabelText(/^Ngành chính$/i);
    fireEvent.change(primaryInput, { target: { value: "C24601" } });

    await waitFor(() => {
      expect(
        screen.getByText(
          /→ Chương trình thạc sĩ ngành Kinh tế chính trị\./,
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("Thạc sĩ")).toBeInTheDocument();
    });
  });

  it("renders Doctoral programme description and notice for N25701-1", async () => {
    render(<ProgramProfileDialog open={true} onClose={() => {}} />);

    const primaryInput = screen.getByLabelText(/^Ngành chính$/i);
    fireEvent.change(primaryInput, { target: { value: "N25701-1" } });

    await waitFor(() => {
      expect(
        screen.getByText(
          /→ Chương trình tiến sĩ ngành mã 701\./,
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("Tiến sĩ")).toBeInTheDocument();
      expect(screen.getByText(/Chưa có danh sách học phần/)).toBeInTheDocument();
    });
  });

  it("infers the intake and the English-language talent track from an English query", async () => {
    useLang.getState().setLang("en");
    render(<ProgramProfileDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Primary Major"), { target: { value: "Accounting cohort 2026 English Talent" } });
    fireEvent.click(await screen.findByRole("button", { name: /^Accounting · Bachelor's/ }));
    expect(screen.queryByRole("button", { name: /K25405|K26405E$/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "English-language Talent Bachelor’s · Cohort 26 · K26405TE" }));
    expect(screen.getByText(/undergraduate programme in Accounting, English-language Talent Bachelor programme/)).toBeInTheDocument();
  });

  it("infers a master's programme and offers available directions without showing cohorts", async () => {
    render(<ProgramProfileDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Ngành chính"), { target: { value: "thac si political economy" } });
    expect(screen.getByRole("button", { name: "Thạc sĩ" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(await screen.findByRole("button", { name: /^Kinh tế chính trị · Thạc sĩ/ }));
    expect(screen.getByRole("button", { name: "Hướng nghiên cứu · M601NC" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hướng ứng dụng · M601UD" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu thông tin" }));
    expect(useSettings.getState().programCode).toBe("M601UD");
    expect(useSettings.getState().degree).toBe("thac_si");
  });

  it("stores a named doctoral programme using its published admissions code", async () => {
    useSettings.getState().setCohort("K24");
    render(<ProgramProfileDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Ngành chính"), { target: { value: "tien si luat kinh te" } });
    fireEvent.click(await screen.findByRole("button", { name: /^Luật kinh tế · Tiến sĩ · 9380107/ }));
    expect(screen.getByText(/Chưa có danh sách học phần/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lưu thông tin" }));
    expect(useSettings.getState().programCode).toBe("9380107");
    expect(useSettings.getState().degree).toBe("tien_si");
    expect(useSettings.getState().cohort).toBe("K24");
  });

  it("finds a named undergraduate programme with a letter-based catalogue code", async () => {
    render(<ProgramProfileDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Ngành chính"), { target: { value: "digital agribusiness" } });
    fireEvent.click(await screen.findByRole("button", { name: /^Kinh doanh nông nghiệp số/ }));
    fireEvent.click(screen.getByRole("button", { name: /K26KDNNS/ }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu thông tin" }));
    expect(useSettings.getState().programCode).toBe("K26KDNNS");
  });

  it("includes Finance–Banking English options when the API catalogue only lists Vietnamese programmes", async () => {
    render(<ProgramProfileDialog open onClose={() => {}} />);
    const input = screen.getByLabelText("Ngành chính");
    fireEvent.change(input, { target: { value: "tai chinh ngan hang" } });
    fireEvent.click(await screen.findByRole("button", { name: /^Tài chính - Ngân hàng · Cử nhân/ }));
    for (const cohort of [24, 25, 26]) {
      expect(screen.getByRole("button", { name: `Tiếng Anh · Khóa ${cohort} · K${cohort}404E` })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Tiếng Anh · Khóa 26 · K26404E" }));
    expect(input).toHaveValue("K26404E");
    fireEvent.click(screen.getByRole("button", { name: "Lưu thông tin" }));
    expect(useSettings.getState().programCode).toBe("K26404E");
  });

  it("auto-resolves old program alias K25414-V2 to K25414H on open", async () => {
    const { useSettings } = await import("@/lib/store");
    useSettings.getState().setProgramProfile("K25414-V2");

    render(<ProgramProfileDialog open={true} onClose={() => {}} />);

    const primaryInput = screen.getByLabelText(/^Ngành chính$/i) as HTMLInputElement;
    expect(primaryInput.value).toBe("K25414H");
  });
});

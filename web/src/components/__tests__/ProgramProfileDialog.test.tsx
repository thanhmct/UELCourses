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
  it("starts closed, switches lists in one click and accepts lowercase code suffixes", async () => {
    render(<ProgramProfileDialog open={true} onClose={() => {}} />);

    const input = document.getElementById("profile-primary")!;
    const secondary = document.getElementById("profile-secondary")!;
    expect(document.getElementById("profile-primary-results")).toBeNull();
    fireEvent.click(input);
    expect(document.getElementById("profile-primary-results")).toHaveClass("absolute");
    fireEvent.pointerDown(secondary);
    fireEvent.click(secondary);
    expect(document.getElementById("profile-primary-results")).toBeNull();
    expect(document.getElementById("profile-secondary-results")).toHaveClass("absolute");
    expect(screen.getByRole("dialog")).toHaveClass("overflow-visible");
    fireEvent.pointerDown(input);
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: "k26405e" } });
    expect(await screen.findByRole("button", { name: "Kế toán · Tiếng Anh · Khóa 26 · K26405E" })).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "k26414h" } });
    expect(await screen.findByRole("button", { name: /Công nghệ tài chính.*Coop.*K26414H/i })).toBeInTheDocument();
  });

  it("groups name results by major, then lets the user select a cohort or look up a full code", async () => {
    render(<ProgramProfileDialog open={true} onClose={() => {}} />);
    const input = screen.getByLabelText(/^Ngành chính$/i);
    fireEvent.change(input, { target: { value: "ke toan" } });
    const major = await screen.findByRole("button", { name: "Kế toán · Cử nhân · 405 · Accounting" });
    expect(screen.queryByRole("button", { name: /K26405/ })).not.toBeInTheDocument();
    fireEvent.click(major);
    fireEvent.click(screen.getByRole("button", { name: "Tiếng Việt · Khóa 26 · K26405" }));
    expect(input).toHaveValue("Khóa 2026, chương trình đào tạo ngành Kế toán, chương trình tiếng Việt.");

    fireEvent.change(input, { target: { value: "K26405E" } });
    expect(screen.getByRole("button", { name: "Kế toán · Tiếng Anh · Khóa 26 · K26405E" })).toBeInTheDocument();
  });

  it("shows the exchange-student button in English and lets the user save without a programme", async () => {
    useLang.getState().setLang("en");
    useSettings.setState({ exchangeStudent: false });
    const onClose = vi.fn();
    render(<ProgramProfileDialog open={true} onClose={onClose} />);

    const btn = screen.getByRole("button", { name: "I am an exchange student at UEL" });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(btn);
    expect(useSettings.getState().exchangeStudent).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Save profile/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(useSettings.getState().programCode).toBe("");
  });

  it("lets any user save without a programme, exchange option or not", async () => {
    useLang.getState().setLang("en");
    useSettings.setState({ exchangeStudent: false });
    const onClose = vi.fn();
    render(<ProgramProfileDialog open={true} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /Save profile/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("still rejects an invalid major code even with nothing else filled in", async () => {
    useLang.getState().setLang("en");
    useSettings.setState({ exchangeStudent: false });
    const onClose = vi.fn();
    render(<ProgramProfileDialog open={true} onClose={onClose} />);

    const input = screen.getByLabelText(/^Primary major$/i);
    fireEvent.change(input, { target: { value: "ZZZ999" } });
    fireEvent.click(screen.getByRole("button", { name: /Save profile/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("hides the exchange-student button in Vietnamese", () => {
    render(<ProgramProfileDialog open={true} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "I am an exchange student at UEL" })).toBeNull();
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
    fireEvent.keyDown(primaryInput, { key: "Enter" });

    await waitFor(() => expect(primaryInput).toHaveValue("Khóa 2025, chương trình đào tạo ngành Kế toán, chương trình tiếng Việt."));
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });

  it("renders English track description for suffix E1", async () => {
    render(<ProgramProfileDialog open={true} onClose={() => {}} />);

    const primaryInput = screen.getByLabelText(/^Ngành chính$/i);
    fireEvent.change(primaryInput, { target: { value: "K23406E1" } });
    fireEvent.keyDown(primaryInput, { key: "Enter" });

    await waitFor(() => expect(primaryInput).toHaveValue("Khóa 2023, chương trình đào tạo ngành Hệ thống thông tin quản lý, chương trình tiếng Anh."));
  });

  it("renders Coop description for suffix H", async () => {
    render(<ProgramProfileDialog open={true} onClose={() => {}} />);

    const primaryInput = screen.getByLabelText(/^Ngành chính$/i);
    fireEvent.change(primaryInput, { target: { value: "K23406H" } });
    fireEvent.keyDown(primaryInput, { key: "Enter" });

    await waitFor(() => expect(primaryInput).toHaveValue("Khóa 2023, ngành Hệ thống thông tin quản lý, chương trình Hợp tác doanh nghiệp."));
  });

  it("fills the English Coop description into the primary input on Enter", async () => {
    useLang.getState().setLang("en");
    render(<ProgramProfileDialog open={true} onClose={() => {}} />);

    const primaryInput = screen.getByLabelText(/^Primary Major$/i);
    fireEvent.change(primaryInput, { target: { value: "K23406H" } });
    fireEvent.keyDown(primaryInput, { key: "Enter" });

    await waitFor(() => expect(primaryInput).toHaveValue(
      "Cohort 2023, Management Information Systems major, Corporate Partnership programme.",
    ));
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });

  it("renders major code fallback when program is not found in API", async () => {
    render(<ProgramProfileDialog open={true} onClose={() => {}} />);

    const primaryInput = screen.getByLabelText(/^Ngành chính$/i);
    fireEvent.change(primaryInput, { target: { value: "K26999A" } });
    fireEvent.keyDown(primaryInput, { key: "Enter" });

    expect(primaryInput).toHaveValue("Khóa 2026, chương trình đào tạo mã ngành 999, chương trình tiếng Việt.");
  });

  it("describes secondary program code similarly", async () => {
    render(<ProgramProfileDialog open={true} onClose={() => {}} />);

    const secondaryInput = screen.getByLabelText(/Ngành học thứ hai/i);
    fireEvent.change(secondaryInput, { target: { value: "K25405A" } });
    fireEvent.keyDown(secondaryInput, { key: "Enter" });

    await waitFor(() => expect(secondaryInput).toHaveValue("Khóa 2025, chương trình đào tạo ngành Kế toán, chương trình tiếng Việt."));
  });

  it("renders Master's programme description and badge for C24601", async () => {
    render(<ProgramProfileDialog open={true} onClose={() => {}} />);

    const primaryInput = screen.getByLabelText(/^Ngành chính$/i);
    fireEvent.change(primaryInput, { target: { value: "C24601" } });
    fireEvent.keyDown(primaryInput, { key: "Enter" });

    await waitFor(() => {
      expect(primaryInput).toHaveValue("Chương trình thạc sĩ ngành Kinh tế chính trị.");
      expect(screen.getByText("Thạc sĩ")).toBeInTheDocument();
    });
  });

  it("renders Doctoral programme description and notice for N25701-1", async () => {
    render(<ProgramProfileDialog open={true} onClose={() => {}} />);

    const primaryInput = screen.getByLabelText(/^Ngành chính$/i);
    fireEvent.change(primaryInput, { target: { value: "N25701-1" } });
    fireEvent.keyDown(primaryInput, { key: "Enter" });

    await waitFor(() => {
      expect(primaryInput).toHaveValue("Chương trình tiến sĩ ngành mã 701.");
      expect(screen.getByText("Tiến sĩ")).toBeInTheDocument();
      expect(screen.queryByText(/Chưa có danh sách học phần/)).not.toBeInTheDocument();
    });
  });

  it("infers the intake and the English-language talent track from an English query", async () => {
    useLang.getState().setLang("en");
    render(<ProgramProfileDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Primary Major"), { target: { value: "Accounting cohort 2026 English Talent" } });
    fireEvent.click(await screen.findByRole("button", { name: /^Accounting · Bachelor's/ }));
    expect(screen.queryByRole("button", { name: /K25405|K26405E$/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "English-language Talent Bachelor’s · Cohort 26 · K26405TE" }));
    expect(screen.getByLabelText("Primary Major")).toHaveValue("Cohort 2026, undergraduate programme in Accounting, English-language Talent Bachelor programme.");
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
    expect(screen.queryByText(/Chưa có danh sách học phần/)).not.toBeInTheDocument();
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
    expect(input).toHaveValue("Khóa 2026, chương trình đào tạo ngành Tài chính - Ngân hàng, chương trình tiếng Anh.");
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

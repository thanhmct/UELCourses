import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ModulesPage from "../page";
import TimetablePage from "../../timetable/page";
import TimetableLayout from "../../timetable/layout";
import { TimetableWorkspace } from "../../timetable/TimetableWorkspace";
import SettingsPage from "../../settings/page";
import { Header } from "@/components/Header";
import { useSettings, useTimetable } from "@/lib/store";
import { useLang } from "@/i18n";
import { api } from "@/lib/api";
import { mockProgram, mockPrograms } from "@/mocks/programs";
import type { ProgramDetail, ProgramSummary } from "@/lib/types";

const mockK25404Summary: ProgramSummary = {
  program_id: "K25404",
  name: "Tài chính - Ngân hàng Khóa 25",
  cohort: "K25",
  faculty: "Khoa Tài chính - Ngân hàng",
  total_credits: 141,
};

const mockK25404Detail: ProgramDetail = {
  program: {
    program_id: "K25404",
    name: "Tài chính - Ngân hàng Khóa 25",
    cohort: "K25",
    faculty: "Khoa Tài chính - Ngân hàng",
    total_credits: 141,
  },
  blocks: [],
};

describe("W6 & W11: Profile filter banner text and real-time synchronization", () => {
  beforeEach(() => {
    // Reset store state
    act(() => {
      useSettings.getState().setProgramProfile("", "");
      useSettings.getState().setCohort("");
      useLang.getState().setLang("vi");
    });
    window.history.replaceState(null, "", "/modules");

    vi.spyOn(api, "programs").mockImplementation(async (f) => {
      const list = mockPrograms(f);
      return { data: [...list, mockK25404Summary], mock: true };
    });

    vi.spyOn(api, "program").mockImplementation(async (id: string) => {
      const norm = id.trim().toUpperCase();
      if (norm === "K25404" || norm === "K25404E") {
        return {
          data: {
            ...mockK25404Detail,
            program: {
              ...mockK25404Detail.program,
              program_id: norm,
              name: norm.endsWith("E")
                ? "Tài chính - Ngân hàng Khóa 25 (Hệ tiếng Anh)"
                : "Tài chính - Ngân hàng Khóa 25",
            },
          },
          mock: true,
        };
      }
      const direct = mockProgram(id);
      if (direct) return { data: direct, mock: true };
      if (id.endsWith("E")) {
        const base = mockProgram(id.slice(0, -1));
        if (base) {
          return {
            data: {
              ...base,
              program: {
                ...base.program,
                program_id: id,
                name: `${base.program.name} (Hệ tiếng Anh)`,
              },
            },
            mock: true,
          };
        }
      }
      return { data: null, mock: true };
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    act(() => {
      useSettings.getState().setProgramProfile("", "");
      useLang.getState().setLang("vi");
    });
    window.history.replaceState(null, "", "/modules");
  });

  it("tra mã học phần ở cả hai trang khi hồ sơ tiến sĩ chưa có danh sách môn", async () => {
    act(() => useSettings.getState().setProgramProfile("9380107"));
    vi.spyOn(api, "modules").mockImplementation(async (filter) => ({
      data: { items: filter?.q === "PKT4001" && filter.degree === "all" && !filter.program_id && !filter.program_ids
        ? [{ code: "PKT4001", name: "Phương pháp thực hiện luận án", credits: 4, type: "Chuyên ngành", has_equivalents: false }] : [], total: 1 },
      mock: false,
    }));
    const { unmount } = render(<ModulesPage />);
    expect(await screen.findByText(/Chưa có danh sách học phần/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Tìm học phần" }), { target: { value: "PKT4001" } });
    expect(await screen.findByRole("link", { name: /PKT4001/ })).toBeInTheDocument();
    unmount();

    render(<TimetablePage />, { wrapper: TimetableLayout });
    expect(await screen.findByText(/Chưa có danh sách học phần/)).toBeInTheDocument();
    const search = screen.getByRole("combobox", { name: /Thêm một hoặc nhiều học phần/ });
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "PKT4001" } });
    expect(await screen.findByText("Phương pháp thực hiện luận án")).toBeInTheDocument();
  });

  it("dùng cùng bộ chọn trong Cài đặt và cập nhật tóm tắt sau khi đổi bậc", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("K25404E");
      useLang.getState().setLang("en");
    });
    render(<SettingsPage />);
    const profile = within(screen.getByRole("region", { name: "Your Degree Programme" }));
    expect(await profile.findByText(/Cohort 2025, undergraduate programme in Finance/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Choose or type a major")).not.toBeInTheDocument();
    fireEvent.click(profile.getByRole("button", { name: "Change" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("Primary Major"), { target: { value: "doctoral economic law" } });
    fireEvent.click(await dialog.findByRole("button", { name: /^Economic Law · Doctorate/ }));
    fireEvent.click(dialog.getByRole("button", { name: "Save profile" }));

    expect(profile.getByText("Doctoral programme in Economic Law.")).toBeInTheDocument();
    expect(profile.getByText("9380107")).toBeInTheDocument();
    expect(profile.queryByText(/Cohort 2025/)).not.toBeInTheDocument();
    expect(screen.getByText(/Cohort for academic regulations/).closest("details")).not.toHaveAttribute("open");
  });

  it("updates module filter banner and reloads without remounting when programCode changes in useSettings", async () => {
    // 1. Initial render with K25404E
    act(() => {
      useSettings.getState().setProgramProfile("K25404E");
    });

    render(
      <>
        <Header />
        <ModulesPage />
      </>
    );

    // Should display K25404E with major name (Tài chính - Ngân hàng, hệ tiếng Anh) in filter banner
    await waitFor(() => {
      const banner = screen.getByText(
        /Chương trình đào tạo ngành Tài chính - Ngân hàng khóa 25, chương trình tiếng Anh/i,
      );
      expect(banner).toBeInTheDocument();
    });

    // 2. Change program code in store to K23406 (without remounting the page)
    act(() => {
      useSettings.getState().setProgramProfile("K23406");
    });

    // Banner should update immediately to K23406 (Hệ thống thông tin quản lý)
    await waitFor(() => {
      const banner = screen.getByText(/Chương trình đào tạo ngành Hệ thống thông tin quản lý khóa 23/i);
      expect(banner).toBeInTheDocument();
      expect(screen.queryByText(/Tài chính - Ngân hàng khóa 25/i)).not.toBeInTheDocument();
    });

    // 3. Add secondary major K25404E to K23406
    act(() => {
      useSettings.getState().setProgramProfile("K23406", "K25404E");
    });

    // Banner should update immediately showing both programs with primary/secondary badges
    await waitFor(() => {
      expect(screen.getByText(/Hệ thống thông tin quản lý khóa 23/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Tài chính - Ngân hàng khóa 25, chương trình tiếng Anh/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/\(Ngành chính\)/i)).toBeInTheDocument();
      expect(screen.getByText(/\(Ngành 2\)/i)).toBeInTheDocument();
    });
  });

  it("clears URL ?program= override and prioritizes new profile when user updates program profile", async () => {
    // Initial visit with ?program=K24406
    window.history.replaceState(null, "", "/modules?program=K24406");
    act(() => {
      useSettings.getState().setProgramProfile("K23406");
    });

    render(
      <>
        <Header />
        <ModulesPage />
      </>
    );

    // URL override K24406 should be prioritized initially
    await waitFor(() => {
      const banner = screen.getByText(/Hệ thống thông tin quản lý khóa 24/i);
      expect(banner).toBeInTheDocument();
    });

    // User updates their profile in dialog/settings to K25404E
    act(() => {
      useSettings.getState().setProgramProfile("K25404E");
    });

    // URL override should be cleared, switching to the user's new profile
    await waitFor(() => {
      const banner = screen.getByText(
        /Chương trình đào tạo ngành Tài chính - Ngân hàng khóa 25, chương trình tiếng Anh/i,
      );
      expect(banner).toBeInTheDocument();
      expect(screen.queryByText(/Hệ thống thông tin quản lý khóa 24/i)).not.toBeInTheDocument();
    });
    expect(window.location.search).not.toContain("program=");
  });

  it("falls back to 'mã ngành 404' when program name is not available in catalog or API", async () => {
    vi.spyOn(api, "programs").mockResolvedValue({ data: [], mock: true });
    vi.spyOn(api, "program").mockResolvedValue({ data: null, mock: true });

    act(() => {
      useSettings.getState().setProgramProfile("K25404E");
    });

    render(
      <>
        <Header />
        <ModulesPage />
      </>
    );

    await waitFor(() => {
      const banner = screen.getByText(
        /Chương trình đào tạo mã ngành 404 khóa 25, chương trình tiếng Anh/i,
      );
      expect(banner).toBeInTheDocument();
    });
  });

  it("preserves timetable track across routes and resets it when the secondary major is removed", async () => {
    // 1. Initial profile with primary and secondary
    act(() => {
      useSettings.getState().setProgramProfile("K25404E", "K24406");
      useTimetable.getState().setSemester("2026-2027-1");
    });

    const { rerender } = render(<TimetablePage />, { wrapper: TimetableLayout });

    // Track mode buttons should be visible
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Ngành 1" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Ngành 2" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cả hai" })).toBeInTheDocument();
    });

    // User selects "Cả hai" mode
    const bothBtn = screen.getByRole("button", { name: "Cả hai" });
    fireEvent.click(bothBtn);
    expect(bothBtn).toHaveAttribute("aria-pressed", "true");

    rerender(<TimetableWorkspace view="optimize" onSaved={vi.fn()} />);
    expect(screen.queryByRole("heading", { name: "Tối ưu lịch học" })).not.toBeInTheDocument();
    rerender(<TimetablePage />);
    expect(screen.getByRole("button", { name: "Cả hai" })).toHaveAttribute("aria-pressed", "true");

    // 2. User removes secondary major (sets secondary to "")
    act(() => {
      useSettings.getState().setProgramProfile("K25404E", "");
    });

    // The secondary buttons should be gone, and mode reverted to primary
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Cả hai" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Ngành 2" })).not.toBeInTheDocument();
    });
  });

  it("renders full banner sentence for standard track (K24414)", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("K24414");
    });

    render(
      <>
        <Header />
        <ModulesPage />
      </>
    );

    await waitFor(() => {
      expect(
        screen.getByText("Chương trình đào tạo ngành Công nghệ tài chính khóa 24"),
      ).toBeInTheDocument();
    });
  });

  it("renders full banner sentence for Talent track (T)", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("K24404T");
    });

    render(
      <>
        <Header />
        <ModulesPage />
      </>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Tài chính - Ngân hàng khóa 24, chương trình Cử nhân tài năng/i),
      ).toBeInTheDocument();
    });
  });

  it("renders full banner sentence for Coop track (H)", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("K23406H");
    });

    render(
      <>
        <Header />
        <ModulesPage />
      </>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Hệ thống thông tin quản lý khóa 23, Coop Khóa 23/i),
      ).toBeInTheDocument();
    });
  });

  it("renders full banner sentences for primary and secondary majors with labels", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("K24414", "K23406");
    });

    render(
      <>
        <Header />
        <ModulesPage />
      </>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Công nghệ tài chính khóa 24/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Hệ thống thông tin quản lý khóa 23/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/\(Ngành chính\)/i)).toBeInTheDocument();
      expect(screen.getByText(/\(Ngành 2\)/i)).toBeInTheDocument();
    });
  });

  it("renders banner in English (EN) mode", async () => {
    act(() => {
      useLang.getState().setLang("en");
      useSettings.getState().setProgramProfile("K24414");
    });

    render(
      <>
        <Header />
        <ModulesPage />
      </>
    );

    await waitFor(() => {
      expect(
        screen.getByText("Undergraduate programme in Financial Technology, cohort 24"),
      ).toBeInTheDocument();
    });
  });

  it("renders secondary major in English (EN) mode with primary and secondary badges", async () => {
    act(() => {
      useLang.getState().setLang("en");
      useSettings.getState().setProgramProfile("K24414", "K23406");
    });

    render(
      <>
        <Header />
        <ModulesPage />
      </>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Financial Technology, cohort 24/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Management Information Systems, cohort 23/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/\(Primary Major\)/i)).toBeInTheDocument();
      expect(screen.getByText(/\(Second Major\)/i)).toBeInTheDocument();
    });
  });

  it("Brief W16: nút Đổi mở hộp thoại pop-up (role=dialog) ngay trên trang, URL không đổi, lưu xong cập nhật thanh lọc không reload", async () => {
    act(() => {
      useSettings.getState().setProgramProfile("K24414");
    });

    render(
      <>
        <Header />
        <ModulesPage />
      </>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Công nghệ tài chính/i).length).toBeGreaterThan(0);
    });

    const initialUrl = window.location.href;

    // Bấm nút "Đổi"
    const changeBtn = screen.getByRole("button", { name: /Đổi/i });
    fireEvent.click(changeBtn);

    // Hộp thoại pop-up xuất hiện với role="dialog", URL không đổi
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(window.location.href).toBe(initialUrl);

    // Nhập mã lớp mới K23406 vào ô ngành chính
    const primaryInput = within(dialog).getByLabelText(/^Ngành chính$/i);
    fireEvent.change(primaryInput, { target: { value: "K23406" } });

    // Bấm Lưu
    const saveBtn = within(dialog).getByRole("button", { name: /Lưu thông tin/i });
    fireEvent.click(saveBtn);

    // Hộp thoại đóng lại
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Thanh lọc cập nhật sang K23406 (Hệ thống thông tin quản lý khóa 23) mà không tải lại trang
    await waitFor(() => {
      expect(screen.getAllByText(/Hệ thống thông tin quản lý/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Khóa 23/i).length).toBeGreaterThan(0);
    });
  });
});

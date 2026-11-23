import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppFooter } from "../AppFooter";
import TodayPage from "@/app/today/page";
import { useLang } from "@/i18n";
import { useTimetable } from "@/lib/store";

vi.mock("@/lib/api", () => ({
  api: {
    classes: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

vi.mock("@/lib/useMounted", () => ({
  useMounted: () => true,
}));

describe("W7: Footer and Today tab leftover requirements", () => {
  beforeEach(() => {
    act(() => {
      useLang.getState().setLang("vi");
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    act(() => {
      useLang.getState().setLang("vi");
    });
  });

  describe("AppFooter", () => {
    it("không chứa câu nhắc đến NUSMods trong tiếng Việt", async () => {
      act(() => {
        useLang.getState().setLang("vi");
      });
      render(<AppFooter />);

      await waitFor(() => {
        const footer = screen.getByRole("contentinfo");
        expect(footer).toBeInTheDocument();
        expect(footer.textContent).not.toContain("NUSMods");
        expect(footer.textContent).not.toContain("cảm hứng");
        expect(footer.textContent).toContain("UELPATH");
        expect(footer.textContent).toContain("dự án khóa luận");
      });
    });

    it("không chứa câu nhắc đến NUSMods trong tiếng Anh", async () => {
      act(() => {
        useLang.getState().setLang("en");
      });
      render(<AppFooter />);

      await waitFor(() => {
        const footer = screen.getByRole("contentinfo");
        expect(footer).toBeInTheDocument();
        expect(footer.textContent).not.toContain("NUSMods");
        expect(footer.textContent).not.toContain("inspired");
        expect(footer.textContent).toContain("UELPATH");
        expect(footer.textContent).toContain("graduation thesis project");
      });
    });
  });

  describe("TodayPage", () => {
    it("không hiển thị today.subtitle hoặc mô tả phụ tương tự", async () => {
      act(() => {
        useTimetable.getState().setSemester("2026_1");
      });

      render(<TodayPage />);

      await waitFor(() => {
        // Page title is displayed
        expect(screen.getByText("Lịch học hôm nay")).toBeInTheDocument();

        // Subtitle is NOT rendered anywhere in the document
        expect(
          screen.queryByText(/Xem nhanh các tiết học trong ngày/i),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText(/Quick overview of today's schedule/i),
        ).not.toBeInTheDocument();
        expect(screen.queryByText(/today\.subtitle/i)).not.toBeInTheDocument();
      });
    });
  });
});

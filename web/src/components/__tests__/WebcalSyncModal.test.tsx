import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebcalSyncModal } from "../WebcalSyncModal";
import { useLang } from "@/i18n";
import { encodeTimetable, type SharedTimetable } from "@/lib/shareUrl";

const sampleData: SharedTimetable = {
  semester: "2026-2027-1",
  entries: [{ code: "BAA1001", class_code: "BAA1001.01", hidden: false }],
};

describe("WebcalSyncModal", () => {
  beforeEach(() => {
    useLang.getState().setLang("vi");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useLang.getState().setLang("vi");
  });

  it("does not render when closed", () => {
    render(
      <WebcalSyncModal
        open={false}
        onClose={vi.fn()}
        sharedData={sampleData}
        semName="HK1 2026-2027"
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders Google Calendar deep-link, .ics download link, webcal link, and Samsung instructions", () => {
    render(
      <WebcalSyncModal
        open={true}
        onClose={vi.fn()}
        sharedData={sampleData}
        semName="HK1 2026-2027"
      />,
    );

    const expectedQuery = encodeTimetable(sampleData);
    const expectedPath = `/api/webcal?${expectedQuery}&name=${encodeURIComponent("UELPATH HK1 2026-2027")}`;
    const expectedWebcal = `webcal://${window.location.host}${expectedPath}`;
    const expectedHttps = `${window.location.protocol}//${window.location.host}${expectedPath}`;

    const googleLink = screen.getByRole("link", { name: "Thêm vào Google Calendar" });
    expect(googleLink).toHaveAttribute(
      "href",
      `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(expectedWebcal)}`,
    );

    const downloadLink = screen.getByRole("link", { name: "Tải file .ics" });
    expect(downloadLink).toHaveAttribute("href", `${expectedHttps}&dl=1`);
    expect(downloadLink).toHaveAttribute("download", "UELPATH-timetable.ics");

    const openDirectLink = screen.getByRole("link", { name: "Mở trực tiếp bằng Apple / Outlook" });
    expect(openDirectLink).toHaveAttribute("href", expectedWebcal);

    expect(screen.getByText("Samsung Calendar / Nhập file (.ics):")).toBeInTheDocument();
    expect(screen.getByText(/Lịch Samsung/)).toBeInTheDocument();
  });

  it("renders English labels when language is set to en", () => {
    useLang.getState().setLang("en");

    render(
      <WebcalSyncModal
        open={true}
        onClose={vi.fn()}
        sharedData={sampleData}
        semName="Term 1 2026-2027"
      />,
    );

    expect(screen.getByRole("link", { name: "Add to Google Calendar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download .ics" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open directly in Apple / Outlook" })).toBeInTheDocument();
    expect(screen.getByText("Samsung Calendar / Import (.ics):")).toBeInTheDocument();
  });
});

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EquivalentsPage from "../page";
import { useSettings } from "@/lib/store";
import { useLang } from "@/i18n";
import { api } from "@/lib/api";
import type { EquivalentItem } from "@/lib/types";

const mockEquivalentsData: EquivalentItem[] = [
  {
    code: "KTE1001",
    name: "Kinh tế vi mô",
    name_en: "Microeconomics",
    credits: 3,
    equivalents: [{ code: "KTE1001E", name: "Microeconomics", name_en: "Microeconomics", credits: 3 }],
  },
  {
    code: "LUA1001",
    name: "Pháp luật đại cương",
    name_en: "General Law",
    credits: 2,
    equivalents: [{ code: "LUA1000", name: "Lý luận nhà nước và pháp luật", credits: 3 }],
  },
  {
    code: "MIS1001",
    name: "Nhập môn HTTT",
    name_en: "Intro to MIS",
    credits: 3,
    equivalents: [
      { code: "MIS1002", name: "Cơ sở HTTT", credits: 3 },
      { code: "MIS9999", name: "Môn ngoài trường", credits: 3 },
    ],
  },
];

describe("Equivalent modules do not inherit the programme filter", () => {
  beforeEach(() => {
    act(() => {
      useSettings.getState().setProgramProfile("K24401A");
      useLang.getState().setLang("vi");
    });
    vi.spyOn(api, "equivalents").mockImplementation((q) => {
      const needle = q?.toLowerCase();
      const data = !needle
        ? mockEquivalentsData
        : mockEquivalentsData.filter(
            (group) =>
              group.code.toLowerCase().includes(needle) ||
              group.name.toLowerCase().includes(needle) ||
              group.equivalents.some((item) => item.code.toLowerCase().includes(needle)),
          );
      return Promise.resolve({ data, mock: true });
    });
    vi.spyOn(api, "program");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows every equivalent group even when a programme is selected", async () => {
    render(<EquivalentsPage />);

    const table = await screen.findByRole("table");
    for (const code of ["KTE1001", "KTE1001E", "LUA1001", "LUA1000", "MIS1001", "MIS1002", "MIS9999"]) {
      expect(within(table).getByText(code)).toBeInTheDocument();
    }
    expect(screen.queryByText("Trong CTĐT")).not.toBeInTheDocument();
    expect(api.program).not.toHaveBeenCalled();
  });

  it("changing the selected programme does not change the results", async () => {
    render(<EquivalentsPage />);
    expect(await screen.findByText("KTE1001")).toBeInTheDocument();

    act(() => useSettings.getState().setProgramProfile("K24409A"));

    expect(screen.getByText("KTE1001")).toBeInTheDocument();
    expect(screen.getByText("LUA1001")).toBeInTheDocument();
    expect(screen.getByText("MIS1001")).toBeInTheDocument();
    expect(api.program).not.toHaveBeenCalled();
  });

  it("keeps bilingual search independent from the programme", async () => {
    useLang.getState().setLang("en");
    render(<EquivalentsPage />);

    const input = screen.getByRole("textbox", { name: /search/i });
    fireEvent.change(input, { target: { value: "MIS1001" } });

    await waitFor(() => {
      expect(screen.getByText("MIS1001")).toBeInTheDocument();
      expect(screen.queryByText("KTE1001")).not.toBeInTheDocument();
    });
  });
});

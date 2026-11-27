import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useLang } from "@/i18n";
import { TimetableTable } from "../TimetableTable";
import type { GridBlock } from "../TimetableGrid";

const lesson = {
  weekday: 5,
  start_period: 7,
  end_period: 9,
  start_time: "12:30",
  end_time: "15:05",
  room: "A.310",
  date_start: "2026-08-26",
  date_end: "2026-08-26",
};
const block: GridBlock = {
  key: "BBB1067#0",
  code: "BBB1067",
  name: "Phân tích dữ liệu",
  class_code: "261BBB106708",
  color: "#0f766e",
  conflict: false,
  section: { class_code: "261BBB106708", module_code: "BBB1067", lecturer: "An", lessons: [lesson] },
  lesson,
};

afterEach(() => {
  cleanup();
  useLang.getState().setLang("vi");
});

describe("TimetableTable", () => {
  it("renders the room row and weekday column for a block with a room", () => {
    render(<TimetableTable blocks={[block]} />);
    expect(screen.getByText("A.310")).toBeInTheDocument();
    expect(screen.getByText("BBB1067")).toBeInTheDocument();
  });

  it("keeps rendering after repeated mount/unmount cycles (toggling the view setting back and forth)", () => {
    for (let i = 0; i < 5; i++) {
      const { unmount } = render(<TimetableTable blocks={[block]} />);
      expect(screen.getByText("A.310")).toBeInTheDocument();
      expect(screen.getByText("BBB1067")).toBeInTheDocument();
      unmount();
    }
  });

  it("still renders a header when no block has a room", () => {
    const noRoom: GridBlock = { ...block, lesson: { ...lesson, room: "" } };
    render(<TimetableTable blocks={[noRoom]} />);
    expect(screen.getByText("Phòng")).toBeInTheDocument();
  });
});

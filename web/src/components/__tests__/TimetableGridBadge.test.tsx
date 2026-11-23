import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLang } from "@/i18n";
import { TimetableGrid, type GridBlock } from "../TimetableGrid";

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
const first: GridBlock = {
  key: "BBB1067#0",
  code: "BBB1067",
  name: "Phân tích dữ liệu",
  class_code: "261BBB106708",
  color: "#0f766e",
  conflict: false,
  section: { class_code: "261BBB106708", module_code: "BBB1067", lecturer: "An", lessons: [lesson] },
  lesson,
};
const secondLesson = { ...lesson, room: "B1.202", date_start: "2026-09-09", date_end: "2026-10-21" };
const second: GridBlock = {
  ...first,
  key: "BBB1067#1",
  lesson: secondLesson,
  section: { class_code: first.class_code, module_code: first.code, lecturer: "Bình", lessons: [secondLesson] },
};

function renderGrid() {
  render(
    <TimetableGrid
      blocks={[first, second]}
      alternatives={{
        [first.code]: [{ class_code: "261BBB106709", module_code: first.code, lessons: [{ ...lesson, weekday: 6 }] }],
      }}
      colors={{}}
      onChangeClass={vi.fn()}
    />,
  );
  return screen.getByText("+1", { selector: "button" });
}

describe("Bảng lịch gộp trên nhãn +N", () => {
  let badgeTop: number;

  beforeEach(() => {
    useLang.getState().setLang("vi");
    badgeTop = 350;
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(360);
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(480);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.getAttribute("role") === "region") return new DOMRect(0, 0, 360, 480);
      if (this.getAttribute("role") === "tooltip") return new DOMRect(0, 0, 210, 120);
      return new DOMRect(210, badgeTop, 22, 16);
    });
  });

  afterEach(() => {
    cleanup();
    useLang.getState().setLang("vi");
    vi.restoreAllMocks();
  });

  it("hiện đủ lịch khi hover, giữ bảng khi rê vào để cuộn và đóng khi rời bảng", () => {
    const badge = renderGrid();
    const body = screen.getByRole("button", { name: /BBB1067 lớp 261BBB106708/ });
    fireEvent.mouseEnter(body);
    fireEvent.mouseLeave(body, { relatedTarget: badge });
    fireEvent.mouseEnter(badge);

    const preview = screen.getByRole("tooltip");
    expect(preview.parentElement).toBe(document.body);
    expect(preview).toHaveClass("overflow-auto");
    expect(preview).toHaveStyle({ top: "230px" });
    badgeTop = 16;
    fireEvent.scroll(screen.getByRole("region"));
    expect(preview).toHaveStyle({ top: "32px" });
    expect(preview).toHaveTextContent("BBB1067 · Phân tích dữ liệu");
    expect(preview).not.toHaveTextContent("261BBB106708");
    const rows = within(preview).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("26/08/2026 · Phòng A.310");
    expect(rows[0]).toHaveTextContent("Thứ 5 · Tiết 7–9 (12:30–15:05)");
    expect(rows[0]).toHaveTextContent("Giảng viên An");
    expect(rows[1]).toHaveTextContent("09/09/2026–21/10/2026 · Phòng B1.202");
    expect(rows[1]).toHaveTextContent("Giảng viên Bình");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.mouseLeave(badge, { relatedTarget: preview });
    expect(preview).toBeInTheDocument();
    fireEvent.mouseLeave(preview);
    expect(preview).not.toBeInTheDocument();

    fireEvent.mouseEnter(badge);
    fireEvent.mouseLeave(badge);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.click(body);
    expect(body).toHaveAttribute("aria-pressed", "true");
    expect(body).toHaveClass("timetable-block-selected");
    expect(screen.getByTestId("ghost-block-261BBB106709")).toBeInTheDocument();
  });

  it("không có bảng nổi khi mỗi buổi của cùng một lớp có ô riêng", () => {
    const separate = { ...second, lesson: { ...second.lesson, weekday: 6 } };
    const halfPeriod = { ...first, lesson: { ...lesson, start_period: 2, end_period: 5.5, start_time: "", end_time: "" } };
    render(<TimetableGrid blocks={[halfPeriod, separate]} alternatives={{}} colors={{}} onChangeClass={vi.fn()} />);
    const blocks = screen.getAllByRole("button", { name: /BBB1067 lớp 261BBB106708/ });
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toHaveTextContent("07:50–11:50");
    expect(blocks[0]).not.toHaveTextContent(first.class_code);
    for (const block of blocks) {
      fireEvent.mouseEnter(block);
      fireEvent.focus(block);
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    }
  });

  it("hiện bảng tiếng Anh khi focus và đóng bằng Escape", () => {
    useLang.getState().setLang("en");
    const badge = renderGrid();
    expect(screen.queryByText("Day / Period")).not.toBeInTheDocument();
    fireEvent.focus(badge);
    const preview = screen.getByRole("tooltip");
    expect(badge).toHaveAttribute("aria-describedby", preview.id);
    expect(badge).toHaveAccessibleName("More schedules for class 261BBB106708");
    expect(preview).toHaveTextContent("Thursday · Periods 7–9 (12:30–15:05)");
    expect(preview).toHaveTextContent("Room A.310");
    expect(preview).toHaveTextContent("Lecturer Bình");

    fireEvent.keyDown(badge, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(badge).not.toHaveAttribute("aria-describedby");
  });

  it("bật tắt bảng khi chạm nhãn và đóng khi chạm ra ngoài", () => {
    const badge = renderGrid();
    const tap = () => fireEvent(badge, Object.assign(new MouseEvent("click", { bubbles: true }), { pointerType: "touch" }));

    tap();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    tap();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    tap();
    fireEvent.pointerDown(screen.getByRole("tooltip"));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("chạm thân khối chỉ chọn lớp dù trình duyệt chuyển focus sang khối", () => {
    renderGrid();
    const block = screen.getByRole("button", { name: /BBB1067 lớp 261BBB106708/ });
    fireEvent(block, Object.assign(new MouseEvent("pointerdown", { bubbles: true }), { pointerType: "touch" }));
    fireEvent.mouseEnter(block);
    fireEvent.focus(block);
    fireEvent.click(block);
    expect(block).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("ghost-block-261BBB106709")).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

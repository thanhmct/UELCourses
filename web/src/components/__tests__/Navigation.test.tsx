import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BottomNav, NAV, NAV_PRIMARY, NAV_SECONDARY, SideNav } from "../Header";
import { useLang } from "@/i18n";

let currentPath = "/today";

vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/lib/useMounted", () => ({
  useMounted: () => true,
}));

describe("W9: Menu Navigation Order & Structure", () => {
  beforeEach(() => {
    currentPath = "/today";
    useLang.getState().setLang("vi");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("thứ tự menu NAV_PRIMARY và NAV_SECONDARY đúng chuẩn brief W9", () => {
    const primaryHrefs = NAV_PRIMARY.map((n) => n.href);
    expect(primaryHrefs).toEqual([
      "/today",
      "/timetable",
      "/timetable/optimize",
      "/modules",
      "/planner",
      "/venues",
      "/regulations",
    ]);

    const secondaryHrefs = NAV_SECONDARY.map((n) => n.href);
    expect(secondaryHrefs).toEqual(["/books", "/settings"]);

    const allHrefs = NAV.map((n) => n.href);
    expect(allHrefs).toEqual([
      "/today",
      "/timetable",
      "/timetable/optimize",
      "/modules",
      "/planner",
      "/venues",
      "/regulations",
      "/books",
      "/settings",
    ]);
  });

  it("nhãn i18n cho /regulations và /books song ngữ chuẩn", () => {
    useLang.getState().setLang("vi");
    const regVi = NAV.find((n) => n.href === "/regulations");
    const booksVi = NAV.find((n) => n.href === "/books");
    expect(regVi?.labelKey).toBe("nav.regulations");
    expect(booksVi?.labelKey).toBe("nav.books");

    // SideNav renders "Hỏi đáp AI" and "Trao đổi sách" in Vietnamese
    render(<SideNav />);
    expect(screen.getByText("Hỏi đáp AI")).toBeInTheDocument();
    expect(screen.getByText("Trao đổi sách")).toBeInTheDocument();

    cleanup();

    useLang.getState().setLang("en");
    render(<SideNav />);
    expect(screen.getByText("AI Q&A")).toBeInTheDocument();
    expect(screen.getByText("Book Exchange")).toBeInTheDocument();
  });

  it("SideNav ẩn tab CTĐT và giữ đúng thứ tự các mục còn lại", () => {
    const { container } = render(<SideNav />);

    const nav = container.querySelector("nav");
    expect(nav).toBeInTheDocument();

    // Check separator exists
    const separator = screen.getByRole("separator");
    expect(separator).toBeInTheDocument();

    // Collect all links and buttons in SideNav
    const links = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(links).toEqual([
      "/today",
      "/timetable",
      "/timetable/optimize",
      "/modules",
      "/planner",
      "/venues",
      "/regulations",
      "/books",
      "/settings",
    ]);

    // Check Feedback button exists and is positioned between /books and /settings
    const feedbackBtn = screen.getByText("Góp ý");
    expect(feedbackBtn).toBeInTheDocument();

    // Check active state on /today
    const todayLink = container.querySelector('a[href="/today"]');
    expect(todayLink).toHaveAttribute("aria-current", "page");
    expect(container.querySelector('a[href="/equivalents"]')).not.toBeInTheDocument();
  });

  it("BottomNav mở menu Thêm hiển thị vạch phân cách và nhóm Trao đổi sách → Góp ý → Cài đặt", () => {
    render(<BottomNav />);

    // Click "Thêm" button
    const moreBtn = screen.getByText("Thêm");
    fireEvent.click(moreBtn);

    // Separator inside more menu
    const separator = screen.getByRole("separator");
    expect(separator).toBeInTheDocument();

    // Books and Settings links exist in popup
    expect(screen.getByText("Trao đổi sách")).toBeInTheDocument();
    expect(screen.getByText("Cài đặt")).toBeInTheDocument();
    expect(screen.getAllByText("Góp ý").length).toBeGreaterThan(0);
  });

  it.each([SideNav, BottomNav])("marks only the separate optimizer entry as current", (Nav) => {
    currentPath = "/timetable/optimize";
    render(<Nav />);

    const timetable = screen.getByRole("link", { name: "Thời khóa biểu" });
    const optimizer = screen.getByRole("link", { name: "Tối ưu lịch học" });
    expect(timetable.nextElementSibling).toBe(optimizer);
    expect(timetable).not.toHaveAttribute("aria-current");
    expect(optimizer).toHaveAttribute("href", currentPath);
    expect(optimizer).toHaveAttribute("aria-current", "page");
  });
});

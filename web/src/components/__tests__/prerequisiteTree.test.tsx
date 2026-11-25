import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrerequisiteTree } from "../PrerequisiteTree";
import { api } from "@/lib/api";
import type { ModuleTreeNode } from "@/lib/types";

vi.mock("@/lib/api", () => ({ api: { moduleTree: vi.fn() } }));

function course(code: string, children: ModuleTreeNode[] = []): ModuleTreeNode {
  return { code, name: code, type: "previous", children };
}

describe("PrerequisiteTree", () => {
  afterEach(cleanup);

  it("loads both directions within the selected program and switches to a vertical layout", async () => {
    vi.mocked(api.moduleTree).mockImplementation(async (code, options) => ({
      mock: false,
      data: course(code, [course(options?.direction === "prereq" ? "BEFORE" : "AFTER")]),
    }));
    render(<PrerequisiteTree code="BIM5022" programId="K24406" />);
    const loading = screen.getByRole("status");
    expect(loading).toHaveTextContent("chờ xíu nhe");
    expect(loading).toHaveClass("font-sans", "text-[1.75rem]");
    expect(within(loading).getByText("🐣")).toHaveClass("text-4xl", "motion-safe:animate-bounce");
    expect(await screen.findByRole("link", { name: "BEFORE" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AFTER" })).toBeInTheDocument();
    expect(api.moduleTree).toHaveBeenCalledWith("BIM5022", { program_id: "K24406", direction: "prereq", depth: 1 });
    expect(api.moduleTree).toHaveBeenCalledWith("BIM5022", { program_id: "K24406", direction: "unlocks", depth: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Xem dọc" }));
    expect(screen.getByRole("region", { name: /Sơ đồ quan hệ/ })).toHaveClass("relation-vertical");
    expect(screen.getByRole("button", { name: "Xem ngang" })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers both modes and pages long sibling lists at the root and deeper levels", async () => {
    const later = Array.from({ length: 9 }, (_, i) => course(`AFTER${i + 1}`));
    later[0].children = Array.from({ length: 6 }, (_, i) => course(`DEEP${i + 1}`));
    vi.mocked(api.moduleTree).mockImplementation(async (code, options) => ({
      mock: false,
      data: course(code, options?.direction === "prereq" ? [course("BEFORE", [course("EARLIER")])] : later),
    }));
    render(<PrerequisiteTree code="BIM5022" />);

    await screen.findByRole("link", { name: "AFTER1" });
    const mode = screen.getByRole("combobox", { name: "Chế độ hiển thị cây học phần" });
    expect(mode).toHaveTextContent("Môn trước và sau trực tiếp");
    fireEvent.click(mode);
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Môn trước và sau trực tiếp", "Hiển thị toàn bộ"]);
    fireEvent.click(mode);
    expect(screen.queryByRole("link", { name: "DEEP1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "EARLIER" })).not.toBeInTheDocument();

    fireEvent.click(mode);
    fireEvent.click(screen.getByRole("button", { name: "Hiển thị toàn bộ" }));
    expect(await screen.findByRole("link", { name: "EARLIER" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "DEEP4" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /Sơ đồ quan hệ/ })).toHaveClass("overflow-auto");
    expect(api.moduleTree).toHaveBeenCalledWith("BIM5022", expect.objectContaining({ direction: "prereq", depth: 30 }));
    expect(api.moduleTree).toHaveBeenCalledWith("BIM5022", expect.objectContaining({ direction: "unlocks", depth: 30 }));

    const nextPage = (name: string) => within(screen.getByRole("group", { name })).getByRole("button", { name: "Trang sau" });
    fireEvent.click(nextPage("AFTER1"));
    expect(screen.getByRole("link", { name: "DEEP6" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "DEEP1" })).not.toBeInTheDocument();
    fireEvent.click(nextPage("Môn học sau"));
    fireEvent.click(nextPage("Môn học sau"));
    expect(screen.getByRole("link", { name: "AFTER9" })).toBeInTheDocument();
    expect(nextPage("Môn học sau")).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(mode);
    fireEvent.click(screen.getByRole("button", { name: "Môn trước và sau trực tiếp" }));
    expect(await screen.findByRole("link", { name: "AFTER1" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "EARLIER" })).not.toBeInTheDocument();
  });
});

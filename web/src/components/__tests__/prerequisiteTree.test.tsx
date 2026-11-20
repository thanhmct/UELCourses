import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PrerequisiteTree } from "../PrerequisiteTree";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({ api: { moduleTree: vi.fn(async (code: string, options: { direction: string }) => ({ mock: false, data: { code, name: code, type: "module", children: [{ code: options.direction === "prereq" ? "BEFORE" : "AFTER", name: "Môn liên quan", type: "previous", children: [] }] } })) } }));

describe("PrerequisiteTree", () => {
  it("loads both directions within the selected program and switches to a vertical layout", async () => {
    render(<PrerequisiteTree code="BIM5022" currentName="Phân tích hệ thống" programId="K24406" />);
    await waitFor(() => expect(screen.getByRole("link", { name: "BEFORE" })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "AFTER" })).toBeInTheDocument();
    expect(api.moduleTree).toHaveBeenCalledWith("BIM5022", { program_id: "K24406", direction: "prereq", depth: 8 });
    expect(api.moduleTree).toHaveBeenCalledWith("BIM5022", { program_id: "K24406", direction: "unlocks", depth: 8 });
    fireEvent.click(screen.getByRole("button", { name: "Xem dọc" }));
    expect(screen.getByRole("region", { name: /Sơ đồ quan hệ/ })).toHaveClass("relation-vertical");
    expect(screen.getByRole("button", { name: "Xem ngang" })).toHaveAttribute("aria-pressed", "true");
  });
});

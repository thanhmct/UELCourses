import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampusMap } from "@/components/CampusMap";
import { useLang } from "@/i18n";

describe("CampusMap", () => {
  afterEach(() => {
    cleanup();
    useLang.setState({ lang: "vi" });
    localStorage.removeItem("uelcourses-lang");
  });

  it("renders all six interactive campus places", () => {
    const { container } = render(<CampusMap target={null} />);

    expect(container.querySelectorAll("g[data-place]")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Tòa nhà A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cổng chính" })).toBeInTheDocument();
  });

  it("marks B1 as the active place", () => {
    render(<CampusMap target="B1" />);

    expect(screen.getByRole("button", { name: "Tòa nhà B1" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("button", { name: "Tòa nhà B1" })).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("zooms to the sports area and can reset to the full view", () => {
    const { container } = render(<CampusMap target="sports" />);

    expect(container.querySelector("svg")).toHaveAttribute("data-zoomed", "true");
    expect(container.querySelector('[data-map-layer="campus"]')).toHaveAttribute(
      "data-zoom",
      "sports",
    );

    fireEvent.click(screen.getByRole("button", { name: "Toàn cảnh" }));
    expect(container.querySelector("svg")).toHaveAttribute("data-zoomed", "false");
  });

  it("calls onPick when a place receives Enter", () => {
    const onPick = vi.fn();
    render(<CampusMap target={null} onPick={onPick} />);

    fireEvent.keyDown(screen.getByRole("button", { name: "Khu nhà xe" }), {
      key: "Enter",
    });
    expect(onPick).toHaveBeenCalledWith("parking");
  });

  it("shows English place labels in English mode", async () => {
    useLang.setState({ lang: "en" });
    render(<CampusMap target="A" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Building A" })).toBeInTheDocument();
    });
  });
});

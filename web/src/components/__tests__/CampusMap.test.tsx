import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampusMap } from "@/components/CampusMap";
import { useLang } from "@/i18n";
import { CAMPUS_PLACES } from "@/lib/campusPlaces";
import { CAMPUS_MAP_FULL_VIEW } from "@/lib/campusMapData";

describe("CampusMap", () => {
  afterEach(() => {
    cleanup();
    useLang.setState({ lang: "vi" });
    localStorage.removeItem("uelcourses-lang");
    delete CAMPUS_PLACES.A.photo;
  });

  it("renders the supplied base image and road labels without a legend", () => {
    const { container } = render(<CampusMap target={null} />);

    const image = container.querySelector('image[href="/campus/campus-base.webp"]');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute("decoding", "async");
    expect(screen.getByText("Đỗ Mười").parentElement?.querySelector("rect")).toHaveAttribute("stroke-width", "1.5");
    expect(screen.getByText("Tiên Phong")).toBeInTheDocument();
    expect(screen.queryByText(/Đường /)).not.toBeInTheDocument();
    expect(screen.queryByText("Chú thích")).not.toBeInTheDocument();
    expect(screen.queryByText("Chú giải")).not.toBeInTheDocument();
  });

  it("can fill a viewport panel with a draggable cropped map", () => {
    const { container } = render(<CampusMap target={null} fill />);
    const wrapper = container.querySelector('[data-map-fill="true"]');
    const map = container.querySelector("svg");

    expect(wrapper).toBeInTheDocument();
    expect(map).toHaveClass("h-full", "cursor-grab", "touch-none");
    expect(map).toHaveAttribute("preserveAspectRatio", "xMidYMid slice");
  });

  it("renders every pickable place while keeping B3 informational", () => {
    const { container } = render(<CampusMap target={null} />);

    expect(container.querySelectorAll("g[data-place]")).toHaveLength(14);
    const places = [
      ["A", "Tòa A"],
      ["hall", "Hội trường"],
      ["A3", "Tòa A3"],
      ["B1", "Tòa B1"],
      ["B2", "Tòa B2"],
      ["canteen", "Căn tin"],
      ["carPark", "Nhà xe ô tô"],
      ["bikePark", "Nhà xe máy"],
      ["lotusPond", "Hồ sen"],
      ["sports", "Khu thể dục thể thao"],
      ["gate1", "Cổng 1"],
      ["gate2", "Cổng 2"],
      ["gate2A", "Cổng 2A"],
      ["gate3", "Cổng 3"],
    ] as const;
    for (const [place, accessibleName] of places) {
      expect(container.querySelector(`g[data-place="${place}"]`)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: accessibleName })).toBeInTheDocument();
    }
    const construction = container.querySelector('g[data-construction="B3"]');
    expect(construction).toBeInTheDocument();
    expect(construction).not.toHaveAttribute("role", "button");
    expect(construction).not.toHaveAttribute("tabindex");
  });

  it("marks B1 as the active place", () => {
    render(<CampusMap target="B1" />);

    expect(screen.getByRole("button", { name: "Tòa B1" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("button", { name: "Tòa B1" })).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("zooms to B2 and can zoom out to the full view", () => {
    const { container } = render(<CampusMap target="B2" />);
    const map = container.querySelector("svg");

    expect(map).toHaveAttribute("data-zoomed", "true");
    expect(map).not.toHaveAttribute("viewBox", "0 0 1490 970");
    expect(container.querySelector('[data-map-layer="campus"]')).toHaveAttribute(
      "data-zoom",
      "B2",
    );

    const zoomOut = screen.getByRole("button", { name: "Thu nhỏ bản đồ" });
    for (let i = 0; i < 10; i += 1) fireEvent.click(zoomOut);
    expect(map).toHaveAttribute("data-zoomed", "false");
    expect(map).toHaveAttribute("viewBox", "0 0 1490 970");
    expect(screen.queryByRole("button", { name: "Toàn cảnh" })).not.toBeInTheDocument();
  });

  it("supports zoom buttons and mouse-wheel zoom", () => {
    const { container } = render(<CampusMap target={null} />);
    const map = container.querySelector("svg") as SVGSVGElement;
    vi.spyOn(map, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 650,
      width: 1000, height: 650, toJSON: () => ({}),
    });

    fireEvent.click(screen.getByRole("button", { name: "Phóng to bản đồ" }));
    expect(map).toHaveAttribute("data-zoomed", "true");
    expect(map).not.toHaveAttribute("viewBox", CAMPUS_MAP_FULL_VIEW);

    const afterButtonZoom = map.getAttribute("viewBox");
    fireEvent.wheel(map, { deltaY: -100, clientX: 400, clientY: 250 });
    expect(map.getAttribute("viewBox")).not.toBe(afterButtonZoom);

    const zoomOut = screen.getByRole("button", { name: "Thu nhỏ bản đồ" });
    for (let i = 0; i < 10; i += 1) fireEvent.click(zoomOut);
    expect(map).toHaveAttribute("viewBox", CAMPUS_MAP_FULL_VIEW);
  });

  it("pans a zoomed map by dragging", () => {
    const { container } = render(<CampusMap target="B2" />);
    const map = container.querySelector("svg") as SVGSVGElement;
    vi.spyOn(map, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 650,
      width: 1000, height: 650, toJSON: () => ({}),
    });
    const beforeDrag = map.getAttribute("viewBox");

    fireEvent.pointerDown(map, { button: 0, pointerId: 1, clientX: 500, clientY: 300 });
    fireEvent.pointerMove(map, { pointerId: 1, clientX: 420, clientY: 250 });
    fireEvent.pointerUp(map, { pointerId: 1, clientX: 420, clientY: 250 });

    expect(map.getAttribute("viewBox")).not.toBe(beforeDrag);
    expect(container.querySelector('[data-map-layer="campus"]')).toHaveAttribute("data-zoom", "manual");
  });

  it("pans to both cropped side edges at minimum zoom in a tall viewport", () => {
    render(<CampusMap target={null} fill />);
    const map = screen.getByRole("group", { name: "Bản đồ khuôn viên UEL" });
    vi.spyOn(map, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 700, bottom: 700,
      width: 700, height: 700, toJSON: () => ({}),
    });

    fireEvent.pointerDown(map, { button: 0, pointerId: 1, clientX: 100, clientY: 350 });
    fireEvent.pointerMove(map, { pointerId: 1, clientX: 650, clientY: 350 });
    fireEvent.pointerUp(map, { pointerId: 1, clientX: 650, clientY: 350 });
    expect(map).toHaveAttribute("viewBox", "-260 0 1490 970");

    fireEvent.pointerDown(map, { button: 0, pointerId: 2, clientX: 650, clientY: 350 });
    fireEvent.pointerMove(map, { pointerId: 2, clientX: 100, clientY: 350 });
    fireEvent.pointerUp(map, { pointerId: 2, clientX: 100, clientY: 350 });
    expect(map).toHaveAttribute("viewBox", "260 0 1490 970");
    expect(screen.getByRole("button", { name: "Thu nhỏ bản đồ" })).toBeDisabled();
  });

  it("zooms to the motorbike park", () => {
    const { container } = render(<CampusMap target="bikePark" />);

    expect(container.querySelector('[data-map-layer="campus"]')).toHaveAttribute(
      "data-zoom",
      "bikePark",
    );
  });

  it("calls onPick when a place receives Enter", () => {
    const onPick = vi.fn();
    render(<CampusMap target={null} onPick={onPick} />);

    fireEvent.keyDown(screen.getByRole("button", { name: "Nhà xe máy" }), {
      key: "Enter",
    });
    expect(onPick).toHaveBeenCalledWith("bikePark");
  });

  it("shows English place labels in English mode", async () => {
    useLang.setState({ lang: "en" });
    render(<CampusMap target="hall" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Auditorium" })).toBeInTheDocument();
      const pioneer = screen.getByText("Tiên Phong").parentElement;
      expect(pioneer?.querySelector("rect")).toBeInTheDocument();
      expect(pioneer).toHaveAttribute("data-road-hint", "Pioneer");
      expect(screen.queryByText("Pioneer")).not.toBeInTheDocument();
      expect(screen.getAllByText("Thống Nhất")).toHaveLength(2);
      expect(screen.getByText("Fintech").parentElement).not.toHaveAttribute("data-road-hint");
      expect(screen.getByText("Đỗ Mười")).toBeInTheDocument();
      expect(screen.queryByText(/Đường |\bStreet\b/)).not.toBeInTheDocument();
    });

    const pioneer = screen.getByText("Tiên Phong").parentElement as Element;
    fireEvent.pointerEnter(pioneer, { clientX: 40, clientY: 40 });
    expect(screen.getByText("Pioneer")).toHaveAttribute("data-road-tooltip");
    fireEvent.pointerLeave(pioneer);
    expect(screen.queryByText("Pioneer")).not.toBeInTheDocument();
  });

  it("shows a photo card only when the hovered place has a photo", () => {
    const { container } = render(<CampusMap target={null} />);
    const buildingA = screen.getByRole("button", { name: "Tòa A" });

    fireEvent.mouseEnter(buildingA);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Tòa A");
    expect(screen.getByRole("tooltip")).toHaveClass("bg-brand-700", "text-center", "text-white");
    expect(container.querySelector("[data-campus-photo]")).not.toBeInTheDocument();

    fireEvent.mouseLeave(buildingA);
    CAMPUS_PLACES.A.photo = "/campus/photos/toa-a.webp";
    fireEvent.mouseEnter(buildingA);

    expect(container.querySelector('[data-campus-photo="A"]')).toHaveAttribute(
      "src",
      "/campus/photos/toa-a.webp",
    );
  });

  it("shows the A3 photo in its hover card", () => {
    const { container } = render(<CampusMap target={null} />);

    fireEvent.mouseEnter(screen.getByRole("button", { name: "Tòa A3" }));

    expect(container.querySelector('[data-campus-photo="A3"]')).toHaveAttribute(
      "src",
      "/campus/photos/a3.webp",
    );
    expect(container.querySelector('[data-campus-hover-title="A3"]')).toHaveClass(
      "bg-brand-700",
      "text-center",
      "text-white",
    );
  });

  it("supports two-finger pinch-zoom anchored at the midpoint and continues panning with one finger without jumping", () => {
    const onPick = vi.fn();
    const { container } = render(<CampusMap target={null} onPick={onPick} />);
    const map = container.querySelector("svg") as SVGSVGElement;
    vi.spyOn(map, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 650,
      width: 1000, height: 650, toJSON: () => ({}),
    });

    // Anchor off-center at (700, 325): start two fingers separated horizontally around x=700.
    fireEvent.pointerDown(map, { button: 0, pointerId: 1, pointerType: "touch", clientX: 600, clientY: 325 });
    fireEvent.pointerDown(map, { button: 0, pointerId: 2, pointerType: "touch", clientX: 800, clientY: 325 });

    // Spread fingers 2x apart around the same midpoint (700, 325) -> 2x zoom in (width halves: 1490 -> 745).
    fireEvent.pointerMove(map, { pointerId: 1, pointerType: "touch", clientX: 500, clientY: 325 });
    fireEvent.pointerMove(map, { pointerId: 2, pointerType: "touch", clientX: 900, clientY: 325 });

    const scale0 = 650 / 970;
    const expectedWorldMidX = 745 + (700 - 500) / scale0;
    const expectedPinchX = expectedWorldMidX - 745 / 2 - (700 - 500) / (2 * scale0);

    // Lift finger 2; remaining finger 1 at (500, 325) must keep the zoomed viewBox without jumping.
    fireEvent.pointerUp(map, { pointerId: 2, pointerType: "touch", clientX: 900, clientY: 325 });
    const viewAfterPinch = map.getAttribute("viewBox")?.split(" ").map(Number) ?? [];
    expect(viewAfterPinch).toHaveLength(4);
    expect(viewAfterPinch[2]).toBeCloseTo(745, 1);
    expect(viewAfterPinch[3]).toBeCloseTo(485, 1);
    expect(viewAfterPinch[0]).toBeCloseTo(expectedPinchX, 1);

    // Pan with the single remaining finger by +50px right (500 -> 550); no jump, pans from zoomed position.
    fireEvent.pointerMove(map, { pointerId: 1, pointerType: "touch", clientX: 550, clientY: 325 });
    fireEvent.pointerUp(map, { pointerId: 1, pointerType: "touch", clientX: 550, clientY: 325 });

    const viewAfterPan = map.getAttribute("viewBox")?.split(" ").map(Number) ?? [];
    expect(viewAfterPan[2]).toBeCloseTo(745, 1);
    expect(viewAfterPan[0]).toBeCloseTo(expectedPinchX - 50 / (2 * scale0), 1);

    // Click right after gesture must be suppressed (not treated as a place pick).
    fireEvent.click(screen.getByRole("button", { name: "Tòa B1" }));
    expect(onPick).not.toHaveBeenCalled();
  });

  it("clamps pinch-out and pan properly in fill (slice) mode", () => {
    render(<CampusMap target="B2" fill />);
    const map = screen.getByRole("group", { name: "Bản đồ khuôn viên UEL" });
    vi.spyOn(map, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 700, bottom: 700,
      width: 700, height: 700, toJSON: () => ({}),
    });

    // Pinch in drastically to zoom all the way out to minimum zoom (width 1490).
    fireEvent.pointerDown(map, { button: 0, pointerId: 1, pointerType: "touch", clientX: 100, clientY: 350 });
    fireEvent.pointerDown(map, { button: 0, pointerId: 2, pointerType: "touch", clientX: 600, clientY: 350 });
    fireEvent.pointerMove(map, { pointerId: 1, pointerType: "touch", clientX: 340, clientY: 350 });
    fireEvent.pointerMove(map, { pointerId: 2, pointerType: "touch", clientX: 360, clientY: 350 });
    fireEvent.pointerUp(map, { pointerId: 2, pointerType: "touch", clientX: 360, clientY: 350 });
    fireEvent.pointerUp(map, { pointerId: 1, pointerType: "touch", clientX: 340, clientY: 350 });

    const view = map.getAttribute("viewBox")?.split(" ").map(Number) ?? [];
    expect(view[2]).toBe(1490);
    expect(view[3]).toBe(970);
    expect(view[0]).toBeGreaterThanOrEqual(-260);
    expect(view[0]).toBeLessThanOrEqual(260);
    expect(view[1]).toBe(0);
    expect(screen.getByRole("button", { name: "Thu nhỏ bản đồ" })).toBeDisabled();
  });

  it("picks a place on touch tap when pointer does not drag, without showing hover card", () => {
    const onPick = vi.fn();
    const { container } = render(<CampusMap target={null} onPick={onPick} />);
    const map = container.querySelector("svg") as SVGSVGElement;
    const buildingA = screen.getByRole("button", { name: "Tòa A" });

    fireEvent.pointerDown(buildingA, { button: 0, pointerId: 1, pointerType: "touch", clientX: 200, clientY: 200 });
    fireEvent.pointerUp(buildingA, { pointerId: 1, pointerType: "touch", clientX: 201, clientY: 200 });
    fireEvent.mouseEnter(buildingA);
    fireEvent.focus(buildingA);
    fireEvent.click(buildingA);

    expect(onPick).toHaveBeenCalledWith("A");
    expect(container.querySelector("[data-campus-hover]")).not.toBeInTheDocument();
    expect(map).toHaveAttribute("data-zoomed", "true");
  });

  it("suppresses hover cards and road hints during touch or active gestures", async () => {
    useLang.setState({ lang: "en" });
    const { container } = render(<CampusMap target={null} />);
    const map = container.querySelector("svg") as SVGSVGElement;
    vi.spyOn(map, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 650,
      width: 1000, height: 650, toJSON: () => ({}),
    });

    await waitFor(() => {
      expect(screen.getByText("Tiên Phong").parentElement).toHaveAttribute("data-road-hint", "Pioneer");
    });

    const pioneer = screen.getByText("Tiên Phong").parentElement as Element;
    const buildingA = screen.getByRole("button", { name: "Building A" });

    // Touch pointerEnter on road label does not show road tooltip.
    fireEvent.pointerEnter(pioneer, { pointerType: "touch", clientX: 40, clientY: 40 });
    expect(container.querySelector("[data-road-tooltip]")).not.toBeInTheDocument();

    // Active drag clears existing mouse hover card and blocks new hover cards.
    fireEvent.pointerOver(map, { pointerType: "mouse" });
    fireEvent.mouseEnter(buildingA);
    expect(container.querySelector('[data-campus-hover="A"]')).toBeInTheDocument();

    fireEvent.pointerDown(map, { button: 0, pointerId: 1, pointerType: "mouse", clientX: 300, clientY: 300 });
    fireEvent.pointerMove(map, { pointerId: 1, pointerType: "mouse", clientX: 320, clientY: 300 });
    expect(container.querySelector("[data-campus-hover]")).not.toBeInTheDocument();

    fireEvent.mouseEnter(buildingA);
    expect(container.querySelector("[data-campus-hover]")).not.toBeInTheDocument();
    fireEvent.pointerUp(map, { pointerId: 1, pointerType: "mouse", clientX: 320, clientY: 300 });
  });

  it("queries prefers-reduced-motion only once and uses the latest onPick callback", () => {
    const originalMatchMedia = window.matchMedia;
    const matchMediaMock = vi.fn().mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: matchMediaMock,
    });

    try {
      const firstOnPick = vi.fn();
      const secondOnPick = vi.fn();
      const { container, rerender } = render(<CampusMap target={null} onPick={firstOnPick} />);

      expect(matchMediaMock).toHaveBeenCalledTimes(1);

      // Re-render with hover state and target/onPick changes: matchMedia is not called again, no <animate>.
      fireEvent.mouseEnter(screen.getByRole("button", { name: "Tòa A" }));
      rerender(<CampusMap target="B1" onPick={secondOnPick} />);
      expect(matchMediaMock).toHaveBeenCalledTimes(1);
      expect(container.querySelector("animate")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Tòa B2" }));
      expect(firstOnPick).not.toHaveBeenCalled();
      expect(secondOnPick).toHaveBeenCalledWith("B2");
    } finally {
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        configurable: true,
        value: originalMatchMedia,
      });
    }
  });
});

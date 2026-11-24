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
      expect(screen.getByText("Pioneer").parentElement?.querySelector("rect")).toBeInTheDocument();
      expect(screen.getAllByText("Unity")).toHaveLength(2);
      expect(screen.getByText("Đỗ Mười")).toBeInTheDocument();
      expect(screen.queryByText(/Đường |Tiên Phong|\bStreet\b/)).not.toBeInTheDocument();
    });
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
});

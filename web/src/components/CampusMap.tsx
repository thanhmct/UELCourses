"use client";

import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
} from "react";
import { useT, type Lang } from "@/i18n";
import {
  CAMPUS_AREA_RECTS,
  CAMPUS_B3_RECT,
  CAMPUS_GATES,
  CAMPUS_MAP_FULL_VIEW,
  CAMPUS_MAP_HEIGHT,
  CAMPUS_MAP_WIDTH,
  CAMPUS_MAP_ZOOM_PADDING,
  CAMPUS_ROAD_LABELS,
  campusPlaceBounds,
  type CampusAreaPlace,
  type CampusGatePlace,
  type CampusMapRect,
} from "@/lib/campusMapData";
import { CAMPUS_PLACES } from "@/lib/campusPlaces";
import type { CampusPlace } from "@/lib/campusTour";

export type { CampusPlace } from "@/lib/campusTour";

export interface CampusMapProps {
  target: CampusPlace | null;
  onPick?: (place: CampusPlace) => void;
  className?: string;
  /** Fill the available panel and crop the map when its aspect ratio differs. */
  fill?: boolean;
}

interface HoverCardState {
  place: CampusPlace;
  left: number;
  top: number;
}

interface PlaceGroupProps {
  place: CampusPlace;
  label: string;
  bounds: CampusMapRect;
  target: CampusPlace | null;
  onPick: (place: CampusPlace) => void;
  onHover: (
    place: CampusPlace,
    element: SVGGElement,
    pointer?: { clientX: number; clientY: number },
  ) => void;
  onLeave: () => void;
  children: ReactNode;
}

const GATE_HIT_SIZE = 40;
const GATE_LABEL_WIDTH = 112;
const MIN_VIEWBOX_WIDTH = 260;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function zoomViewBox(place: CampusPlace): string {
  const bounds = campusPlaceBounds(place);
  const mapAspect = CAMPUS_MAP_WIDTH / CAMPUS_MAP_HEIGHT;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  let width = bounds.width + CAMPUS_MAP_ZOOM_PADDING * 2;
  let height = bounds.height + CAMPUS_MAP_ZOOM_PADDING * 2;

  if (width / height > mapAspect) {
    height = width / mapAspect;
  } else {
    width = height * mapAspect;
  }

  width = Math.min(width, CAMPUS_MAP_WIDTH);
  height = Math.min(height, CAMPUS_MAP_HEIGHT);
  const x = clamp(centerX - width / 2, 0, CAMPUS_MAP_WIDTH - width);
  const y = clamp(centerY - height / 2, 0, CAMPUS_MAP_HEIGHT - height);
  const rounded = (value: number) => Math.round(value * 100) / 100;
  return `${rounded(x)} ${rounded(y)} ${rounded(width)} ${rounded(height)}`;
}

function parseViewBox(value: string): CampusMapRect {
  const [x, y, width, height] = value.split(" ").map(Number);
  return { x, y, width, height };
}

function formatViewBox(rect: CampusMapRect): string {
  const rounded = (value: number) => Math.round(value * 100) / 100;
  return `${rounded(rect.x)} ${rounded(rect.y)} ${rounded(rect.width)} ${rounded(rect.height)}`;
}

type ViewportSize = Pick<DOMRect, "width" | "height">;

function mapScale(rect: CampusMapRect, viewport: ViewportSize, fill: boolean) {
  const scaleX = viewport.width / rect.width;
  const scaleY = viewport.height / rect.height;
  return fill ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
}

function clampViewBox(rect: CampusMapRect, viewport: ViewportSize | undefined, fill: boolean): CampusMapRect {
  const scale = fill && viewport?.width && viewport.height ? mapScale(rect, viewport, fill) : 0;
  // With SVG slice, the visible edges sit inside the viewBox. Pan until those edges reach the map boundary.
  const cropX = viewport && scale ? Math.max(0, (rect.width - viewport.width / scale) / 2) : 0;
  const cropY = viewport && scale ? Math.max(0, (rect.height - viewport.height / scale) / 2) : 0;
  return {
    ...rect,
    x: clamp(rect.x, -cropX, CAMPUS_MAP_WIDTH - rect.width + cropX),
    y: clamp(rect.y, -cropY, CAMPUS_MAP_HEIGHT - rect.height + cropY),
  };
}

function zoomRect(
  rect: CampusMapRect,
  factor: number,
  anchorX = 0.5,
  anchorY = 0.5,
): CampusMapRect {
  const mapAspect = CAMPUS_MAP_WIDTH / CAMPUS_MAP_HEIGHT;
  const width = clamp(rect.width * factor, MIN_VIEWBOX_WIDTH, CAMPUS_MAP_WIDTH);
  const height = width / mapAspect;
  const focusX = rect.x + rect.width * anchorX;
  const focusY = rect.y + rect.height * anchorY;
  return {
    x: focusX - width * anchorX,
    y: focusY - height * anchorY,
    width,
    height,
  };
}

function PlaceGroup({
  place,
  label,
  bounds,
  target,
  onPick,
  onHover,
  onLeave,
  children,
}: PlaceGroupProps) {
  const active = target === place;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const pinY = bounds.y - 14;
  const pulseRadius = Math.max(24, Math.min(bounds.width, bounds.height) / 2 + 8);
  const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onPick(place);
    }
  };
  const handleMouse = (event: MouseEvent<SVGGElement>) => {
    onHover(place, event.currentTarget, {
      clientX: event.clientX,
      clientY: event.clientY,
    });
  };
  const handleFocus = (event: FocusEvent<SVGGElement>) => {
    onHover(place, event.currentTarget);
  };

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-current={active ? "true" : undefined}
      data-place={place}
      data-active={active ? "true" : "false"}
      onClick={() => onPick(place)}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouse}
      onMouseMove={handleMouse}
      onMouseLeave={onLeave}
      onFocus={handleFocus}
      onBlur={onLeave}
      className="campus-place cursor-pointer outline-none"
    >
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        rx="4"
        className="campus-hotspot"
      />
      {children}
      {active && (
        <g pointerEvents="none" aria-hidden="true">
          <circle
            cx={centerX}
            cy={centerY}
            r={pulseRadius}
            className="campus-map-pulse fill-blue-600/20 stroke-blue-600"
            strokeWidth="3"
          />
          <g transform={`translate(${centerX} ${pinY})`}>
            <path
              d="M0 15 C-9 5 -12 -2 -9 -10 C-5 -20 9 -20 13 -10 C16 -2 10 6 0 15Z"
              className="fill-blue-700 stroke-white dark:fill-blue-400"
              strokeWidth="2"
            />
            <circle cy="-7" r="3.5" className="fill-white" />
          </g>
        </g>
      )}
    </g>
  );
}

function BuildingLabel({ rect, children }: { rect: CampusMapRect; children: ReactNode }) {
  return (
    <text
      x={rect.x + rect.width / 2}
      y={rect.y + rect.height / 2 + 5}
      textAnchor="middle"
      pointerEvents="none"
      fill="#b42318"
      stroke="white"
      strokeWidth="4"
      paintOrder="stroke"
      strokeLinejoin="round"
      fontSize="15"
      fontWeight="700"
    >
      {children}
    </text>
  );
}

function GateMarker({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none" aria-hidden="true">
      <circle r="12" className="fill-white/95 stroke-blue-700" strokeWidth="3" />
      <path d="M-6 6 V-5 M6 6 V-5 M-6 -4 Q0 -11 6 -4" fill="none" className="stroke-blue-700" strokeWidth="2.5" />
    </g>
  );
}

function GateLabel({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <g transform={`translate(${x - GATE_LABEL_WIDTH / 2} ${y - 15})`} pointerEvents="none">
      <rect width={GATE_LABEL_WIDTH} height="30" rx="15" className="fill-white/95 stroke-slate-400" />
      <text
        x={GATE_LABEL_WIDTH / 2}
        y="20"
        textAnchor="middle"
        className="fill-slate-800"
        fontSize="14"
        fontWeight="700"
      >
        {children}
      </text>
    </g>
  );
}

interface RoadHintState {
  text: string;
  left: number;
  top: number;
}

function RoadLabels({
  lang,
  onHint,
  onLeave,
}: {
  lang: Lang;
  onHint: (text: string, pointer: { clientX: number; clientY: number }) => void;
  onLeave: () => void;
}) {
  return (
    <g>
      {CAMPUS_ROAD_LABELS.map((road) => {
        // Road names stay in Vietnamese; English UI shows the translation only on hover.
        const name = road.nameVi;
        const hint = lang === "en" && road.nameEn !== road.nameVi ? road.nameEn : null;
        const width = name.length * 8 + 14;
        return (
          <g
            key={`${road.x}-${road.y}`}
            transform={`translate(${road.x} ${road.y}) rotate(${road.rotate})`}
            pointerEvents={hint ? "all" : "none"}
            className={hint ? "cursor-help" : undefined}
            data-road-hint={hint ?? undefined}
            aria-label={hint ? `${name} (${hint})` : undefined}
            onPointerEnter={hint ? (event) => onHint(hint, event) : undefined}
            onPointerMove={hint ? (event) => onHint(hint, event) : undefined}
            onPointerLeave={hint ? onLeave : undefined}
          >
            <rect
              x={-width / 2}
              y={-14}
              width={width}
              height={20}
              rx={5}
              className={road.water ? "fill-sky-50 stroke-sky-700" : "fill-white stroke-brand-700"}
              strokeWidth="1.5"
            />
            <text textAnchor="middle" className={road.water ? "fill-sky-900" : "fill-slate-900"} fontSize="13" fontWeight="600">
              {name}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function CampusMap({ target, onPick, className = "", fill = false }: CampusMapProps) {
  const { t, lang } = useT();
  const mapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoomedPlace, setZoomedPlace] = useState<CampusPlace | null>(target);
  const [manualViewBox, setManualViewBox] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    viewBox: CampusMapRect;
  } | null>(null);
  const suppressPick = useRef(false);
  const [hoverCard, setHoverCard] = useState<HoverCardState | null>(null);
  const [roadHint, setRoadHint] = useState<RoadHintState | null>(null);
  const placeViewBox = zoomedPlace ? zoomViewBox(zoomedPlace) : CAMPUS_MAP_FULL_VIEW;
  const viewBox = manualViewBox ?? placeViewBox;
  const viewRect = parseViewBox(viewBox);
  const fullView = viewRect.width >= CAMPUS_MAP_WIDTH;
  const previousViewBox = useRef(CAMPUS_MAP_FULL_VIEW);
  const animationFrom = previousViewBox.current;
  const reducedMotion = typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    setZoomedPlace(target);
    setManualViewBox(null);
  }, [target]);

  useEffect(() => {
    previousViewBox.current = viewBox;
  }, [viewBox]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!fill || !svg || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const viewport = svg.getBoundingClientRect();
      if (!viewport.width || !viewport.height) return;
      setManualViewBox((current) => current === null ? null : formatViewBox(clampViewBox(parseViewBox(current), viewport, fill)));
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, [fill]);

  const pick = (place: CampusPlace) => {
    if (suppressPick.current) {
      suppressPick.current = false;
      return;
    }
    setManualViewBox(null);
    setZoomedPlace(place);
    onPick?.(place);
  };
  const setManualZoom = (next: CampusMapRect) => {
    setZoomedPlace(null);
    setManualViewBox(formatViewBox(clampViewBox(next, svgRef.current?.getBoundingClientRect(), fill)));
  };
  const zoomBy = (factor: number, anchorX = 0.5, anchorY = 0.5) => {
    setManualZoom(zoomRect(viewRect, factor, anchorX, anchorY));
  };
  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height || !event.deltaY) return;
    const scale = mapScale(viewRect, bounds, fill);
    const anchorX = clamp(0.5 + (event.clientX - bounds.left - bounds.width / 2) / (viewRect.width * scale), 0, 1);
    const anchorY = clamp(0.5 + (event.clientY - bounds.top - bounds.height / 2) / (viewRect.height * scale), 0, 1);
    zoomBy(event.deltaY < 0 ? 0.82 : 1.22, anchorX, anchorY);
  };
  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    dragState.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      viewBox: viewRect,
    };
    suppressPick.current = false;
  };
  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const start = dragState.current;
    const svg = svgRef.current;
    if (!start || !svg || start.pointerId !== event.pointerId) return;
    const bounds = svg.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const dx = event.clientX - start.clientX;
    const dy = event.clientY - start.clientY;
    if (!dragging && Math.hypot(dx, dy) < 3) return;
    if (!dragging) event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
    suppressPick.current = true;
    setHoverCard(null);
    const scale = mapScale(start.viewBox, bounds, fill);
    const next = {
      ...start.viewBox,
      x: start.viewBox.x - dx / scale,
      y: start.viewBox.y - dy / scale,
    };
    setManualZoom(next);
  };
  const stopDragging = (event: PointerEvent<SVGSVGElement>) => {
    if (dragState.current?.pointerId !== event.pointerId) return;
    dragState.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (suppressPick.current) {
      window.setTimeout(() => {
        suppressPick.current = false;
      }, 0);
    }
  };
  const label = (place: CampusPlace) => t(CAMPUS_PLACES[place].nameKey);
  const showHover = (
    place: CampusPlace,
    element: SVGGElement,
    pointer?: { clientX: number; clientY: number },
  ) => {
    const mapBounds = mapRef.current?.getBoundingClientRect();
    const elementBounds = element.getBoundingClientRect();
    if (!mapBounds) return;
    const pointerX = pointer && pointer.clientX > 0
      ? pointer.clientX - mapBounds.left
      : elementBounds.left + elementBounds.width / 2 - mapBounds.left;
    const pointerY = pointer && pointer.clientY > 0
      ? pointer.clientY - mapBounds.top
      : elementBounds.top + elementBounds.height / 2 - mapBounds.top;
    setHoverCard({
      place,
      left: clamp(pointerX + 12, 8, Math.max(8, mapBounds.width - 316)),
      top: clamp(pointerY + 12, 8, Math.max(8, mapBounds.height - 220)),
    });
  };

  const showRoadHint = (text: string, pointer: { clientX: number; clientY: number }) => {
    const mapBounds = mapRef.current?.getBoundingClientRect();
    if (!mapBounds || dragState.current) return;
    setRoadHint({
      text,
      left: clamp(pointer.clientX - mapBounds.left + 12, 8, Math.max(8, mapBounds.width - 160)),
      top: clamp(pointer.clientY - mapBounds.top + 14, 8, Math.max(8, mapBounds.height - 40)),
    });
  };

  return (
    <div
      ref={mapRef}
      data-map-fill={fill ? "true" : "false"}
      className={`relative overflow-hidden rounded-xl bg-slate-100 p-1 dark:bg-slate-900 sm:p-2 ${className}`}
    >
      <style>{`
        @keyframes campus-map-pulse {
          0% { transform: scale(.55); opacity: .95; }
          75%, 100% { transform: scale(1.7); opacity: 0; }
        }
        .campus-map-pulse {
          animation: campus-map-pulse 1.2s ease-out infinite;
          transform-box: fill-box;
          transform-origin: center;
        }
        .campus-hotspot {
          fill: transparent;
          stroke: transparent;
          stroke-width: 3;
          transition: fill 160ms ease, stroke 160ms ease;
        }
        .campus-place:hover .campus-hotspot,
        .campus-place:focus-visible .campus-hotspot,
        .campus-place[data-active="true"] .campus-hotspot {
          fill: rgba(37, 99, 235, .12);
          stroke: #2563eb;
        }
        @media (prefers-reduced-motion: reduce) {
          .campus-map-pulse { animation: none; opacity: .7; }
          .campus-hotspot { transition: none; }
        }
      `}</style>

      <div className="absolute right-3 top-3 z-10 flex flex-col overflow-hidden rounded-lg border border-slate-300 bg-white/95 shadow-md dark:border-slate-600 dark:bg-slate-900/95">
        <button
          type="button"
          onClick={() => zoomBy(0.8)}
          disabled={viewRect.width <= MIN_VIEWBOX_WIDTH}
          aria-label={t("campus.zoomIn")}
          className="flex size-8 items-center justify-center text-lg font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-default disabled:opacity-35 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1.25)}
          disabled={fullView}
          aria-label={t("campus.zoomOut")}
          className="flex size-8 items-center justify-center border-t border-slate-200 text-lg font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-default disabled:opacity-35 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          −
        </button>
      </div>

      <svg
        ref={svgRef}
        viewBox={viewBox}
        role="group"
        aria-label={t("campus.mapTitle")}
        data-zoomed={fullView ? "false" : "true"}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onLostPointerCapture={stopDragging}
        onPointerLeave={(event) => { if (!dragging) stopDragging(event); }}
        className={`block w-full touch-none select-none ${fill ? "h-full" : "h-auto"} ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        preserveAspectRatio={fill ? "xMidYMid slice" : "xMidYMid meet"}
      >
        {!reducedMotion && manualViewBox === null && animationFrom !== viewBox && (
          <animate
            key={`${animationFrom}-${viewBox}`}
            attributeName="viewBox"
            from={animationFrom}
            to={viewBox}
            dur="600ms"
            calcMode="spline"
            keyTimes="0;1"
            keySplines="0.4 0 0.2 1"
            fill="freeze"
          />
        )}
        <defs>
          <pattern id="campus-construction-hatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <rect width="14" height="14" fill="rgba(245, 158, 11, .08)" />
            <rect width="3" height="14" fill="rgba(180, 83, 9, .28)" />
          </pattern>
        </defs>
        <image
          href="/campus/campus-base.webp"
          width={CAMPUS_MAP_WIDTH}
          height={CAMPUS_MAP_HEIGHT}
          preserveAspectRatio="xMidYMid meet"
          {...{ decoding: "async" }}
        />
        <g data-map-layer="campus" data-zoom={manualViewBox ? "manual" : zoomedPlace ?? "full"}>
          <RoadLabels lang={lang} onHint={showRoadHint} onLeave={() => setRoadHint(null)} />

          {(Object.entries(CAMPUS_AREA_RECTS) as [CampusAreaPlace, CampusMapRect][]).map(([place, rect]) => (
            <PlaceGroup
              key={place}
              place={place}
              label={label(place)}
              bounds={rect}
              target={target}
              onPick={pick}
              onHover={showHover}
              onLeave={() => setHoverCard(null)}
            >
              <BuildingLabel rect={rect}>{label(place)}</BuildingLabel>
            </PlaceGroup>
          ))}

          {(Object.entries(CAMPUS_GATES) as [CampusGatePlace, (typeof CAMPUS_GATES)[CampusGatePlace]][]).map(
            ([place, gate]) => {
              const bounds = {
                x: gate.x - GATE_HIT_SIZE / 2,
                y: gate.y - GATE_HIT_SIZE / 2,
                width: GATE_HIT_SIZE,
                height: GATE_HIT_SIZE,
              };
              return (
                <PlaceGroup
                  key={place}
                  place={place}
                  label={label(place)}
                  bounds={bounds}
                  target={target}
                  onPick={pick}
                  onHover={showHover}
                  onLeave={() => setHoverCard(null)}
                >
                  <GateMarker x={gate.x} y={gate.y} />
                  <GateLabel x={gate.x + gate.labelDx} y={gate.y + gate.labelDy}>
                    {label(place)}
                  </GateLabel>
                </PlaceGroup>
              );
            },
          )}

          <g data-construction="B3" aria-label={t("campus.buildingB3")} pointerEvents="none">
            <rect
              x={CAMPUS_B3_RECT.x}
              y={CAMPUS_B3_RECT.y}
              width={CAMPUS_B3_RECT.width}
              height={CAMPUS_B3_RECT.height}
              rx="4"
              fill="url(#campus-construction-hatch)"
              className="stroke-amber-700/60"
              strokeWidth="2"
            />
            <text
              x={CAMPUS_B3_RECT.x + CAMPUS_B3_RECT.width / 2}
              y={CAMPUS_B3_RECT.y + CAMPUS_B3_RECT.height / 2 - 5}
              textAnchor="middle"
              fill="#78350f"
              stroke="white"
              strokeWidth="4"
              paintOrder="stroke"
              fontSize="13"
              fontWeight="700"
            >
              <tspan x={CAMPUS_B3_RECT.x + CAMPUS_B3_RECT.width / 2} dy="0">
                {lang === "vi" ? "Khu vực thi công" : "Building B3"}
              </tspan>
              <tspan x={CAMPUS_B3_RECT.x + CAMPUS_B3_RECT.width / 2} dy="17">
                {lang === "vi" ? "Tòa B3" : "(under construction)"}
              </tspan>
            </text>
          </g>
        </g>
      </svg>

      {roadHint && !dragging && (
        <div
          role="tooltip"
          data-road-tooltip
          className="pointer-events-none absolute z-20 whitespace-nowrap rounded-lg border-2 border-brand-700 bg-white px-3 py-1 text-[15px] font-bold leading-tight text-slate-900 shadow-md"
          style={{ left: roadHint.left, top: roadHint.top }}
        >
          {roadHint.text}
        </div>
      )}

      {hoverCard && (
        <div
          role="tooltip"
          data-campus-hover={hoverCard.place}
          className={`pointer-events-none absolute z-20 overflow-hidden rounded-lg border border-brand-700 bg-brand-700 text-center text-base font-semibold text-white shadow-lg dark:border-brand-500 dark:bg-brand-700 dark:text-white ${
            CAMPUS_PLACES[hoverCard.place].photo ? "w-[300px]" : "max-w-[300px] px-4 py-3"
          }`}
          style={{ left: hoverCard.left, top: hoverCard.top }}
        >
          {CAMPUS_PLACES[hoverCard.place].photo && (
            <img
              src={CAMPUS_PLACES[hoverCard.place].photo}
              alt=""
              data-campus-photo={hoverCard.place}
              className="h-[168px] w-full object-cover"
            />
          )}
          <div
            data-campus-hover-title={hoverCard.place}
            className={CAMPUS_PLACES[hoverCard.place].photo ? "bg-brand-700 px-4 py-3 text-center text-white" : "text-center"}
          >
            {label(hoverCard.place)}
          </div>
        </div>
      )}
    </div>
  );
}

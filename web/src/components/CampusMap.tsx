"use client";

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { useT } from "@/i18n";
import type { CampusPlace } from "@/lib/campusTour";

export type { CampusPlace } from "@/lib/campusTour";

export interface CampusMapProps {
  target: CampusPlace | null;
  onPick?: (place: CampusPlace) => void;
  className?: string;
}

interface PlaceGroupProps {
  place: CampusPlace;
  label: string;
  labelX: number;
  labelY: number;
  pinX: number;
  pinY: number;
  target: CampusPlace | null;
  onPick: (place: CampusPlace) => void;
  children: ReactNode;
}

function PlaceGroup({
  place,
  label,
  labelX,
  labelY,
  pinX,
  pinY,
  target,
  onPick,
  children,
}: PlaceGroupProps) {
  const active = target === place;
  const dimmed = target !== null && !active;
  const labelWidth = Math.max(88, Math.min(154, label.length * 7.2 + 24));

  const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onPick(place);
    }
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
      className={`group cursor-pointer outline-none transition-opacity duration-300 focus-visible:opacity-100 ${
        dimmed ? "opacity-45" : "opacity-100"
      }`}
    >
      <g className="transition-[filter] duration-200 group-hover:brightness-105 group-focus-visible:brightness-110">
        {children}
      </g>

      <g transform={`translate(${labelX - labelWidth / 2} ${labelY})`} pointerEvents="none">
        <rect
          width={labelWidth}
          height="28"
          rx="14"
          className={
            active
              ? "fill-brand-700 stroke-brand-300 dark:fill-brand-500 dark:stroke-brand-200"
              : "fill-white/95 stroke-slate-300 dark:fill-slate-900/95 dark:stroke-slate-600"
          }
          strokeWidth="1.5"
        />
        <text
          x={labelWidth / 2}
          y="18.5"
          textAnchor="middle"
          className={
            active
              ? "fill-white text-[12px] font-bold"
              : "fill-slate-800 text-[12px] font-bold dark:fill-slate-100"
          }
        >
          {label}
        </text>
      </g>

      {active && (
        <g transform={`translate(${pinX} ${pinY})`} pointerEvents="none" aria-hidden="true">
          <circle r="17" className="campus-map-pulse fill-brand-500/35 stroke-brand-500" strokeWidth="2" />
          <path
            d="M0 12 C-9 2 -11 -4 -8 -10 C-4 -19 9 -19 13 -10 C16 -4 10 3 0 12Z"
            className="fill-brand-700 stroke-white dark:fill-brand-400"
            strokeWidth="2"
          />
          <circle cy="-7" r="3.5" className="fill-white" />
        </g>
      )}
    </g>
  );
}

export function CampusMap({ target, onPick, className = "" }: CampusMapProps) {
  const { t } = useT();
  const [sportsZoomed, setSportsZoomed] = useState(target === "sports");

  useEffect(() => {
    setSportsZoomed(target === "sports");
  }, [target]);

  const pick = (place: CampusPlace) => {
    if (place === "sports") setSportsZoomed(true);
    onPick?.(place);
  };

  return (
    <div className={`relative overflow-hidden rounded-xl bg-sky-50 dark:bg-slate-950 ${className}`}>
      <style>{`
        @keyframes campus-map-pulse {
          0% { transform: scale(.55); opacity: .95; }
          75%, 100% { transform: scale(1.65); opacity: 0; }
        }
        .campus-map-pulse {
          animation: campus-map-pulse 1.2s ease-out infinite;
          transform-box: fill-box;
          transform-origin: center;
        }
        @media (prefers-reduced-motion: reduce) {
          .campus-map-pulse { animation: none; opacity: .7; }
        }
      `}</style>

      <button
        type="button"
        onClick={() => setSportsZoomed(false)}
        disabled={!sportsZoomed}
        className="absolute right-3 top-3 z-10 rounded-full border border-slate-300 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur disabled:cursor-default disabled:opacity-45 dark:border-slate-600 dark:bg-slate-900/90 dark:text-slate-200"
      >
        {t("campus.fullView")}
      </button>

      <svg
        viewBox="0 0 800 450"
        role="group"
        aria-label={t("campus.mapTitle")}
        data-zoomed={sportsZoomed ? "true" : "false"}
        className="block h-auto min-h-[300px] w-full"
      >
        <rect width="800" height="450" className="fill-emerald-50 dark:fill-slate-900" />
        <path d="M300 450 L500 450 L465 285 L348 285Z" className="fill-slate-300 dark:fill-slate-700" />
        <path d="M0 407 H800 V450 H0Z" className="fill-slate-400 dark:fill-slate-800" />
        <path d="M0 420 H800" className="stroke-white/80 dark:stroke-slate-500" strokeWidth="3" strokeDasharray="24 18" />

        {[42, 92, 285, 718, 755].map((x, index) => (
          <g key={x} transform={`translate(${x} ${260 + (index % 2) * 55})`} aria-hidden="true">
            <rect x="-3" y="9" width="6" height="18" rx="2" className="fill-amber-800 dark:fill-amber-700" />
            <circle cy="2" r="18" className="fill-emerald-500 dark:fill-emerald-700" />
            <circle cx="-10" cy="7" r="12" className="fill-emerald-600 dark:fill-emerald-800" />
          </g>
        ))}

        <g
          data-map-layer="campus"
          data-zoom={sportsZoomed ? "sports" : "full"}
          className="transition-transform duration-[600ms] ease-in-out motion-reduce:transition-none"
          style={{
            transform: sportsZoomed
              ? "translate(80px, 30px) scale(1.65)"
              : "translate(0, 0) scale(1)",
            transformBox: "view-box",
            transformOrigin: "0 0",
          }}
        >
          <PlaceGroup
            place="sports"
            label={t("campus.sports")}
            labelX={168}
            labelY={42}
            pinX={170}
            pinY={89}
            target={target}
            onPick={pick}
          >
            <rect x="45" y="72" width="236" height="142" rx="18" className="fill-emerald-600 stroke-emerald-800 dark:fill-emerald-800 dark:stroke-emerald-500" strokeWidth="4" />
            <rect x="62" y="88" width="154" height="108" rx="8" fill="none" className="stroke-white/80" strokeWidth="3" />
            <path d="M139 88 V196 M62 142 H216" className="stroke-white/70" strokeWidth="2" />
            <path d="M227 102 L267 86 L267 185 L227 201Z" className="fill-amber-200 stroke-amber-700 dark:fill-amber-800 dark:stroke-amber-400" strokeWidth="3" />
            <path d="M227 102 L244 91 L281 75 L267 86Z" className="fill-amber-100 dark:fill-amber-700" />
          </PlaceGroup>

          <PlaceGroup
            place="parking"
            label={t("campus.parking")}
            labelX={438}
            labelY={38}
            pinX={438}
            pinY={82}
            target={target}
            onPick={pick}
          >
            <path d="M347 102 L477 72 L535 103 L403 137Z" className="fill-slate-500 stroke-slate-700 dark:fill-slate-600 dark:stroke-slate-400" strokeWidth="3" />
            <path d="M403 137 L535 103 V143 L403 177Z" className="fill-slate-400 dark:fill-slate-700" />
            <path d="M347 102 L403 137 V177 L347 142Z" className="fill-slate-300 dark:fill-slate-800" />
            <path d="M367 115 L494 85 M387 128 L514 96" className="stroke-slate-200 dark:stroke-slate-500" strokeWidth="3" />
          </PlaceGroup>

          <PlaceGroup
            place="B2"
            label={t("campus.buildingB2")}
            labelX={676}
            labelY={48}
            pinX={676}
            pinY={99}
            target={target}
            onPick={pick}
          >
            <path d="M603 118 L686 84 L754 116 L671 151Z" className="fill-indigo-100 stroke-indigo-500 dark:fill-indigo-900 dark:stroke-indigo-400" strokeWidth="3" />
            <path d="M603 118 L671 151 V251 L603 218Z" className="fill-indigo-200 stroke-indigo-500 dark:fill-indigo-950 dark:stroke-indigo-400" strokeWidth="3" />
            <path d="M671 151 L754 116 V216 L671 251Z" className="fill-indigo-300 stroke-indigo-600 dark:fill-indigo-800 dark:stroke-indigo-400" strokeWidth="3" />
            <path d="M687 157 L739 136 M687 181 L739 160 M687 205 L739 184" className="stroke-sky-100 dark:stroke-sky-300" strokeWidth="8" />
          </PlaceGroup>

          <PlaceGroup
            place="A"
            label={t("campus.buildingA")}
            labelX={395}
            labelY={91}
            pinX={396}
            pinY={131}
            target={target}
            onPick={pick}
          >
            <path d="M306 151 L402 112 L480 151 L382 191Z" className="fill-orange-100 stroke-orange-500 dark:fill-orange-900 dark:stroke-orange-400" strokeWidth="4" />
            <path d="M306 151 L382 191 V342 L306 298Z" className="fill-orange-200 stroke-orange-600 dark:fill-orange-950 dark:stroke-orange-400" strokeWidth="4" />
            <path d="M382 191 L480 151 V302 L382 342Z" className="fill-orange-300 stroke-orange-600 dark:fill-orange-800 dark:stroke-orange-400" strokeWidth="4" />
            <path d="M400 196 L463 171 M400 224 L463 199 M400 252 L463 227 M400 280 L463 255 M400 308 L463 283" className="stroke-sky-100 dark:stroke-sky-300" strokeWidth="10" />
            <path d="M323 177 L367 199 M323 210 L367 232 M323 243 L367 265 M323 276 L367 298" className="stroke-white/80 dark:stroke-sky-400" strokeWidth="8" />
          </PlaceGroup>

          <PlaceGroup
            place="B1"
            label={t("campus.buildingB1")}
            labelX={561}
            labelY={155}
            pinX={558}
            pinY={191}
            target={target}
            onPick={pick}
          >
            <path d="M489 209 L563 178 L628 210 L553 242Z" className="fill-rose-100 stroke-rose-500 dark:fill-rose-900 dark:stroke-rose-400" strokeWidth="3" />
            <path d="M489 209 L553 242 V335 L489 301Z" className="fill-rose-200 stroke-rose-500 dark:fill-rose-950 dark:stroke-rose-400" strokeWidth="3" />
            <path d="M553 242 L628 210 V303 L553 335Z" className="fill-rose-300 stroke-rose-600 dark:fill-rose-800 dark:stroke-rose-400" strokeWidth="3" />
            <path d="M568 246 L614 227 M568 271 L614 252 M568 296 L614 277" className="stroke-sky-100 dark:stroke-sky-300" strokeWidth="8" />
            <path d="M476 209 L489 206 L489 224 L476 228 L459 218 L459 205Z" className="fill-slate-200 stroke-slate-500 dark:fill-slate-600 dark:stroke-slate-300" strokeWidth="2" />
          </PlaceGroup>

          <PlaceGroup
            place="gate"
            label={t("campus.gate")}
            labelX={400}
            labelY={359}
            pinX={400}
            pinY={393}
            target={target}
            onPick={pick}
          >
            <rect x="342" y="399" width="16" height="37" rx="2" className="fill-brand-700 dark:fill-brand-400" />
            <rect x="442" y="399" width="16" height="37" rx="2" className="fill-brand-700 dark:fill-brand-400" />
            <path d="M350 405 Q400 375 450 405" fill="none" className="stroke-brand-700 dark:stroke-brand-400" strokeWidth="12" />
            <path d="M371 414 H429" className="stroke-slate-600 dark:stroke-slate-300" strokeWidth="4" strokeDasharray="5 5" />
          </PlaceGroup>
        </g>
      </svg>
    </div>
  );
}

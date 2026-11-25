"use client";
import { useEffect, useState } from "react";

interface Particle {
  id: number;
  x: string;
  y: string;
  dx: string;
  dy: string;
  rot: string;
  delay: string;
  dur: string;
  color: string;
  size: string;
  round: boolean;
}

const COLORS = ["#F05A23", "#195E9C", "#00AEEF", "#FACC15", "#10B981", "#EC4899", "#A855F7"];
const CENTERS = [
  { x: 20, y: 32 },
  { x: 50, y: 24 },
  { x: 80, y: 34 },
  { x: 35, y: 62 },
  { x: 68, y: 58 },
];

const PARTICLES: Particle[] = CENTERS.flatMap((center, ci) =>
  Array.from({ length: 12 }, (_, pi) => {
    const idx = ci * 12 + pi;
    const angle = (pi / 12) * Math.PI * 2 + ci * 0.4;
    const distance = 65 + ((idx * 29) % 110);
    const dx = Math.round(Math.cos(angle) * distance);
    const dy = Math.round(Math.sin(angle) * distance - 25);
    const sizePx = 6 + ((idx * 3) % 6);
    return {
      id: idx,
      x: `${center.x}%`,
      y: `${center.y}%`,
      dx: `${dx}px`,
      dy: `${dy}px`,
      rot: `${180 + ((idx * 53) % 360)}deg`,
      delay: `${((ci * 120 + (pi % 4) * 45) % 420)}ms`,
      dur: `${1250 + ((idx * 70) % 550)}ms`,
      color: COLORS[idx % COLORS.length],
      size: `${sizePx}px`,
      round: idx % 3 === 0,
    };
  }),
);

export interface FireworksProps {
  durationMs?: number;
  onDone?: () => void;
}

/** Lightweight CSS-only screen-wide firework/confetti burst that auto-unmounts. */
export function Fireworks({ durationMs = 2200, onDone }: FireworksProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, onDone]);

  if (!visible) return null;

  return (
    <div
      data-testid="fireworks-overlay"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[100] overflow-hidden"
    >
      {PARTICLES.map((p) => (
        <span
          key={p.id}
          className={`uel-firework-piece ${p.round ? "rounded-full" : "rounded-xs"}`}
          style={
            {
              width: p.size,
              height: p.round ? p.size : `calc(${p.size} * 0.6)`,
              "--fw-x": p.x,
              "--fw-y": p.y,
              "--fw-dx": p.dx,
              "--fw-dy": p.dy,
              "--fw-rot": p.rot,
              "--fw-delay": p.delay,
              "--fw-dur": p.dur,
              "--fw-color": p.color,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

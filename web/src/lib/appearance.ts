import { contrastRatio, UEL_COLORS } from "./brand";

export const DEFAULT_GRADIENT = [UEL_COLORS.blue, "#266CA8"] as const;
export const DEFAULT_PLANNER_TERM_COLOR = UEL_COLORS.blue;

export function normalizeHex(value: string): string | null {
  const hex = value.trim().replace(/^#/, "");
  if (/^[\da-f]{3}$/i.test(hex)) {
    return "#" + Array.from(hex, (character) => character.repeat(2)).join("").toUpperCase();
  }
  return /^[\da-f]{6}$/i.test(hex) ? "#" + hex.toUpperCase() : null;
}

export function readableText(background: string): "#FFFFFF" | "#000000" {
  return contrastRatio("#FFFFFF", background) >= 4.5 ? "#FFFFFF" : "#000000";
}

function mix(color: string, target: string, weight: number): string {
  return "#" + [1, 3, 5].map((offset) => {
    const a = parseInt(color.slice(offset, offset + 2), 16);
    const b = parseInt(target.slice(offset, offset + 2), 16);
    return Math.round(a + (b - a) * weight).toString(16).padStart(2, "0");
  }).join("");
}

/** Accessible light and dark surfaces derived from a user-selected planner color. */
export function plannerTermColorVariables(color: string): Record<string, string> {
  const normalized = normalizeHex(color) ?? DEFAULT_PLANNER_TERM_COLOR;
  const lightBackground = mix(normalized, "#FFFFFF", 0.91);
  const darkBackground = mix(normalized, "#000000", 0.7);
  let lightText = normalized;
  for (let weight = 0; contrastRatio(lightText, lightBackground) < 4.5 && weight <= 1; weight += 0.05) {
    lightText = mix(normalized, "#000000", weight);
  }
  let darkText = normalized;
  for (let weight = 0; contrastRatio(darkText, darkBackground) < 4.5 && weight <= 1; weight += 0.05) {
    darkText = mix(normalized, "#FFFFFF", weight);
  }
  return {
    "--planner-term-border": mix(normalized, "#FFFFFF", 0.35),
    "--planner-term-bg": lightBackground,
    "--planner-term-text": lightText,
    "--planner-term-dark-border": mix(normalized, "#000000", 0.15),
    "--planner-term-dark-bg": darkBackground,
    "--planner-term-dark-text": darkText,
  };
}

function darkenForWhite(color: string): string {
  for (let weight = 0; weight < 1; weight += 0.05) {
    const shade = mix(color, "#000000", weight);
    if (contrastRatio("#FFFFFF", shade) >= 4.8) return shade;
  }
  return "#000000";
}

/** Produce the same numbered shades used by the Tailwind brand utilities. */
export function brandVariables(start: string, end: string): Record<string, string> {
  const base = darkenForWhite(start);
  const finish = darkenForWhite(end);
  const tint = (weight: number) => mix(base, "#FFFFFF", weight);
  const shade = (weight: number) => mix(base, "#000000", weight);
  return {
    "--color-brand-50": tint(0.95),
    "--color-brand-100": tint(0.87),
    "--color-brand-200": tint(0.76),
    "--color-brand-300": tint(0.65),
    "--color-brand-400": tint(0.5),
    "--color-brand-500": mix(base, finish, 0.5),
    "--color-brand-600": base,
    "--color-brand-700": base,
    "--color-brand-800": shade(0.2),
    "--color-brand-900": shade(0.4),
    "--color-brand-950": shade(0.57),
    "--brand-gradient": `linear-gradient(110deg in srgb, ${base}, ${finish})`,
    "--brand-gradient-hover": `linear-gradient(110deg in srgb, ${shade(0.2)}, ${mix(finish, "#000000", 0.2)})`,
  };
}

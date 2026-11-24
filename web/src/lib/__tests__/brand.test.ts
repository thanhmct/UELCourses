// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio, UELPATH_THEME_COLOR, UEL_COLORS } from "../brand";

const stylesheet = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../../../public/manifest.json", import.meta.url), "utf8"));
const light = stylesheet.match(/:root\s*\{([^}]+)\}/)![1];
const dark = stylesheet.match(/\.dark\s*\{([^}]+)\}/)![1];

function color(token: string, scope = stylesheet): string {
  const value = scope.match(new RegExp(`--${token}:\\s*([^;]+);`))?.[1];
  if (!value) throw new Error(`Missing color token: ${token}`);
  const reference = value.match(/^var\(--([\w-]+)\)$/)?.[1];
  return reference ? color(reference) : value;
}

function gradientStops(token: string, scope = light): string[] {
  const value = scope.match(new RegExp(`--${token}:\\s*([^;]+);`))?.[1];
  if (!value) throw new Error(`Missing gradient: ${token}`);
  return [...value.matchAll(/var\(--([\w-]+)\)/g)].map(([, reference]) => color(reference));
}

describe("UEL brand", () => {
  it("uses the official UEL colors consistently in TypeScript and CSS", () => {
    expect(UEL_COLORS).toEqual({
      blue: "#144E8C",
      accent: "#F05A23",
      info: "#00AEEF",
      white: "#FFFFFF",
    });
    expect(color("color-brand-700")).toBe(UEL_COLORS.blue);
    expect(color("color-brand-white")).toBe(UEL_COLORS.white);
    expect(color("color-accent")).toBe(UEL_COLORS.accent);
    expect(color("color-info")).toBe(UEL_COLORS.info);
  });

  it("identifies the installed app as UELPATH and uses the wordmark navy", () => {
    expect(manifest.name).toMatch(/^UELPATH\b/);
    expect(manifest.short_name).toBe("UELPATH");
    expect(manifest.id).toBe("/");
    expect(manifest.theme_color).toBe("#0B2A63");
    expect(manifest.theme_color).toBe(UELPATH_THEME_COLOR);
  });

  it("uses versioned UELPATH artwork instead of the retired globe icon", () => {
    expect(manifest.icons).toHaveLength(4);
    for (const icon of manifest.icons) {
      expect(icon.src).not.toContain("globe.svg");
      expect(icon.src).toContain("?v=uelpath-logo-");
      const assetPath = icon.src.split("?")[0];
      expect(() => readFileSync(new URL(`../../../public${assetPath}`, import.meta.url))).not.toThrow();
    }
  });

  it("calculates the reference contrast ratios", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBe(21);
    expect(contrastRatio(UEL_COLORS.accent, UEL_COLORS.accent)).toBe(1);
  });

  it.each([
    ["white on UEL blue", UEL_COLORS.white, UEL_COLORS.blue],
    ["white at both ends of the main gradient", UEL_COLORS.white, ...gradientStops("brand-gradient")],
    ["white at both ends of the hover gradient", UEL_COLORS.white, ...gradientStops("brand-gradient-hover")],
    ["white on the current-course chip", UEL_COLORS.white, color("color-brand-800")],
    ["muted text on the Today banner", color("color-brand-200"), UEL_COLORS.blue],
    ["selected timetable week", UEL_COLORS.white, UEL_COLORS.blue, color("color-brand-600")],
    ["orange action", color("color-accent-ink"), UEL_COLORS.accent, color("color-accent-hover")],
    ["light brand text", color("brand-ink", light), UEL_COLORS.white, "#F7F8FA"],
    ["dark brand text", color("brand-ink", dark), "#0F172A", "#020618"],
    ["light selected card", color("brand-ink", light), ...gradientStops("brand-selected-gradient")],
    ["dark selected card", color("brand-ink", dark), ...gradientStops("brand-selected-gradient", dark)],
    ["light info chip", color("info-ink", light), color("info-surface", light)],
    ["dark info chip", color("info-ink", dark), color("info-surface", dark)],
  ])("%s meets WCAG AA for normal text", (_, ink, ...surfaces) => {
    expect(surfaces.length).toBeGreaterThan(0);
    for (const surface of surfaces) {
      expect(contrastRatio(ink, surface)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

export const UELPATH_THEME_COLOR = "#0B2A63";

/** Source: UEL visual identity (bộ nhận diện thương hiệu UEL). */
export const UEL_COLORS = {
  blue: "#144E8C",
  accent: "#F05A23",
  info: "#00AEEF",
  white: "#FFFFFF",
} as const;

function relativeLuminance(hex: string): number {
  if (!/^#[\da-f]{6}$/i.test(hex)) {
    throw new Error("Expected a six-digit hex color");
  }
  const linear = (offset: number) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(1) + 0.7152 * linear(3) + 0.0722 * linear(5);
}

/** WCAG contrast ratio for two opaque six-digit hex sRGB colors. */
export function contrastRatio(foreground: string, background: string): number {
  const text = relativeLuminance(foreground);
  const surface = relativeLuminance(background);
  return (Math.max(text, surface) + 0.05) / (Math.min(text, surface) + 0.05);
}

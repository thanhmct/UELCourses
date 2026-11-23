import { brandVariables, normalizeHex } from "./appearance";
import type { HolidayTheme } from "./holidays";

const drum = "/festivals/dong-son-drum.svg";

export const FESTIVAL_THEMES = {
  tet: { colors: ["#8A243C", "#AC481E", "#F8CC71"], date: "01/01", lunar: true },
  hungKings: { colors: ["#5D4226", "#775322", "#EAC68A"], date: "10/03", lunar: true, image: drum },
  reunification: { colors: ["#8A2225", "#BA3425", "#FFD382"], date: "30/04" },
  national: { colors: ["#922218", "#BD3B20", "#FFD768"], date: "02/09" },
  halloween: { colors: ["#502668", "#743562", "#F8AB69"], date: "31/10", image: "/festivals/halloween.webp" },
  christmas: { colors: ["#14465A", "#1F645A", "#AEE6D5"], date: "25/12", image: "/festivals/christmas.webp" },
} as const satisfies Record<HolidayTheme, {
  colors: readonly [string, string, string];
  date: string;
  lunar?: boolean;
  image?: string;
}>;

export type TetFlower = "mai" | "dao";
const drumCredit = { source: "https://commons.wikimedia.org/wiki/File:Tr%E1%BB%91ng_%C4%91%E1%BB%93ng_%C4%90%C3%B4ng_S%C6%A1n.svg", by: "Tom Mai · CC0" };
export const FESTIVAL_CREDITS: Partial<Record<HolidayTheme | TetFlower, { source: string; by: string; license?: string }>> = {
  mai: { source: "https://commons.wikimedia.org/wiki/File:Ochna_integerrima.jpg", by: "Prenn (WebP)", license: "https://creativecommons.org/licenses/by-sa/3.0/" },
  dao: { source: "https://www.pexels.com/photo/pink-flowers-on-peach-tree-20583687/", by: "Lora Rikky · Pexels" },
  christmas: { source: "https://www.pexels.com/photo/a-decorated-christmas-tree-in-a-living-room-6181838/", by: "cottonbro studio · Pexels" },
  halloween: { source: "https://www.pexels.com/photo/pumpkin-patch-on-the-ground-during-nighttime-14399569/", by: "Steven Van Elk · Pexels" },
  hungKings: drumCredit,
};

export interface FestivalCustomization {
  accent?: string;
  backdrop?: "preset" | "color" | "custom";
  image?: string;
}

export function festivalColors(theme: HolidayTheme, flower: TetFlower) {
  return theme === "tet" && flower === "dao"
    ? ["#84284C", "#A3436D", "#FFC4DD"]
    : FESTIVAL_THEMES[theme].colors;
}

export function festivalVariables(theme: HolidayTheme, flower: TetFlower, customization?: FestivalCustomization) {
  const preset = FESTIVAL_THEMES[theme];
  const [start, end, highlight] = festivalColors(theme, flower);
  const accent = normalizeHex(customization?.accent ?? "") ?? start;
  const brand = brandVariables(accent, customization?.accent ? accent : end);
  const presetImage = theme === "tet" ? `/festivals/tet-${flower}.webp` : "image" in preset ? preset.image : null;
  let image = customization?.backdrop === "color" ? null : presetImage;
  if (customization?.backdrop === "custom" && customization.image && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(customization.image)) {
    image = customization.image;
  }
  const imageUrl = image ? `url("${image}")` : "none";
  const isDrum = image === drum;
  return {
    ...brand,
    "--festival-accent": brand["--color-brand-700"],
    "--festival-highlight": highlight,
    "--festival-image": imageUrl,
    "--festival-page-image": isDrum ? "none" : imageUrl,
    "--festival-content-background": isDrum ? `var(--festival-content-fade), ${imageUrl}` : "none",
  };
}

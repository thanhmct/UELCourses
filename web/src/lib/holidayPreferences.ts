"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { HOLIDAY_THEMES, type HolidayTheme } from "./holidays";
import type { FestivalCustomization } from "./holidayThemes";

interface HolidayPreferences {
  pinnedTheme: HolidayTheme | null;
  customizations: Partial<Record<HolidayTheme, FestivalCustomization>>;
  pinTheme: (theme: HolidayTheme | null) => void;
  customize: (theme: HolidayTheme, changes: FestivalCustomization) => void;
  reset: (theme: HolidayTheme) => void;
}

export const useHolidayPreferences = create<HolidayPreferences>()(persist(
  (set) => ({
    pinnedTheme: null,
    customizations: {},
    pinTheme: (pinnedTheme) => set({ pinnedTheme }),
    customize: (theme, changes) => set(({ customizations }) => ({
      customizations: { ...customizations, [theme]: { ...customizations[theme], ...changes } },
    })),
    reset: (theme) => set(({ customizations }) => {
      const next = { ...customizations };
      delete next[theme];
      return { customizations: next };
    }),
  }),
  {
    name: "uelcourses-holiday-themes",
    version: 1,
    migrate: (stored) => {
      const saved = (stored ?? {}) as {
        pinnedTheme?: string | null;
        customizations?: HolidayPreferences["customizations"] & { culture?: FestivalCustomization };
      };
      const customizations: HolidayPreferences["customizations"] = {};
      for (const theme of HOLIDAY_THEMES) {
        const customization = saved.customizations?.[theme];
        if (customization) customizations[theme] = customization;
      }
      if (!customizations.hungKings && saved.customizations?.culture) {
        customizations.hungKings = saved.customizations.culture;
      }
      const pinnedTheme = saved.pinnedTheme === "culture"
        ? "hungKings"
        : HOLIDAY_THEMES.find((theme) => theme === saved.pinnedTheme) ?? null;
      return { pinnedTheme, customizations };
    },
  },
));

export const FESTIVAL_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export type FestivalImageKind = "backdrop" | "mascot";

export async function readFestivalImage(file: File, kind: FestivalImageKind): Promise<string> {
  if (!FESTIVAL_IMAGE_TYPES.includes(file.type)) throw new Error("Unsupported image type");

  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context || !longestSide) throw new Error("Image processing unavailable");

    const backdrop = kind === "backdrop";
    const sizes = backdrop ? [1400, 1000, 700, 400, 200] : [384, 256, 160, 96];
    const format = backdrop ? "image/jpeg" : "image/webp";
    // Leave localStorage room for all nine backgrounds and the other settings.
    const maxBytes = backdrop ? 130_000 : 60_000;
    for (const limit of sizes) {
      const scale = Math.min(1, limit / longestSide);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      if (backdrop) {
        context.fillStyle = "#111827";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.66]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, format, quality));
        if (!blob || blob.size > maxBytes || (backdrop && blob.type !== format)) continue;
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") resolve(reader.result);
            else reject(new Error("Image could not be read"));
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      }
    }
    throw new Error("Image exceeds the device storage budget");
  } finally {
    URL.revokeObjectURL(source);
  }
}

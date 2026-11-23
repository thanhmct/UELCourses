"use client";

import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import { Flame, Snowflake } from "lucide-react";
import { useT } from "@/i18n";
import { useHolidayThemesText } from "@/i18n/holidayThemes";
import { holidayAppearanceFor, vietnamDate, type HolidayAppearance, type HolidayTheme } from "@/lib/holidays";
import { useHolidayPreferences } from "@/lib/holidayPreferences";
import { festivalVariables, type FestivalCustomization, type TetFlower } from "@/lib/holidayThemes";
import { useProgramProfile } from "@/lib/myProgram";
import { useSettings } from "@/lib/store";
import { useAcademicHolidays } from "@/lib/useAcademicHolidays";
import { useMounted } from "@/lib/useMounted";

const TimetableThemeContext = createContext<((appearance: HolidayAppearance | null | undefined) => void) | null>(null);

export function useTimetableHolidayAppearance(appearance: HolidayAppearance | null | undefined) {
  const selectAppearance = useContext(TimetableThemeContext);
  const theme = appearance?.theme;
  const date = appearance?.date;
  const isWeekSelected = appearance !== undefined;
  useEffect(() => {
    selectAppearance?.(theme && date ? { theme, date } : isWeekSelected ? null : undefined);
    return () => selectAppearance?.(undefined);
  }, [date, isWeekSelected, selectAppearance, theme]);
}

const fallPositions = [5, 12, 18, 26, 33, 40, 48, 54, 61, 68, 75, 83, 90, 96];

function HolidayFall({ theme, viewport = false }: { theme: HolidayTheme; viewport?: boolean }) {
  const snow = theme === "christmas";
  if (!snow && theme !== "tet") return null;

  return (
    <div className={`holiday-fall${viewport ? " holiday-fall-viewport" : ""}`} data-holiday-effect={snow ? "snow" : "blossoms"} aria-hidden="true">
      {fallPositions.map((left, index) => {
        const duration = (viewport ? 9 : 4) + index % 5;
        return (
          <span key={left} className="holiday-fall-track" style={{
            "--fall-left": `${left}%`,
            "--fall-duration": `${duration}s`,
            "--fall-delay": `${-((index * 3.1) % duration)}s`,
            "--fall-drift": `${(index % 4 - 1.5) * 1.25}rem`,
            "--fall-size": `${.65 + (index % 4) * .18}rem`,
          } as CSSProperties}>
            <span className={snow ? "holiday-snowflake" : index % 2 === 0 ? "holiday-blossom-mai" : "holiday-blossom-dao"}>
              {snow ? "❄︎" : "✿"}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function HolidayArtwork({ theme }: { theme: HolidayTheme }) {
  const { t } = useT();
  const winterMascot = useSettings((s) => s.winterMascot);
  const winterImage = useSettings((s) => s.winterImage);
  if (theme === "national" || theme === "reunification") {
    return <span className="holiday-flag" aria-hidden="true">★</span>;
  }
  if (theme === "christmas") {
    return (
      <div className="holiday-art flex items-center gap-2" aria-hidden="true">
        <Snowflake className="hidden size-7 sm:block" />
        {winterMascot === "custom" && winterImage
          ? <Image className="size-12 rounded-md object-contain" src={winterImage} width={48} height={48} alt="" unoptimized />
          : <span className="text-4xl">{winterMascot === "reindeer" ? "🦌" : "⛄"}</span>}
      </div>
    );
  }
  if (theme === "tet") {
    return (
      <span className="holiday-art holiday-blossoms" role="img" aria-label={t("holiday.bothFlowers")}>
        <span className="holiday-blossom-mai">✿</span>
        <span className="holiday-blossom-dao">✿</span>
        <span className="holiday-blossom-mai">✿</span>
        <span className="holiday-blossom-dao">✿</span>
      </span>
    );
  }
  if (theme === "hungKings") return <span className="holiday-art holiday-drum-mark" aria-hidden="true" />;
  return <Flame className="holiday-art size-8" aria-hidden="true" />;
}

export function HolidayBanner({ theme, customization, flower }: {
  theme: HolidayTheme;
  customization?: FestivalCustomization;
  flower: TetFlower;
}) {
  const { name } = useHolidayThemesText();
  return (
    <div data-festival={theme} data-backdrop={customization?.backdrop ?? "preset"} style={festivalVariables(theme, flower, customization) as CSSProperties}
      className="holiday-banner relative isolate flex min-h-18 items-center justify-between gap-3 rounded-xl px-4 py-3 sm:px-5">
      <HolidayFall theme={theme} />
      <p className="min-w-0 font-semibold sm:text-lg">{name(theme)}</p>
      <div className="shrink-0">
        <HolidayArtwork theme={theme} />
      </div>
    </div>
  );
}

export function HolidayAppearanceProvider({ children, showViewportEffects = true }: {
  children: ReactNode;
  showViewportEffects?: boolean;
}) {
  const mounted = useMounted();
  const enabled = useSettings((s) => s.holidayAppearance);
  const pinnedTheme = useHolidayPreferences((s) => s.pinnedTheme);
  const cohort = useSettings((s) => s.cohort);
  const flower = useSettings((s) => s.tetFlower);
  const { primaryParsed } = useProgramProfile();
  const [today, setToday] = useState(() => vietnamDate());
  const [weekAppearance, setWeekAppearance] = useState<HolidayAppearance | null>();
  const year = Number(today.slice(0, 4)) - (today.slice(5, 7) < "08" ? 1 : 0);
  const automatic = enabled && !pinnedTheme;
  const events = useAcademicHolidays(
    mounted && automatic && weekAppearance === undefined ? `${year}-${year + 1}` : undefined,
    primaryParsed?.cohort || cohort,
  );
  const appearance = mounted && automatic
    ? weekAppearance === undefined ? holidayAppearanceFor(today, today, events) : weekAppearance
    : null;
  const theme = mounted ? pinnedTheme ?? appearance?.theme : undefined;
  const customization = useHolidayPreferences((s) => theme ? s.customizations[theme] : undefined);

  useEffect(() => {
    if (!automatic) return;
    setToday(vietnamDate());
    const refreshDate = () => setToday(vietnamDate());
    const timer = window.setInterval(refreshDate, 30_000);
    document.addEventListener("visibilitychange", refreshDate);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshDate);
    };
  }, [automatic]);

  useEffect(() => {
    if (!theme) return;
    const { dataset, style } = document.body;
    const variables = festivalVariables(theme, flower, customization);
    dataset.festival = theme;
    for (const [key, value] of Object.entries(variables)) style.setProperty(key, value);
    return () => {
      delete dataset.festival;
      for (const key of Object.keys(variables)) style.removeProperty(key);
    };
  }, [theme, flower, customization]);

  return (
    <TimetableThemeContext.Provider value={setWeekAppearance}>
      {theme && showViewportEffects && <HolidayFall theme={theme} viewport />}
      {children}
    </TimetableThemeContext.Provider>
  );
}

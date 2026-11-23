"use client";

import { useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { CalendarDays, Check, Circle, ImagePlus, Pin, RotateCcw, Sparkles } from "lucide-react";
import { useT } from "@/i18n";
import { useHolidayThemesText } from "@/i18n/holidayThemes";
import { FESTIVAL_IMAGE_TYPES, readFestivalImage, useHolidayPreferences, type FestivalImageKind } from "@/lib/holidayPreferences";
import { FESTIVAL_CREDITS, FESTIVAL_THEMES, festivalColors, festivalVariables } from "@/lib/holidayThemes";
import { HOLIDAY_THEMES, type HolidayTheme } from "@/lib/holidays";
import { useSettings } from "@/lib/store";
import { HolidayBanner } from "./HolidayAppearance";

const modes = [
  { key: "default", icon: Circle },
  { key: "automatic", icon: CalendarDays },
  { key: "fixed", icon: Pin },
] as const;
const imageTypes = FESTIVAL_IMAGE_TYPES.join(",");

export function HolidaySettings() {
  const { t } = useT();
  const { labels, name } = useHolidayThemesText();
  const automatic = useSettings((s) => s.holidayAppearance);
  const setAutomatic = useSettings((s) => s.setHolidayAppearance);
  const flower = useSettings((s) => s.tetFlower);
  const setFlower = useSettings((s) => s.setTetFlower);
  const winterMascot = useSettings((s) => s.winterMascot);
  const setWinterMascot = useSettings((s) => s.setWinterMascot);
  const winterImage = useSettings((s) => s.winterImage);
  const setWinterImage = useSettings((s) => s.setWinterImage);
  const { pinnedTheme, pinTheme, customizations, customize, reset } = useHolidayPreferences();
  const [selected, setSelected] = useState<HolidayTheme>(pinnedTheme ?? "tet");
  const [imageError, setImageError] = useState<string>();
  const pendingImage = useRef(0);
  const [processingImage, setProcessingImage] = useState(false);
  const customization = customizations[selected];
  const accent = customization?.accent ?? festivalColors(selected, flower)[0];
  const credits = selected === "tet" ? FESTIVAL_CREDITS[flower] : FESTIVAL_CREDITS[selected];
  const mode = pinnedTheme ? "fixed" : automatic ? "automatic" : "default";

  function changeMode(next: (typeof modes)[number]["key"]) {
    if (next === "fixed") {
      pinTheme(selected);
    } else {
      setAutomatic(next === "automatic");
      pinTheme(null);
    }
  }

  function cancelImageUpload() {
    pendingImage.current++;
    setProcessingImage(false);
  }

  function selectTheme(theme: HolidayTheme) {
    cancelImageUpload();
    setImageError(undefined);
    setSelected(theme);
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>, kind: FestivalImageKind) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const request = ++pendingImage.current;
    setImageError(undefined);
    setProcessingImage(true);
    let image: string;
    try {
      image = await readFestivalImage(file, kind);
    } catch {
      if (request === pendingImage.current) setImageError(t("holiday.uploadError"));
      return;
    } finally {
      if (request === pendingImage.current) setProcessingImage(false);
    }
    if (request !== pendingImage.current) return;

    const { customizations: previous } = useHolidayPreferences.getState();
    const { winterMascot, winterImage } = useSettings.getState();
    try {
      if (kind === "backdrop") customize(selected, { image, backdrop: "custom" });
      else setWinterImage(image);
    } catch {
      try {
        if (kind === "backdrop") useHolidayPreferences.setState({ customizations: previous });
        else useSettings.setState({ winterMascot, winterImage });
      } catch { /* Zustand restores memory before the storage write. */ }
      setImageError(labels.imageSaveError);
    }
  }

  return (
    <section className="card space-y-5 rounded-xl sm:p-5" aria-labelledby="appearance-holidays">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <h2 id="appearance-holidays" className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="size-5 text-brand-ink" aria-hidden="true" />{t("holiday.settings")}
        </h2>
        <span className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
          <Check className="size-4 text-brand-ink" aria-hidden="true" />{labels.autosave}
        </span>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-2 xl:gap-6">
        <div className="min-w-0 space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{labels.mode}</legend>
            <div className="festival-mode grid grid-cols-3 gap-1 rounded-xl border p-1">
              {modes.map(({ key, icon: Icon }) => (
                <label key={key} className="cursor-pointer">
                  <input type="radio" name="holiday-mode" value={key} checked={mode === key}
                    onChange={() => changeMode(key)} className="peer sr-only" />
                  <span className="festival-mode-option flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-1.5 text-center text-xs font-semibold sm:text-sm">
                    <Icon className="hidden size-4 shrink-0 sm:block" aria-hidden="true" />{labels[key]}
                  </span>
                </label>
              ))}
            </div>
            {mode === "automatic" && <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{t("holiday.help")}</p>}
          </fieldset>

          <div role="group" aria-labelledby="holiday-gallery" className="space-y-2">
            <h3 id="holiday-gallery" className="text-sm font-semibold">{labels.gallery}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {HOLIDAY_THEMES.map((theme) => {
                const option = FESTIVAL_THEMES[theme];
                const date = "lunar" in option ? `${option.date} ${labels.lunar}` : option.date;
                const showFlag = theme === "national" || theme === "reunification";
                return (
                  <button key={theme} type="button" aria-pressed={selected === theme} aria-label={`${name(theme)} ${date}`}
                    title={labels.quickApply}
                    onClick={() => selectTheme(theme)}
                    onDoubleClick={() => {
                      selectTheme(theme);
                      pinTheme(theme);
                    }}
                    className="festival-option flex min-h-15 items-center gap-2 rounded-lg border p-2 text-left"
                    style={festivalVariables(theme, flower, customizations[theme]) as CSSProperties}>
                    <span className="festival-option-image grid size-9 shrink-0 place-items-center rounded-md sm:size-10" aria-hidden="true">
                      {showFlag
                        ? <span className="holiday-flag">★</span>
                        : selected === theme && <Check className="size-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs leading-snug font-semibold">{name(theme)}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-600 dark:text-slate-300">
                        {date}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="min-w-0 space-y-5">
          <div aria-labelledby="holiday-preview" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="holiday-preview" className="text-sm font-semibold">{t("holiday.preview")}</h3>
              {pinnedTheme === selected
                ? <span role="status" className="flex items-center gap-1 text-sm font-semibold text-brand-ink"><Check className="size-4" aria-hidden="true" />{labels.active}</span>
                : <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={() => changeMode("fixed")}>
                    {labels.apply}
                  </button>}
            </div>
            <div className="festival-demo overflow-hidden rounded-xl border" style={festivalVariables(selected, flower, customization) as CSSProperties}>
              <HolidayBanner theme={selected} flower={flower} customization={customization} />
              <div className="festival-demo-strip flex min-h-13 flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-5" aria-hidden="true">
                <span className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold brand-selected text-brand-ink">
                  <CalendarDays className="size-3.5" />{t("nav.timetable")}
                </span>
                <div className="flex gap-1.5">
                  {["200", "400", "700"].map((shade) => <span key={shade} className="size-4 rounded-full border border-black/10 dark:border-white/15"
                    style={{ backgroundColor: `var(--color-brand-${shade})` }} />)}
                </div>
              </div>
            </div>
          </div>

          <fieldset className="festival-customization min-w-0 space-y-3 rounded-xl border p-3 sm:p-4">
            <legend className="px-1 text-sm font-semibold">{labels.customize}</legend>
            <div className="grid items-end gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium">
                <span className="mb-1 block">{labels.accent}</span>
                <span className="festival-accent-field flex h-10 items-center gap-2 rounded-md border px-2.5">
                  <input type="color" aria-label={labels.accent} value={accent} onChange={(event) => customize(selected, { accent: event.target.value.toUpperCase() })}
                    className="size-7 shrink-0 cursor-pointer bg-transparent" />
                  <span className="font-mono text-sm" aria-hidden="true">{accent}</span>
                </span>
              </label>
              <label className="block text-xs font-medium">
                <span className="mb-1 block">{labels.background}</span>
                <select value={customization?.backdrop ?? "preset"} className="input h-10 px-2.5" onChange={(event) => {
                  const backdrop = event.target.value;
                  if (backdrop === "preset" || backdrop === "color" || backdrop === "custom") customize(selected, { backdrop });
                }}>
                  <option value="preset">{labels.presetBackground}</option>
                  <option value="color">{labels.colorBackground}</option>
                  {customization?.image && <option value="custom">{labels.customBackground}</option>}
                </select>
              </label>
              {selected === "tet" && (
                <label className="block text-xs font-medium">
                  <span className="mb-1 block">{t("holiday.flower")}</span>
                  <select className="input h-10 px-2.5" value={flower} onChange={(event) => setFlower(event.target.value === "dao" ? "dao" : "mai")}>
                    <option value="mai">{t("holiday.mai")}</option>
                    <option value="dao">{t("holiday.dao")}</option>
                  </select>
                </label>
              )}
              {selected === "christmas" && (
                <label className="block text-xs font-medium">
                  <span className="mb-1 block">{t("holiday.mascot")}</span>
                  <select className="input h-10 px-2.5" value={winterMascot} onChange={(event) => {
                    const mascot = event.target.value;
                    if (mascot === "snowman" || mascot === "reindeer" || mascot === "custom") setWinterMascot(mascot);
                  }}>
                    <option value="snowman">{t("holiday.snowman")}</option>
                    <option value="reindeer">{t("holiday.reindeer")}</option>
                    {winterImage && <option value="custom">{t("holiday.customMascot")}</option>}
                  </select>
                </label>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="btn-outline cursor-pointer px-2.5 text-xs focus-within:outline-2 focus-within:outline-brand-focus">
                <ImagePlus className="size-4" aria-hidden="true" />{labels.uploadBackground}
                <input className="sr-only" type="file" accept={imageTypes} onChange={(event) => void uploadImage(event, "backdrop")} />
              </label>
              {customization?.image && <button type="button" className="btn-outline px-2.5 text-xs" onClick={() => {
                cancelImageUpload();
                customize(selected, { image: undefined, ...(customization.backdrop === "custom" && { backdrop: "preset" }) });
              }}>{labels.removeBackground}</button>}
              {selected === "christmas" && <label className="btn-outline cursor-pointer px-2.5 text-xs focus-within:outline-2 focus-within:outline-brand-focus">
                {t("holiday.upload")}
                <input className="sr-only" type="file" accept={imageTypes} onChange={(event) => void uploadImage(event, "mascot")} />
              </label>}
              {selected === "christmas" && winterImage && <button type="button" className="btn-outline px-2.5 text-xs"
                onClick={() => { cancelImageUpload(); setWinterImage(""); }}>{t("holiday.removeImage")}</button>}
              <button type="button" className="btn-ghost px-2.5 text-xs" onClick={() => {
                cancelImageUpload();
                setImageError(undefined);
                reset(selected);
                if (selected === "tet") setFlower("mai");
                if (selected === "christmas") setWinterImage("");
              }}><RotateCcw className="size-3.5" aria-hidden="true" />{labels.reset}</button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">{t("holiday.uploadHelp")}</p>
            {processingImage && <p role="status" className="text-xs text-slate-600 dark:text-slate-300">{t("holiday.processingImage")}</p>}
            {imageError && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{imageError}</p>}
            {credits && <p className="text-xs text-slate-600 dark:text-slate-300">
              <a className="underline underline-offset-2" href={credits.source} referrerPolicy="no-referrer">{labels.source} · {credits.by}</a>
              {credits.license && <> · <a href={credits.license} className="underline underline-offset-2">CC BY-SA 3.0</a></>}
            </p>}
          </fieldset>
        </div>
      </div>
    </section>
  );
}

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AppearanceSettings } from "@/components/AppearanceSettings";
import { HolidayAppearanceProvider, useTimetableHolidayAppearance } from "@/components/HolidayAppearance";
import { ThemeApplier } from "@/components/ThemeApplier";
import { PALETTE, useSettings } from "@/lib/store";
import { brandVariables, plannerTermColorVariables, readableText } from "@/lib/appearance";
import { contrastRatio } from "@/lib/brand";
import { api } from "@/lib/api";
import { useHolidayPreferences } from "@/lib/holidayPreferences";
import * as festivalImages from "@/lib/holidayPreferences";
import type { HolidayAppearance } from "@/lib/holidays";

afterEach(() => {
  cleanup();
  useSettings.setState(useSettings.getInitialState());
  useSettings.persist.clearStorage();
  useHolidayPreferences.setState(useHolidayPreferences.getInitialState());
  useHolidayPreferences.persist.clearStorage();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("autosaves validated gradients and slot colors, and restores defaults", () => {
  render(<><ThemeApplier /><AppearanceSettings /></>);
  const firstStop = screen.getByRole("textbox", { name: "Màu đầu" });
  fireEvent.change(firstStop, { target: { value: "#fff" } });
  fireEvent.blur(firstStop);
  fireEvent.change(screen.getByRole("textbox", { name: "Màu cuối" }), { target: { value: "#FFC766" } });
  expect(useSettings.getState().brandGradient).toEqual(["#FFFFFF", "#FFC766"]);
  const style = document.documentElement.style;
  const vars = brandVariables("#FFFFFF", "#FFC766");
  expect(style.getPropertyValue("--brand-gradient")).toEqual(vars["--brand-gradient"]);
  expect(contrastRatio("#FFFFFF", vars["--color-brand-700"])).toBeGreaterThanOrEqual(4.8);
  fireEvent.click(screen.getAllByRole("button", { name: "Về màu UEL" })[0]);
  expect(style.getPropertyValue("--brand-gradient")).toBe("");

  const first = screen.getByRole("textbox", { name: /^Màu 1$/ });
  fireEvent.change(first, { target: { value: "FFF000" } });
  expect(useSettings.getState().timetableColors).toEqual({ 0: "#FFF000" });
  expect(JSON.parse(localStorage.getItem("uelcourses-settings")!).state.timetableColors).toEqual({ 0: "#FFF000" });
  expect(readableText("#FFF000")).toBe("#000000");
  expect(readableText("#144E8C")).toBe("#FFFFFF");
  const termColors = plannerTermColorVariables("#FFF000");
  expect(contrastRatio(termColors["--planner-term-text"], termColors["--planner-term-bg"])).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(termColors["--planner-term-dark-text"], termColors["--planner-term-dark-bg"])).toBeGreaterThanOrEqual(4.5);
  fireEvent.click(screen.getByRole("button", { name: "Khôi phục bảng màu" }));
  expect(first).toHaveValue(PALETTE[0]);

  const plannerColor = screen.getByRole("textbox", { name: "Màu ô học kỳ" });
  fireEvent.change(plannerColor, { target: { value: "#xyz" } });
  expect(plannerColor).toHaveAttribute("aria-invalid", "true");
  fireEvent.blur(plannerColor);
  expect(plannerColor).toHaveValue("#144E8C");
  fireEvent.change(plannerColor, { target: { value: "#7C3AED" } });
  expect(useSettings.getState().plannerTermColor).toBe("#7C3AED");
  expect(JSON.parse(localStorage.getItem("uelcourses-settings")!).state.plannerTermColor).toBe("#7C3AED");
  fireEvent.click(screen.getAllByRole("button", { name: "Về màu UEL" }).at(-1)!);
  expect(useSettings.getState().plannerTermColor).toBe("#144E8C");
});

it("keeps automatic holidays opt-in and retains separate mascot and Tết backdrop settings", async () => {
  vi.spyOn(api, "academicHolidays").mockResolvedValue({ data: [], mock: false });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-12-25T02:00:00Z"));
  const { container } = render(<HolidayAppearanceProvider><AppearanceSettings /></HolidayAppearanceProvider>);
  const automatic = screen.getByRole("radio", { name: "Theo ngày lễ" });
  expect(automatic).not.toBeChecked();
  expect(document.body.dataset.festival).toBeUndefined();
  fireEvent.change(screen.getByRole("combobox", { name: "Ảnh nền Tết" }), { target: { value: "dao" } });
  const flowers = screen.getByRole("img", { name: "Hoa mai vàng và hoa đào" });
  expect(flowers.querySelector(".holiday-blossom-mai")).toBeInTheDocument();
  expect(flowers.querySelector(".holiday-blossom-dao")).toBeInTheDocument();
  expect(container.querySelector('.festival-demo [data-holiday-effect="blossoms"]')).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Giáng sinh 25\/12/ }));
  expect(container.querySelector('.festival-demo [data-holiday-effect="snow"]')).toBeInTheDocument();
  expect(container.querySelector(".festival-demo .holiday-banner")).toHaveTextContent("Giáng sinh");
  const compressedImage = "data:image/webp;base64,d2VicA==";
  const processImage = vi.spyOn(festivalImages, "readFestivalImage").mockResolvedValue(compressedImage);
  const image = new File([new Uint8Array(1_200_000)], "mascot.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("Chọn ảnh linh vật"), { target: { files: [image] } });
  await waitFor(() => expect(useSettings.getState().winterImage).toBe(compressedImage));
  expect(processImage).toHaveBeenCalledWith(image, "mascot");
  expect(JSON.parse(localStorage.getItem("uelcourses-settings")!).state.winterImage).toBe(compressedImage);
  expect(screen.getByRole("combobox", { name: "Linh vật Giáng sinh" })).toHaveValue("custom");
  expect(useSettings.getState().tetFlower).toBe("dao");
  fireEvent.click(automatic);
  expect(useSettings.getState().holidayAppearance).toBe(true);
  expect(document.body.dataset.festival).toBe("christmas");
  expect(container.querySelector('.holiday-fall-viewport[data-holiday-effect="snow"]')).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "Mặc định" }));
  expect(document.body.dataset.festival).toBeUndefined();
  expect(container.querySelector(".holiday-fall-viewport")).toBeNull();
});

it("restores a pinned theme, color and backdrop from local storage and clears them on reset", async () => {
  render(<HolidayAppearanceProvider showViewportEffects={false}><AppearanceSettings /></HolidayAppearanceProvider>);
  fireEvent.click(screen.getByRole("button", { name: /Halloween 31\/10/ }));
  expect(document.body.dataset.festival).toBeUndefined();
  fireEvent.change(screen.getByLabelText("Màu chủ đạo"), { target: { value: "#602188" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Hình nền" }), { target: { value: "color" } });
  fireEvent.click(screen.getByRole("button", { name: "Dùng chủ đề này" }));
  expect(document.body.dataset.festival).toBe("halloween");
  expect(document.body.style.getPropertyValue("--festival-accent")).toBe("#602188");
  expect(document.body.style.getPropertyValue("--festival-image")).toBe("none");

  const stored = localStorage.getItem("uelcourses-holiday-themes")!;
  cleanup();
  useHolidayPreferences.setState(useHolidayPreferences.getInitialState());
  localStorage.setItem("uelcourses-holiday-themes", stored);
  await useHolidayPreferences.persist.rehydrate();
  render(<HolidayAppearanceProvider showViewportEffects={false}><AppearanceSettings /></HolidayAppearanceProvider>);
  expect(screen.getByRole("status")).toHaveTextContent("Đang dùng");
  expect(screen.getByRole("combobox", { name: "Hình nền" })).toHaveValue("color");
  expect(document.body.dataset.festival).toBe("halloween");
  fireEvent.click(screen.getByRole("button", { name: "Khôi phục chủ đề" }));
  expect(document.body.style.getPropertyValue("--festival-image")).toContain("halloween.webp");
  expect(useHolidayPreferences.getState().customizations.halloween).toBeUndefined();
});

it("previews on a single click and applies on a double click", () => {
  const { container } = render(<HolidayAppearanceProvider><AppearanceSettings /></HolidayAppearanceProvider>);
  const gallery = container.querySelector('[aria-labelledby="holiday-gallery"]')!;
  expect(gallery.querySelectorAll("button")).toHaveLength(6);
  const halloween = screen.getByRole("button", { name: /Halloween 31\/10/ });
  fireEvent.click(halloween);
  expect(container.querySelector(".holiday-banner")).toHaveTextContent("Halloween");
  expect(useHolidayPreferences.getState().pinnedTheme).toBeNull();

  const national = screen.getByRole("button", { name: /02\/09/ });
  expect(national.querySelector(".holiday-flag")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /30\/04/ }).querySelector(".holiday-flag")).toBeInTheDocument();
  fireEvent.doubleClick(national);
  expect(useHolidayPreferences.getState().pinnedTheme).toBe("national");
  expect(document.body.dataset.festival).toBe("national");
  expect(container.querySelector(".holiday-banner .holiday-flag")).toBeInTheDocument();
});

it.each([
  ["culture", "hungKings"],
  ["labour", null],
  ["newYear", null],
])("migrates a saved %s theme", async (pinnedTheme, expected) => {
  const customizations = { culture: { accent: "#68401F" }, labour: { accent: "#184D47" }, halloween: { backdrop: "color" } };
  localStorage.setItem("uelcourses-holiday-themes", JSON.stringify({ version: 0, state: { pinnedTheme, customizations } }));
  await useHolidayPreferences.persist.rehydrate();
  expect(useHolidayPreferences.getState().pinnedTheme).toBe(expected);
  expect(useHolidayPreferences.getState().customizations).toEqual({ hungKings: customizations.culture, halloween: customizations.halloween });
});

function TimetableWeek({ appearance }: { appearance?: HolidayAppearance | null }) {
  useTimetableHolidayAppearance(appearance);
  return null;
}

it("switches automatic themes from the date in Vietnam to the timetable week and back", async () => {
  vi.spyOn(api, "academicHolidays").mockResolvedValue({ data: [], mock: false });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-23T17:05:00Z"));
  useSettings.getState().setHolidayAppearance(true);
  const { container, rerender } = render(<HolidayAppearanceProvider><TimetableWeek /></HolidayAppearanceProvider>);
  await waitFor(() => expect(document.body.dataset.festival).toBe("hungKings"));
  rerender(<HolidayAppearanceProvider><TimetableWeek appearance={{ theme: "halloween", date: "2026-10-31" }} /></HolidayAppearanceProvider>);
  expect(document.body.dataset.festival).toBe("halloween");
  rerender(<HolidayAppearanceProvider><TimetableWeek appearance={null} /></HolidayAppearanceProvider>);
  expect(document.body.dataset.festival).toBeUndefined();
  rerender(<HolidayAppearanceProvider><TimetableWeek /></HolidayAppearanceProvider>);
  expect(document.body.dataset.festival).toBe("hungKings");
  vi.setSystemTime(new Date("2026-11-24T17:00:00Z"));
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(document.body.dataset.festival).toBe("christmas");
  expect(container.querySelector(".holiday-banner")).not.toBeInTheDocument();
  act(() => useHolidayPreferences.getState().pinTheme("national"));
  expect(document.body.dataset.festival).toBe("national");
  expect(container.querySelector("[data-holiday-effect]")).toBeNull();
  act(() => useHolidayPreferences.getState().pinTheme("reunification"));
  expect(container.querySelector("[data-holiday-effect]")).toBeNull();
  act(() => useHolidayPreferences.getState().pinTheme("tet"));
  const petals = container.querySelector('.holiday-fall-viewport[data-holiday-effect="blossoms"]');
  expect(petals).toHaveAttribute("aria-hidden", "true");
  expect(petals?.querySelector(".holiday-blossom-mai")).toBeInTheDocument();
  expect(petals?.querySelector(".holiday-blossom-dao")).toBeInTheDocument();
});

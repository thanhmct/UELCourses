# W36 — Hôm nay: 2 cột, lịch bên trái gọn lại, bản đồ 360° bên phải

Depends on W35 (`web/src/lib/campusTour.ts` with `sceneForRoom`, `tourUrl`, `TOUR_AREAS`).
Do NOT download/copy any vt360 files — embed `https://web-dhkinhteluat.vt360.vn/` via iframe only.

## Layout (`web/src/app/today/page.tsx`)
Keep the page title bar as is. Below it, on `lg` and up use a 2-column grid:
`grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]`.
On smaller screens the map goes BELOW the schedule.

### Left column — compact
1. Hero "next class" card: make it smaller: padding p-4, the 3 fields stack as
   subject (text-lg bold, truncate 2 lines) / one row with time (font-mono text-xl) + room (amber, text-xl) / lecturer small.
   Remove the 3-column wide grid. Live clock stays top-right but inline with "Môn học" label row.
   The room in the hero is a button: clicking selects that room on the map.
2. Tabs + arrows row unchanged.
3. Lesson cards: much tighter — remove `text-[1.3em]`, use `p-3 text-sm`; one line: code · time · room chip; second line: name (font-semibold); lecturer as small muted text. Keep status colors (ongoing/past) and the "1 buổi"/"Đã qua" badges.
   The whole card is a `<button type="button">` (or has role/aria-pressed) — click selects its room; selected card gets `ring-2 ring-brand-500`.
   Cards without room are not clickable for the map (still rendered).

### Right column — map, sticky
`lg:sticky lg:top-4 self-start` card containing:
- Header: "Bản đồ trường" + current room chip + scene name, link "Mở tab mới" (`target=_blank rel=noopener noreferrer`) to `tourUrl(scene)`.
- `<iframe>` src=`tourUrl(scene)`, `allow="fullscreen; gyroscope; accelerometer"`, allowFullScreen, title, height `h-[60vh] min-h-[360px]` w-full rounded. Key the iframe on scene so it reloads when room changes.
- Note under it when `!exact`: "Ảnh toàn cảnh tòa — chưa có ảnh riêng phòng này".
- Below the iframe: quick building chips from TOUR_AREAS (Toàn cảnh, Tòa A, Tòa B1, Tòa B2) that jump the iframe to that area's first scene.
- Initial selection: room of `nextLesson`, else first lesson with a room in the visible tab, else area "outdoor" first scene.
- Reuse `CampusTour360` pieces from W35 if sensible (e.g. extract a `TourFrame` component used by both venues and today); keep venues page working.

## i18n
Add keys (vi + en) in `web/src/i18n/vi.ts`/`en.ts`: `today.map.title`, `today.map.newTab`, `today.map.approx`, `today.map.areaOutdoor`, `today.map.areaA`, `today.map.areaB1`, `today.map.areaB2`, `today.map.pickHint`. Vietnamese UI, English code. Dark mode classes.

## Tests
- Update existing today tests if markup changed (keep behavior assertions).
- New test: rendering today in demo mode shows an iframe whose src starts with TOUR_BASE and encodes the next lesson's building scene; clicking another lesson card changes the iframe src; clicking a building chip changes it.

## Done when
In `web/`: `npx tsc --noEmit` and `npx vitest run` pass. No commit.

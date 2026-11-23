# W37 — Bản đồ khuôn viên tự vẽ (SVG), song ngữ, nhấp nháy theo tòa

Replace the always-on vt360 iframe on /today with OUR OWN hand-drawn SVG campus overview.
Do NOT copy/crop/trace any image from vt360. Draw simple original shapes. The real 360° tour
stays reachable only via a "Xem 360° / View 360°" button (opens `tourUrl(scene)` in a new tab,
reuse `web/src/lib/campusTour.ts`). This also cuts RAM: no iframe loads by default.

## 1. `web/src/components/CampusMap.tsx` (new)
Props: `{ target: CampusPlace | null; onPick?: (p: CampusPlace) => void; className?: string }`.
`type CampusPlace = "A" | "B1" | "B2" | "sports" | "parking" | "gate"`.

Stylised 3/4 bird's-eye SVG (viewBox ~ 0 0 800 450), layout as seen from the main gate (bottom):
- Road + main gate at bottom center, driveway up to Tòa A.
- Tòa A: tall building center (largest).
- Tòa B1: medium building right of A, linked to A by a small bridge (cầu thang nối A1–B1).
- Tòa B2: building far right, behind B1.
- Khu nhà xe: low flat roof behind, between A and B1.
- Sân thể thao & Nhà thi đấu: field (green rect with lane lines) + small hall, back-left.
- Trees as simple circles, lawn background. Use Tailwind/brand colors via CSS vars or classes; must look right in light AND dark mode.
Each place: a `<g role="button" tabIndex=0 aria-label=…>` clickable (Enter/Space too) → `onPick`.
Each place has a label pill above it (bilingual via i18n: "Tòa nhà A"/"Building A", "Tòa nhà B1"/"Building B1", "Tòa nhà B2"/"Building B2", "Sân thể thao"/"Sports ground", "Khu nhà xe"/"Parking", "Cổng chính"/"Main gate").
When `target` is set: a pin on the ROOF TOP of that place with a pulsing/blinking ring (CSS keyframes: scale+opacity, 1.2s infinite; respect `prefers-reduced-motion` → static highlight), label pill highlighted brand color, other places slightly dimmed.
When target === "sports": smoothly zoom the SVG viewBox (or CSS transform on a wrapper `g`, transition 600ms) onto the sports area. Other targets: full view. Also a small "Toàn cảnh / Full view" reset button.

## 2. `web/src/lib/campusTour.ts` — add
- `placeForRoom(room: string): CampusPlace | null` — A/A1/A2…→"A", B1→"B1", B2→"B2", B (no digit)→"B1", else null.
- `isPhysicalEducation(code: string, name: string): boolean` — code starts with "MI" (case-insens.) OR name matches /thể chất|GDTC|physical education/i.
- `placeForLesson(code, name, room): CampusPlace | null` — PE → "sports"; else placeForRoom(room); room text containing "sân"/"nhà thi đấu"/"NTĐ" → "sports".
- `sceneForPlace(p)` → tour scene: A→"Toàn cảnh Tòa A", B1→"Tòa B1 - Sảnh tầng G", B2→"Toàn cảnh Tòa B1- B2", sports→"Sân Thể thao & Nhà thi đấu", parking→"Khu Nhà xe", gate→"Cổng chính UEL".

## 3. `web/src/app/today/page.tsx`
Right column card: replace the iframe with `<CampusMap>`. Selected lesson → `placeForLesson(...)`. Header shows room chip + place label; below map: hint when room has no known building ("Chưa xác định được tòa của phòng này" / EN), and button "Xem 360°" → new tab `tourUrl(sceneForRoom(room).scene)` or `sceneForPlace(place)`. Clicking a place on the map highlights it (does not change selected lesson). Keep the building quick chips? Remove them — the map itself is clickable. Initial selection logic unchanged.

## 4. `/venues`
Leave CampusTour360 as is (lazy, opens on click).

## 5. i18n
All new strings in `web/src/i18n/vi.ts` AND `web/src/i18n/en.ts` (key prefix `campus.`); remove now-unused `today.map.area*` keys if unused. Test that EN mode shows "Building A".

## 6. Tests
- campusTour: placeForRoom, isPhysicalEducation (MI71, "Giáo dục thể chất 1", "GDTC"), placeForLesson PE → sports.
- CampusMap: renders 6 places; target="B1" puts aria-current / data-active on B1; target="sports" applies zoom (assert attribute/state); keyboard Enter on a place calls onPick.
- Today page: no iframe rendered by default; clicking a lesson card for B2 room activates B2; PE demo lesson (add one MI lesson to todayDemo if none) activates sports.

## Done when
In `web/`: `npx tsc --noEmit` and `npx vitest run` pass. No commit. Do not touch docs/HANDOFF.md.

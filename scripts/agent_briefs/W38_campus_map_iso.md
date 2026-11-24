# W38 — Vẽ lại CampusMap: 3D (isometric) theo sơ đồ mặt bằng thật của UEL

Rewrite `web/src/components/CampusMap.tsx` (from W37) as an ORIGINAL hand-drawn isometric (2.5D) SVG,
following the real campus plan below. Same props/behaviour as W37 (target, onPick, blinking pin on roof,
dim others, zoom, reduced-motion, keyboard, bilingual labels). No external images; do not embed any photo.

## Real layout (top = north, plan is a rectangle; convert to isometric: extrude buildings as boxes with
## lit top face, darker left/right faces; ground = lawn green; roads = grey bands)
Outer roads (draw as wide grey band around campus, with name labels):
- North: Đường Lương Văn Can. South: Đường Đỗ Mười (main road). West: Đường Trần Đại Nghĩa. East: Đường Hồ Xuân Hương.
- Suối Nhum: blue water strip along the inner east edge (north→south).
Internal roads (thin grey): Đường Thống Nhất (east–west, upper third, both halves), Đường Kiến Tạo (south-west, along south edge west half),
Đường Tương Lai (south edge east half), Đường Quản Lý (east–west just south of B1/B2), Đường Kinh Doanh (north–south, east side, west of Suối Nhum),
Đường Tiên Phong (north–south, west of A3/Hội trường), Đường Vượt Trội (north–south, east of A3/Hội trường), Đường Sáng Tạo (curving arc on west side from Cổng 2A down to Cổng 2), Đường Khởi Nghiệp/Thanh Niên arc inside it (inner west curve). Main driveway: from Cổng 1 straight north to Tòa A.
Places (approx. position as fraction of campus width x / height y, origin top-left):
- Tòa A: x 0.33–0.48, y 0.62–0.70 — long low-rise front building facing south (tallest-looking front block, ~8 floors).
- Hội trường: x 0.40–0.46, y 0.50–0.62 — directly behind (north of) Tòa A, joined to it.
- Tòa A3: x 0.38–0.51, y 0.25–0.43 — large square block north of Hội trường, plaza between them.
- Tòa B1: x 0.58–0.68, y 0.62–0.68 — east of Tòa A, linked to A by a small bridge.
- Tòa B2: x 0.68–0.74, y 0.58–0.68 — right next to B1 (taller).
- Khu vực thi công Tòa B3: x 0.75–0.86, y 0.56–0.68 — orange hatched area, label "Đang thi công Tòa B3" / "Building B3 (under construction)". Not pickable.
- Căn tin: x 0.29–0.36, y 0.43–0.49, inside west arc.
- Nhà xe ô tô: x 0.31–0.38, y 0.33–0.40, north of căn tin.
- Nhà xe máy: x 0.58–0.67, y 0.08–0.20, north-east, north of Đường Thống Nhất.
- Khu thể dục thể thao: x 0.17–0.33, y 0.10–0.22, north-west (draw fields/courts: green field with lines + small courts).
- Lake/garden with lotus: x 0.58–0.70, y 0.27–0.34 (decor). Semicircle plaza x 0.78–0.82, y 0.40–0.47 (decor).
- Gates (small pin + label): Cổng 1 (south, center x 0.48, on Đỗ Mười — MAIN), Cổng 2 (south-west corner), Cổng 2A (west, y 0.25), Cổng 3 (north, x 0.55, on Lương Văn Can).
- Trees: scatter simple round iso trees on lawns (west park, east lawn, north-east orchard), not on roads/buildings.
Building colors: warm cream/peach like the plan (light), muted slate in dark mode. Labels: pill above each building roof.

## Places type
`CampusPlace = "A" | "hall" | "A3" | "B1" | "B2" | "canteen" | "carPark" | "bikePark" | "sports" | "gate1" | "gate2" | "gate2A" | "gate3"`.
i18n (vi/en, prefix `campus.`): Tòa A/Building A, Hội trường/Auditorium, Tòa A3/Building A3, Tòa B1/Building B1, Tòa B2/Building B2,
Căn tin/Canteen, Nhà xe ô tô/Car park, Nhà xe máy/Motorbike park, Khu thể dục thể thao/Sports area, Cổng 1/Gate 1 …, Đang thi công Tòa B3/Building B3 (under construction), road names keep Vietnamese in both languages (they are proper names).

## Mapping updates in `web/src/lib/campusTour.ts`
- `placeForRoom`: "A3…"→"A3"; "A", "A1", "A2" →"A"; "B1"→"B1"; "B2"→"B2"; "B" no digit→"B1"; room text with "hội trường"/"HT"→"hall"; "sân"/"nhà thi đấu"/"NTĐ"/"thể dục"→"sports"; else null.
- PE lessons (isPhysicalEducation) → "sports" with zoom (keep).
- `sceneForPlace`: A→"Toàn cảnh Tòa A", hall→"Hội trường A", A3→"Toàn cảnh UEL (góc cao)", B1→"Tòa B1 - Sảnh tầng G", B2→"Toàn cảnh Tòa B1- B2", canteen/carPark→"Toàn cảnh UEL (chính diện)", bikePark→"Khu Nhà xe", sports→"Sân Thể thao & Nhà thi đấu", gate1→"Cổng chính UEL", gate2/gate2A/gate3→"Toàn cảnh UEL (chính diện)".
- Zoom: sports and bikePark zoom into their region; others full view. Reset button "Toàn cảnh / Full view".

## Extras
- Small legend toggle (collapsed by default): "Cổng ra vào / Gates", "Đang thi công / Under construction".
- Compass "B / N" (north arrow) in a corner.
- Keep "Xem 360°" button behaviour on /today.

## Tests
Update W37 tests to new place set: renders all pickable places (A, hall, A3, B1, B2, canteen, carPark, bikePark, sports, 4 gates); B3 area exists but not pickable; placeForRoom("A3.101")==="A3", ("A1.808")==="A", ("B2.205")==="B2"; EN mode shows "Auditorium"; target="sports" zooms.

## Done when
In `web/`: `npx tsc --noEmit` and `npx vitest run` pass. No commit. Do not touch docs/HANDOFF.md.

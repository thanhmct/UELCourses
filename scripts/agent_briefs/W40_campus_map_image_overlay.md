# W40 — Bản đồ khuôn viên = ảnh nền của người dùng + lớp SVG (chữ, tòa, cổng)

Replace the hand-drawn W39 drawing in `web/src/components/CampusMap.tsx` with:
- Base image (provided by the user, already in repo): `web/public/campus/campus-base.webp`, 1490×970 px, no text on it.
- One `<svg viewBox="0 0 1490 970">` containing `<image href="/campus/campus-base.webp" width=1490 height=970 preserveAspectRatio="xMidYMid meet"/>`
  and overlay layers drawn in code: road/water labels, building + gate hotspots with labels, pin/blink, zoom.
- NO legend/chú thích, NO movement arrows, NO barrier squares.
Keep everything else from W39: props, `CampusPlace` set, `campusPlaces.ts` descriptions, i18n, /today info panel, "Xem 360°", PE → sports zoom, reduced-motion, keyboard.

## Single data file: `web/src/lib/campusMapData.ts`
All coordinates live here (pixel coords of the 1490×970 image) so they can be fine-tuned later without touching the component.
Coordinates below are measured approximately — keep them as given.

### Places (pickable hotspots: rect x,y,w,h; label anchored at rect centre)
| place | rect (x, y, w, h) | label vi / en |
|---|---|---|
| sports | 272,183,198,45 | Khu thể dục thể thao / Sports area |
| bikePark | 887,153,93,62 | Nhà xe máy / Motorbike park |
| A3 | 641,287,173,153 | Tòa A3 / Building A3 |
| carPark | 485,343,92,50 | Nhà xe ô tô / Car park |
| canteen | 461,432,95,43 | Căn tin / Canteen |
| hall | 692,502,78,96 | Hội trường / Auditorium |
| A | 632,597,196,48 | Tòa A / Building A |
| B1 | 883,598,139,47 | Tòa B1 / Building B1 |
| B2 | 1022,572,73,90 | Tòa B2 / Building B2 |
Non-pickable area: B3 construction rect 1095,542,157,103 — label "Khu vực thi công Tòa B3" / "Building B3 (under construction)", subtle diagonal hatch overlay, no hover/focus.

### Gates (pickable; small gate marker + pill label offset so it doesn't cover roads)
| place | point (x, y) | label offset (dx, dy) | label |
|---|---|---|---|
| gate1 | 727,838 | 0,+40 → but keep inside image (y ≤ 950) | Cổng 1 / Gate 1 |
| gate2 | 145,815 | +55,+40 | Cổng 2 / Gate 2 |
| gate2A | 222,255 | +60,-28 | Cổng 2A / Gate 2A |
| gate3 | 845,68 | -70,0 | Cổng 3 / Gate 3 |

### Road / water labels (text only, not interactive; Vietnamese proper names in BOTH languages)
| text | x, y | rotate° |
|---|---|---|
| Đường Lương Văn Can | 745,32 | 0 |
| Đường Đỗ Mười | 745,905 | 0 |
| Đường Trần Đại Nghĩa | 82,470 | -81 |
| Đường Hồ Xuân Hương | 1432,470 | 90 |
| Suối Nhum | 1316,520 | 90 (white text) |
| Đường Thống Nhất | 395,252 | 0 |
| Đường Thống Nhất | 1120,254 | 0 |
| Đường Tiên Phong | 596,500 | 90 |
| Đường Vượt Trội | 862,520 | 90 |
| Đường Kinh Doanh | 1268,470 | 90 |
| Đường Quản Lý | 1000,681 | 0 |
| Đường Kiến Tạo | 400,808 | 0 |
| Đường Tương Lai | 1010,808 | 0 |
| Đường Sáng Tạo | 232,560 | -78 |
| Đường Thanh Niên | 380,640 | -35 |
Road label style: 13px semibold, fill #374151, white halo (`paint-order: stroke; stroke: white; stroke-width: 4`). On the grey outer roads use white fill + dark halo for contrast.

## Visual / interaction
- Building labels: 15px bold, dark red `#b42318` like the original plan, white halo; sits inside the rect.
- Hotspot rect: transparent fill; on hover/focus → `fill: rgba(37,99,235,.12)`, `stroke: #2563eb`, `stroke-width: 3`, rx 4, cursor pointer.
- Active target: same outline + pulsing ring + pin above rect top centre (reuse W37 animation); other hotspots unchanged (do not dim the photo).
- Zoom: animate viewBox (600ms ease) to the place's rect padded by 120px (keep aspect 1490:970, clamp inside image). Zoom happens for EVERY place when picked/targeted (user wants zoom on buildings & gates), sports included. "Toàn cảnh / Full view" button resets.
- Responsive: svg `w-full h-auto`; on narrow screens labels still readable (scale font with `vector-effect`-free approach: just rely on viewBox).
- Dark mode: keep the photo as is; only adjust the card background around it.
- `loading`: image has `decoding="async"`; give the svg an aria-label "Bản đồ khuôn viên UEL".

## Hover photos (prepare only — photos come later)
In `campusPlaces.ts` add optional `photo?: string` (path under `/campus/photos/`). CampusMap: on hover/focus of a hotspot that has `photo`, show a small floating card (200px wide, rounded, shadow) with the photo + name, positioned near the pointer/rect, `pointer-events: none`. When `photo` is undefined, show only a tooltip with the name. Do not add any photos now.

## Remove
Delete the W39 drawn shapes (lawn, roads, trees, buildings, compass, legend) and anything now unused. Keep `campusTour.ts` mapping.

## Tests
- CampusMap renders the base `<image>` with href `/campus/campus-base.webp`.
- All 13 pickable places have accessible names; B3 not focusable.
- Road labels render (e.g. "Đường Đỗ Mười"); no legend text ("Chú thích") present.
- Target "B2" → zoomed viewBox differs from full "0 0 1490 970"; reset restores it.
- Hover photo card appears only when `photo` defined (test with a mocked place).
- Keep /today tests green.

## Done when
In `web/`: `npx tsc --noEmit` and `npx vitest run` pass. No commit. Do not touch docs/HANDOFF.md.

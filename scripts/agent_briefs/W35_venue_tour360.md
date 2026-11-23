# W35 — Venues: xem tòa 360° khi chọn phòng

Goal: on `/venues`, when a room is selected, show a "Xem 360°" panel that opens the
official UEL 3DVista tour at the scene matching that room's building. Do NOT download
or copy any tour images/files — only link/embed `https://web-dhkinhteluat.vt360.vn/`.

## 1. `web/src/lib/campusTour.ts` (new)
- `export const TOUR_BASE = "https://web-dhkinhteluat.vt360.vn/";`
- `export function tourUrl(scene: string): string` → `TOUR_BASE + "#media-name=" + encodeURIComponent(scene)`.
- `export const TOUR_AREAS` — typed tree (area id, Vietnamese label, scenes[]) of the tour:
  - outdoor: "Toàn cảnh UEL (chính diện)", "Toàn cảnh UEL (góc nghiêng)", "Toàn cảnh UEL (góc cao)", "Toàn cảnh UEL (phía sau)", "Cổng chính UEL", "Toàn cảnh sân trước", "Sân trước (trước sảnh A1)", "Toàn cảnh Vườn tượng", "Vườn tượng", "Sân Thể thao & Nhà thi đấu", "Khu Nhà xe"
  - A: "Toàn cảnh Tòa A", "Sảnh A1", "Viện Đào tạo Ngoại ngữ", "Khu vực trưng bày mô hình UEL", "Hội trường A (trước cửa)", "Hội trường A", "Hội trường A (sân khấu)", "Hành lang thang máy", "Phòng nghiên cứu BI LAB", "Phòng máy tính", "Phòng SAP Next-gen Lab", "A1 - P. 808 - Phòng Hoa Sen", "Cầu thang nối Tòa A1 - B1"
  - B1: "Toàn cảnh Tòa B1- B2", "Tòa B1 - Sảnh tầng G", "Tòa B1- Hành lang tầng G", "Khu UELSpace", "Lớp Học Phát Triển Web KD"
  - B2: "Tòa B2 - Tầng G - Thư viện", "Khu vực mượn sách", "Khu vực trả sách", "Không gian thư viện", "Tòa B2 - Tầng 1 - Thư viện", "Thư viện", "Phòng R & D", "Phòng học", "Phòng học dạng nhóm"
  Scene strings must match EXACTLY (including odd spacing like "Tòa B1- B2").
- `export function sceneForRoom(room: string): { scene: string; areaId: string; exact: boolean }`
  Room codes come in forms like "A.709", "A1.108", "B.203", "B2.205", "C1.301", "A1.808" (case-insensitive, may have spaces):
  - A1 + room 808 → "A1 - P. 808 - Phòng Hoa Sen", exact=true
  - A / A1 / A2 … → "Toàn cảnh Tòa A"
  - B1 → "Tòa B1 - Sảnh tầng G"
  - B2 → "Toàn cảnh Tòa B1- B2"
  - B (no digit) → "Toàn cảnh Tòa B1- B2"
  - anything else (C…, unknown) → "Toàn cảnh UEL (chính diện)", areaId "outdoor"
  exact=false except the P.808 case.

## 2. `web/src/components/CampusTour360.tsx` (new, client component)
Props: `{ room: string }`. Renders a collapsible block (collapsed by default — iframe only mounts after the user clicks, so the heavy tour never loads unasked):
- Button "Xem tòa 360°" (lucide icon e.g. `Building2` or `Rotate3d`).
- When open: `<iframe src={tourUrl(scene)} title=… loading="lazy" allow="fullscreen; gyroscope; accelerometer" allowFullScreen className="aspect-video w-full rounded-lg border" />` plus a caption: scene name, a note when `!exact` ("Ảnh toàn cảnh tòa, chưa có ảnh riêng phòng này"), and a link "Mở tab mới" (`target="_blank" rel="noopener noreferrer"`).
- Re-key on room change so the iframe updates.
- All UI strings via i18n: add keys `venues.tour.open`, `venues.tour.close`, `venues.tour.newTab`, `venues.tour.approx`, `venues.tour.scene` to `web/src/i18n/vi.ts` and `web/src/i18n/en.ts`. Vietnamese UI, English code. Dark mode classes consistent with the page.

## 3. `web/src/app/venues/page.tsx`
Inside the right `<section>` (around line 486), when `selected` is set, render `<CampusTour360 room={selected.room} />` above `<RoomMonth …/>`. Do not change other layout.

## 4. Tests
- `web/src/lib/__tests__/campusTour.test.ts`: sceneForRoom for each case above; tourUrl encodes Vietnamese correctly; every scene referenced by sceneForRoom exists in TOUR_AREAS.
- Extend `web/src/app/venues/__tests__/page.test.tsx`: after selecting a room, the "Xem tòa 360°" button appears; clicking it renders an iframe whose src starts with TOUR_BASE.

## Done when
`npx tsc --noEmit` and `npx vitest run` (in `web/`) pass. No commit.

# W41 — Gắn ảnh thực tế + thêm Hồ sen

Photos already in repo (do not modify): `web/public/campus/photos/a3.webp`, `web/public/campus/photos/lotus-pond.webp` (800×533).

1. `campusPlaces.ts`: set `photo: "/campus/photos/a3.webp"` on A3.
2. New pickable place `lotusPond` (add to `CampusPlace` union everywhere it is enumerated):
   - Hotspot in `campusMapData.ts`: rect 880,275,155,105 (pond on the base image); label "Hồ sen" / "Lotus pond".
   - photo `/campus/photos/lotus-pond.webp`.
   - Description vi: "Hồ sen phía đông Tòa A3, giữa Đường Thống Nhất và Đường Vượt Trội; có cụm cây cắt chữ UEL trên bãi cỏ trước hồ. Phía bắc hồ là nhà xe máy." en equivalent.
   - tourScene: none.
3. Gate 1 pill currently overlaps the "Đường Đỗ Mười" road label: move the Đỗ Mười label to x 745 → 1000 (keep y 905) so they don't collide.
4. Hover card: show photo for A3 and lotusPond; also in the /today info panel, when the active place has a photo show it (rounded, w-full, aspect 3/2, object-cover, loading="lazy") above the description.
5. Tests: A3 hover shows img with src a3.webp; lotusPond is pickable with accessible name "Hồ sen"; info panel shows photo for A3.

Done when `npx tsc --noEmit` and `npx vitest run` pass in `web/`. No commit. Do not touch docs/HANDOFF.md.

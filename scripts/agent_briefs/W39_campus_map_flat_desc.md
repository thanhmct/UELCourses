# W39 — Bản đồ khuôn viên: vẽ lại PHẲNG (2D) gọn gàng theo sơ đồ mặt bằng + mô tả từng khu

Supersedes W38 (it was stopped mid-way; `CampusMap.tsx` / `campusTour.ts` / i18n / tests may be half-edited —
finish them into a consistent state). Drop the isometric/3D idea: draw a CLEAN FLAT top-down plan.
Original SVG only, no external images.

## Visual style (flat, tidy)
- viewBox 0 0 1000 640. Top = north. Soft palette: lawn `#e8f3e4` (dark: slate-800), roads light grey `#d9dde3`
  with white centre-dash for main roads (dark: slate-600), buildings rounded-rect `rx=6` cream `#f6e3cf`
  stroke `#d9b99a` (dark: slate-700 / slate-500), water `#9cc7f0`. Trees: few small circles only along edges
  (keep the map uncluttered — max ~40 trees). Consistent label font (12px, semibold), labels INSIDE building rects
  when they fit, otherwise a pill just above.
- Outer roads band with names: Đường Lương Văn Can (N), Đường Đỗ Mười (S, wider = main road),
  Đường Trần Đại Nghĩa (W), Đường Hồ Xuân Hương (E). Suối Nhum: blue strip inside the east edge.
- Internal roads (thin, labelled small, along the road): Thống Nhất (E–W upper third), Tiên Phong (N–S west of A3/Hội trường),
  Vượt Trội (N–S east of A3/Hội trường), Quản Lý (E–W south of B1/B2), Kinh Doanh (N–S east, west of Suối Nhum),
  Kiến Tạo (south edge, west half), Tương Lai (south edge, east half), Sáng Tạo (smooth arc on west side from Cổng 2A to Cổng 2).
  Main driveway Cổng 1 → Tòa A.
- Positions (fraction of inner campus width x / height y, origin top-left) — keep these proportions:
  Tòa A x .33–.48 y .62–.70 · Hội trường x .40–.46 y .50–.62 (joined to A) · Tòa A3 x .38–.51 y .25–.43 (plaza between A3 and Hội trường)
  Tòa B1 x .58–.68 y .62–.68 · Tòa B2 x .68–.74 y .58–.68 · bridge A↔B1 (thin line)
  Khu thi công Tòa B3 x .75–.86 y .56–.68 (orange `#f5a524` hatched, label "Đang thi công Tòa B3", NOT pickable)
  Căn tin x .29–.36 y .43–.49 · Nhà xe ô tô x .31–.38 y .33–.40 · Nhà xe máy x .58–.67 y .08–.20
  Khu thể dục thể thao x .17–.33 y .10–.22 (field with simple lines) · Hồ sen x .58–.70 y .27–.34 (decor)
  Gates: Cổng 1 (S, x .48, MAIN, larger), Cổng 2 (SW corner), Cổng 2A (W, y .25), Cổng 3 (N, x .55).
- Compass N arrow top-right. Small legend bottom-left: gate icon, construction area. No movement arrows/barriers.

## Interaction (same as W37)
Places: "A" | "hall" | "A3" | "B1" | "B2" | "canteen" | "carPark" | "bikePark" | "sports" | "gate1" | "gate2" | "gate2A" | "gate3".
Click / Enter / Space → onPick. `target` → blinking ring + pin over that place (reduced-motion → static), others dim to 50%.
sports / bikePark → zoom (viewBox transition 600ms); reset button "Toàn cảnh / Full view".

## Descriptions (NEW) — `web/src/lib/campusPlaces.ts`
Export `CAMPUS_PLACES: Record<CampusPlace, { nameKey: string; descKey: string; tourScene?: string }>`
and add i18n vi/en (prefix `campus.desc.`). Content (write EN equivalents):
- A: "Tòa nhà chính, nhìn ra cổng chính (Cổng 1). Có Sảnh A1, Viện Đào tạo Ngoại ngữ, khu trưng bày mô hình UEL, phòng máy tính, phòng SAP Next-gen Lab, phòng nghiên cứu BI LAB, phòng Hoa Sen (A1.808). Khoa Toán kinh tế: lầu 2, phòng 205. Nối sang Tòa B1 bằng cầu thang nối A1–B1."
- hall: "Hội trường A nằm ngay sau Tòa A — nơi tổ chức lễ, hội thảo, sự kiện lớn."
- A3: "Khối nhà lớn phía bắc Hội trường, có quảng trường ở giữa A3 và Hội trường."
- B1: "Phía đông Tòa A. Tầng G có sảnh, hành lang và Khu UELSpace (không gian tự học/sinh hoạt); có lớp học chuyên đề như Phát triển Web kinh doanh."
- B2: "Cạnh Tòa B1. Thư viện ở tầng G và tầng 1 (mượn/trả sách, không gian đọc), phòng R&D, phòng học và phòng học nhóm. Văn phòng các khoa: Luật & Luật kinh tế (lầu 3, P.303), Hệ thống thông tin (lầu 4, P.403), Quản trị kinh doanh (lầu 4, P.406), Kế toán – Kiểm toán (lầu 5, P.503), Tài chính – Ngân hàng (lầu 5, P.506), Kinh tế (lầu 6, P.601–603), Kinh tế đối ngoại (lầu 6, P.604)."
- canteen: "Căn tin trường, phía tây Tòa A3, cạnh nhà xe ô tô."
- carPark: "Nhà xe ô tô, phía bắc căn tin, vào từ Đường Tiên Phong."
- bikePark: "Nhà xe máy của sinh viên, góc đông bắc, gần Cổng 3 (Đường Lương Văn Can)."
- sports: "Khu thể dục thể thao (sân & nhà thi đấu) góc tây bắc — nơi học Giáo dục thể chất. Gần Cổng 2A."
- gate1: "Cổng chính, mở ra Đường Đỗ Mười, đi thẳng vào Tòa A."
- gate2: "Cổng góc tây nam, giao Đường Đỗ Mười – Trần Đại Nghĩa, theo Đường Sáng Tạo vào trong."
- gate2A: "Cổng phía tây trên Đường Trần Đại Nghĩa, gần khu thể thao."
- gate3: "Cổng phía bắc trên Đường Lương Văn Can, gần nhà xe máy."
tourScene per place = the W38 `sceneForPlace` mapping (keep `sceneForPlace` delegating to this).

## UI on /today (right card)
Under the map: an info panel for the active place (target, or last place clicked on map):
title (place name) + room chip if from a lesson + description paragraph + "Xem 360°" button (new tab, `tourUrl(scene)`)
when the place has a tourScene. When nothing known: hint "Chọn một buổi học hoặc bấm vào một khu trên bản đồ".
Keep the rest of /today unchanged.

## campusTour.ts mapping (keep W38 rules)
placeForRoom: A3…→A3; A/A1/A2→A; B1→B1; B2→B2; B→B1; "hội trường"/"HT"→hall; "sân"/"nhà thi đấu"/"NTĐ"/"thể dục"→sports; else null. PE → sports.

## Tests
- All pickable places render with accessible names; B3 area not focusable.
- Description shown for target (e.g. B2 contains "P.503" in VI; EN mode shows "Auditorium" for hall).
- placeForRoom cases incl. "A3.101"→A3, "A1.808"→A, "B2.205"→B2; PE→sports with zoom.
- /today: clicking a B2 lesson shows B2 description; no iframe by default.

## Done when
In `web/`: `npx tsc --noEmit` and `npx vitest run` pass. No commit. Do not touch docs/HANDOFF.md.

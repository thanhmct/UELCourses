"use client";
import { Suspense, useEffect, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { BottomNav, Header, SideNav } from "@/components/Header";
import { AppFooter } from "@/components/AppFooter";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { SatisfactionPopup } from "@/components/SatisfactionPopup";
import { HolidayAppearanceProvider } from "@/components/HolidayAppearance";
import { ConnectionNotice } from "@/components/MockBadge";
import { LoginReturnNotice } from "@/components/LoginReturnNotice";
import { startPlannerTimetableSync } from "@/lib/store";
import { recordVisit } from "@/lib/navHistory";

/** Ghi lại đường dẫn hiện tại vào ngăn xếp điều hướng phiên, để nút "Quay lại" dùng. */
function NavHistoryTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!pathname) return;
    const query = searchParams?.toString();
    recordVisit(query ? `${pathname}?${query}` : pathname);
    resetMobileZoom();
  }, [pathname, searchParams]);
  return null;
}

/**
 * Next.js không tải lại trang khi chuyển route (SPA), nên mức zoom do người dùng vô tình
 * phóng to/thu nhỏ (vd chạm vào huy hiệu "recommend") vẫn còn nguyên khi xem nội dung mới.
 * Ép lại maximum-scale=1 trong một nhịp để trình duyệt di động tự co về đúng tỉ lệ gốc,
 * rồi trả lại thẻ viewport ban đầu để người dùng vẫn phóng to/thu nhỏ thủ công được.
 */
function resetMobileZoom() {
  if (typeof document === "undefined") return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return;
  const original = meta.getAttribute("content");
  if (!original) return;
  meta.setAttribute("content", `${original}, maximum-scale=1.0`);
  window.setTimeout(() => meta.setAttribute("content", original), 60);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");
  const isSettings = pathname === "/settings";
  const isToday = pathname === "/today";
  // Kế hoạch ngắn khi các kỳ đang ẩn: để chân trang bám sát nội dung thay vì dồn xuống đáy màn hình.
  const isPlanner = pathname === "/planner";
  // Phòng học: bỏ khoảng trắng dưới nội dung trên máy tính (không còn thanh điều hướng đáy).
  const isVenues = pathname === "/venues";
  // Thời khóa biểu: lưới đã tự co theo nội dung, không cần kéo chân trang xuống đáy màn hình.
  const isTimetable = pathname === "/timetable";
  useEffect(() => {
    if (!isAdmin) return startPlannerTimetableSync();
  }, [isAdmin]);

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Suspense fallback={null}>
        <NavHistoryTracker />
        <LoginReturnNotice />
      </Suspense>
      <Header />
      <SideNav />
      {/* flex-1 + flex-col keeps the footer at the bottom of the screen on short pages */}
      <div className={`flex ${isPlanner || isVenues || isTimetable ? "flex-none" : "flex-1"} flex-col desk:pl-[13.25rem] ${isToday ? "desk:grid desk:h-[calc(100dvh-4.125rem)] desk:flex-none desk:grid-rows-[minmax(0,1fr)_auto]" : ""}`}>
        <main className={`mx-auto w-full max-w-[87.5rem] ${isPlanner || isTimetable ? "flex-none pb-4" : isVenues ? "flex-none pb-24 desk:pb-4" : "flex-1 pb-24"} px-3 py-4 md:px-5${isToday ? " desk:flex desk:min-h-0 desk:flex-col desk:pb-4" : ""}`}>
          {!isSettings && <ConnectionNotice />}
          <HolidayAppearanceProvider showViewportEffects={!isSettings}>{children}</HolidayAppearanceProvider>
        </main>
        <AppFooter />
      </div>
      <BottomNav />
      <FeedbackWidget />
      <SatisfactionPopup />
      {/* RegulationsChatPopup (floating AI chat) is hidden for now, along with the "Hỏi đáp AI" menu entry */}
    </div>
  );
}

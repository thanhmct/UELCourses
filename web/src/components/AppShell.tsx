"use client";
import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BottomNav, Header, SideNav } from "@/components/Header";
import { AppFooter } from "@/components/AppFooter";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { RegulationsChatPopup } from "@/components/regulations/RegulationsChatPopup";
import { HolidayAppearanceProvider } from "@/components/HolidayAppearance";
import { ConnectionNotice } from "@/components/MockBadge";
import { startPlannerTimetableSync } from "@/lib/store";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");
  const isSettings = pathname === "/settings";
  useEffect(() => {
    if (!isAdmin) return startPlannerTimetableSync();
  }, [isAdmin]);

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <>
      <Header />
      <SideNav />
      <div className="md:pl-[212px]">
        <main className="mx-auto max-w-[1400px] px-3 py-4 pb-24 md:px-5">
          {!isSettings && <ConnectionNotice />}
          <HolidayAppearanceProvider showViewportEffects={!isSettings}>{children}</HolidayAppearanceProvider>
        </main>
        <AppFooter />
      </div>
      <BottomNav />
      <FeedbackWidget />
      <RegulationsChatPopup />
    </>
  );
}

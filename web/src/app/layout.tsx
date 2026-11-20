import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav, Header, SideNav } from "@/components/Header";
import { AppFooter } from "@/components/AppFooter";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { CommandPalette } from "@/components/CommandPalette";
import { ThemeApplier, themeInitScript } from "@/components/ThemeApplier";
import { PwaRegister } from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: { default: "UELCourses — Lập kế hoạch học tập UEL", template: "%s · UELCourses" },
  description: "Tra cứu học phần, xếp thời khóa biểu, lập kế hoạch nhiều học kỳ và hỏi đáp quy chế học vụ cho sinh viên UEL.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "UELCourses",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b4f9c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen">
        <ThemeApplier />
        <Header />
        <SideNav />
        <div className="md:pl-[170px]">
          <main className="mx-auto max-w-[1400px] px-3 py-4 pb-24 md:px-5">{children}</main>
          <AppFooter />
        </div>
        <BottomNav />
        <FeedbackWidget />
        <CommandPalette />
        <PwaRegister />
      </body>
    </html>
  );
}

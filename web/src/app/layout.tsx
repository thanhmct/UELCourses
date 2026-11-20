import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { CommandPalette } from "@/components/CommandPalette";
import { ThemeApplier, themeInitScript } from "@/components/ThemeApplier";
import { PwaRegister } from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: { default: "UELPlan — Lập kế hoạch học tập UEL", template: "%s · UELPlan" },
  description: "Tra cứu học phần, xếp thời khóa biểu, lập kế hoạch nhiều học kỳ và hỏi đáp quy chế học vụ cho sinh viên UEL.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "UELPlan",
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
        <main className="mx-auto max-w-7xl px-4 py-6 pb-24">{children}</main>
        <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500 dark:border-slate-800">
          UELPlan — dự án khóa luận, không phải sản phẩm chính thức của Trường ĐH Kinh tế – Luật.
        </footer>
        <FeedbackWidget />
        <CommandPalette />
        <PwaRegister />
      </body>
    </html>
  );
}

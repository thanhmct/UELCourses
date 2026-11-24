import type { Metadata, Viewport } from "next";
import "./globals.css";
import { UELPATH_THEME_COLOR } from "@/lib/brand";
import { AppShell } from "@/components/AppShell";
import { CommandPalette } from "@/components/CommandPalette";
import { ThemeApplier, themeInitScript } from "@/components/ThemeApplier";
import { PwaRegister } from "@/components/PwaRegister";
import { GlobalProgramProfileDialog } from "@/components/ProgramProfileDialog";
import { AppDialog } from "@/components/AppDialog";

export const metadata: Metadata = {
  title: { default: "UELPATH", template: "%s · UELPATH" },
  description: "Module search, timetable planning, multi-semester study planning, and academic regulations Q&A for UEL students.",
  manifest: "/manifest.json?v=uelpath-logo-20261123",
  icons: {
    icon: [
      { url: "/icon.svg?v=uelpath-logo-20261123", type: "image/svg+xml" },
      { url: "/favicon.ico?v=uelpath-logo-20261123", type: "image/x-icon" },
    ],
    shortcut: "/favicon.ico?v=uelpath-logo-20261123",
    apple: "/apple-icon.png?v=uelpath-logo-20261123",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "UELPATH",
  },
};

export const viewport: Viewport = {
  themeColor: UELPATH_THEME_COLOR,
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
        <AppShell>{children}</AppShell>
        <CommandPalette />
        <PwaRegister />
        <GlobalProgramProfileDialog />
        <AppDialog />
      </body>
    </html>
  );
}

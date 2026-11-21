"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BookOpen,
  CalendarDays,
  CalendarRange,
  GraduationCap,
  Home,
  Languages,
  MessageSquarePlus,
  MoreHorizontal,
  Moon,
  Network,
  Repeat2,
  Scale,
  School,
  Search,
  Settings,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { MockBadge } from "./MockBadge";
import { openCommandPalette } from "./CommandPalette";
import { useSettings } from "@/lib/store";
import { useMounted } from "@/lib/useMounted";
import { useLang, useT } from "@/i18n";
import { parseProgramCode } from "@/lib/programCode";
import { appPrompt } from "@/lib/dialog";

export interface NavItem {
  href: string;
  /** translation key of the label */
  labelKey: string;
  icon: LucideIcon;
  /** one of the 5 main tabs on mobile */
  main?: boolean;
}

export const NAV: NavItem[] = [
  { href: "/today", labelKey: "nav.today", icon: Home, main: true },
  { href: "/timetable", labelKey: "nav.timetable", icon: CalendarDays, main: true },
  { href: "/modules", labelKey: "nav.modules", icon: BookOpen, main: true },
  { href: "/venues", labelKey: "nav.venues", icon: School },
  { href: "/planner", labelKey: "nav.planner", icon: CalendarRange, main: true },
  { href: "/programs", labelKey: "nav.programs", icon: Network, main: true },
  { href: "/equivalents", labelKey: "nav.equivalents", icon: Repeat2 },
  { href: "/regulations", labelKey: "nav.regulations", icon: Scale },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
];

const isActive = (path: string, href: string) => path === href || path.startsWith(href + "/");
export const openFeedback = () => window.dispatchEvent(new Event("uel:feedback"));

export function Logo() {
  const { t } = useT();
  return (
    <Link href="/" className="flex items-center gap-2 text-[27px] font-bold tracking-tight" aria-label={t("header.home")}>
      <GraduationCap className="h-[30px] w-[30px] text-brand-600 dark:text-brand-300" aria-hidden />
      <span>
        <span className="text-brand-600 dark:text-brand-300">UEL</span>
        <span className="text-slate-800 dark:text-slate-100">Courses</span>
      </span>
    </Link>
  );
}

/** Language switch VI / EN; stored in localStorage (default Vietnamese). */
export function LangToggle() {
  const { t, lang } = useT();
  const setLang = useLang((s) => s.setLang);
  const next = lang === "vi" ? "en" : "vi";
  return (
    <button
      onClick={() => setLang(next)}
      className="flex items-center gap-1.5 rounded px-3 py-1.5 text-[18px] font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      aria-label={t("header.langAria")}
      title={t("header.langAria")}
    >
      <Languages className="h-[18px] w-[18px]" aria-hidden />
      {lang === "vi" ? "VI" : "EN"}
    </button>
  );
}

/** Ô mã CTĐT trên thanh trên (vd K23406E); bấm để sửa, đổi lại được bất cứ lúc nào. */
function HeaderProgramCode() {
  const code = useSettings((s) => s.programCode);
  const setCode = useSettings((s) => s.setProgramCode);

  // Bấm nút → hộp thoại nổi để nhập mã (kiểm tra định dạng ngay trong hộp thoại).
  const edit = async () => {
    const v = await appPrompt("Nhập mã lớp của bạn để hệ thống lọc lại theo chương trình đào tạo từ phía nhà trường.", {
      title: "Mã lớp của bạn",
      defaultValue: code,
      placeholder: "VD: K23406E1",
      okLabel: "Lưu mã",
      validate: (x) => (parseProgramCode(x) ? null : "Mã lớp chưa đúng. Ví dụ: K23406E1, K24416A hoặc K23406H."),
    });
    const parsed = v ? parseProgramCode(v) : null;
    if (parsed) setCode(parsed.normalized);
  };

  return (
    <button
      type="button"
      onClick={edit}
      className="hidden items-center gap-2 rounded border border-slate-200 px-3 py-1.5 text-[18px] text-slate-600 hover:bg-slate-50 sm:flex dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      title="Mã lớp của bạn — bấm để đổi"
    >
      {code ? <span className="font-mono font-semibold">{code}</span> : <span>Nhập mã lớp</span>}
    </button>
  );
}

/** Thin top bar: wordmark, quick search, program code, language and dark-mode toggles. */
export function Header() {
  const { t } = useT();
  const mounted = useMounted();
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const dark = mounted && (theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches));
  return (
    <header className="sticky top-0 z-30 flex h-[66px] items-center gap-[18px] border-b border-slate-200 bg-white px-[18px] dark:border-slate-800 dark:bg-slate-900">
      <Logo />
      <MockBadge />
      <div className="ml-auto flex items-center gap-3">
        <HeaderProgramCode />
        <button
          onClick={openCommandPalette}
          className="flex items-center gap-3 rounded border border-slate-200 px-3 py-1.5 text-[18px] text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          aria-label={t("header.searchAria")}
        >
          <Search className="h-[18px] w-[18px]" aria-hidden />
          <span className="hidden sm:inline">{t("header.search")}</span>
          <kbd className="hidden rounded bg-slate-100 px-1.5 text-[15px] sm:inline dark:bg-slate-800">Ctrl K</kbd>
        </button>
        <LangToggle />
        <button
          onClick={() => setTheme(dark ? "light" : "dark")}
          className="rounded p-2.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label={dark ? t("header.toLight") : t("header.toDark")}
          aria-pressed={dark}
        >
          {dark ? <Sun className="h-6 w-6" aria-hidden /> : <Moon className="h-6 w-6" aria-hidden />}
        </button>
      </div>
    </header>
  );
}

/** Fixed left navigation (md and up). */
export function SideNav() {
  const { t } = useT();
  const path = usePathname();
  return (
    <nav
      className="fixed bottom-0 left-0 top-[66px] z-20 hidden w-[212px] flex-col overflow-y-auto border-r border-slate-200 bg-white py-2 md:flex dark:border-slate-800 dark:bg-slate-900"
      aria-label={t("nav.main")}
    >
      {NAV.map((n) => {
        const on = isActive(path, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={on ? "page" : undefined}
            className={`mx-2.5 my-px flex items-center gap-3 rounded px-3 py-2 text-[17.5px] ${
              on
                ? "bg-brand-600 font-semibold text-white"
                : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <n.icon className="h-5 w-5 shrink-0" aria-hidden />
            {t(n.labelKey)}
          </Link>
        );
      })}
      <button
        onClick={openFeedback}
        className="mx-2.5 my-px flex items-center gap-3 rounded px-3 py-2 text-left text-[17.5px] text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <MessageSquarePlus className="h-5 w-5 shrink-0" aria-hidden />
        {t("nav.feedback")}
      </button>
    </nav>
  );
}

/** Bottom tab bar (below md): 5 main items + "Thêm". */
export function BottomNav() {
  const { t } = useT();
  const path = usePathname();
  const [more, setMore] = useState(false);
  const main = NAV.filter((n) => n.main);
  const rest = NAV.filter((n) => !n.main);
  return (
    <>
      {more && (
        <div className="fixed inset-x-0 bottom-14 z-30 border-t border-slate-200 bg-white p-2 md:hidden dark:border-slate-800 dark:bg-slate-900">
          <ul className="grid grid-cols-2 gap-1">
            {rest.map((n) => (
              <li key={n.href}>
                <Link href={n.href} onClick={() => setMore(false)} className="flex items-center gap-2 rounded px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
                  <n.icon className="h-4 w-4" aria-hidden /> {t(n.labelKey)}
                </Link>
              </li>
            ))}
            <li>
              <button
                onClick={() => {
                  setMore(false);
                  openFeedback();
                }}
                className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <MessageSquarePlus className="h-4 w-4" aria-hidden /> {t("nav.feedback")}
              </button>
            </li>
          </ul>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-14 border-t border-slate-200 bg-white md:hidden dark:border-slate-800 dark:bg-slate-900" aria-label={t("nav.mobile")}>
        {main.map((n) => {
          const on = isActive(path, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={on ? "page" : undefined}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] ${on ? "font-semibold text-brand-600 dark:text-brand-300" : "text-slate-500"}`}
            >
              <n.icon className="h-5 w-5" aria-hidden />
              {t(n.labelKey)}
            </Link>
          );
        })}
        <button
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-slate-500"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden />
          {t("nav.more")}
        </button>
      </nav>
    </>
  );
}

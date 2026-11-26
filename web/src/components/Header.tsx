"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BookMarked,
  BookOpen,
  Bot,
  CalendarDays,
  CalendarRange,
  Home,
  Languages,
  MessageSquarePlus,
  MoreHorizontal,
  Moon,
  School,
  Search,
  Settings,
  SlidersHorizontal,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { MockBadge } from "./MockBadge";
import { openCommandPalette } from "./CommandPalette";
import { useSettings } from "@/lib/store";
import { useMounted } from "@/lib/useMounted";
import { useLang, useT } from "@/i18n";
import { ProgramFilterBar } from "./ProgramFilterBar";

export interface NavItem {
  href: string;
  /** translation key of the label */
  labelKey: string;
  /** nhãn ngắn dùng ở thanh dưới điện thoại, nơi nhãn dài bị xuống dòng */
  shortKey?: string;
  icon: LucideIcon;
  /** one of the main tabs on mobile */
  main?: boolean;
  /** kept as a route but not shown in the menus */
  hidden?: boolean;
}

export const NAV_PRIMARY: NavItem[] = [
  { href: "/today", labelKey: "nav.today", icon: Home, main: true },
  { href: "/timetable", labelKey: "nav.timetable", shortKey: "nav.timetableShort", icon: CalendarDays, main: true },
  { href: "/timetable/optimize", labelKey: "tt.optimize.tab", shortKey: "nav.optimizeShort", icon: SlidersHorizontal, main: true },
  { href: "/modules", labelKey: "nav.modules", icon: BookOpen, main: true },
  { href: "/planner", labelKey: "nav.planner", icon: CalendarRange, main: true },
  { href: "/venues", labelKey: "nav.venues", icon: School },
  { href: "/regulations", labelKey: "nav.regulations", icon: Bot, hidden: true },
];

export const NAV_SECONDARY: NavItem[] = [
  { href: "/books", labelKey: "nav.books", icon: BookMarked, hidden: true },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
];

export const NAV: NavItem[] = [...NAV_PRIMARY, ...NAV_SECONDARY];

const visiblePrimary = () => NAV_PRIMARY.filter((n) => !n.hidden);
const visibleSecondary = (href: string) => NAV_SECONDARY.find((n) => n.href === href && !n.hidden);

const matchesPath = (path: string, href: string) => path === href || path.startsWith(href + "/");
const isActive = (path: string, href: string) => matchesPath(path, href) &&
  !NAV.some((item) => item.href.startsWith(href + "/") && matchesPath(path, item.href));
export const openFeedback = () => window.dispatchEvent(new Event("uel:feedback"));

/** Nhãn đầy đủ; chỉ chuyển sang nhãn ngắn khi nhãn đầy đủ không vừa một dòng. */
function FitLabel({ full, short }: { full: string; short?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const [tight, setTight] = useState(false);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !short) return;
    const measure = () => {
      const need = probe.current?.offsetWidth ?? 0;
      setTight(need > el.clientWidth + 0.5);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [full, short]);

  if (!short) return <>{full}</>;
  return (
    <span ref={box} className="relative block w-full min-w-0 text-center">
      <span ref={probe} aria-hidden className="invisible absolute left-0 top-0 whitespace-nowrap">{full}</span>
      <span aria-label={full}>{tight ? short : full}</span>
    </span>
  );
}

export function Logo() {
  const { t } = useT();
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2" aria-label={t("header.home")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/uelpath-wordmark-tight.webp"
        alt="UELPATH"
        width={166}
        height={29}
        className="aspect-[166/29] h-[26px] w-auto max-w-none shrink-0 object-contain sm:h-[29px] dark:rounded-md dark:bg-white dark:px-1.5 dark:py-1"
      />
      <span className="holiday-flag header-holiday-flag" aria-hidden="true">★</span>
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
      className="flex items-center gap-1.5 rounded px-2 py-1.5 text-[18px] desk:px-3 font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      aria-label={t("header.langAria")}
      title={t("header.langAria")}
    >
      <Languages className="h-[18px] w-[18px]" aria-hidden />
      {lang === "vi" ? "VI" : "EN"}
    </button>
  );
}

/** Thẻ CTĐT trên thanh trên (phiên bản gọn của ProgramFilterBar); bấm để sửa ngành chính / ngành 2 trong ProgramProfileDialog. */
export function HeaderProgramCode() {
  const setProgramProfile = useSettings((s) => s.setProgramProfile);
  const handleClear = useCallback(() => {
    setProgramProfile("", "");
  }, [setProgramProfile]);

  return (
    <div className="order-last flex min-w-0 basis-full items-center justify-center sm:order-none sm:ml-auto sm:basis-auto">
      <ProgramFilterBar
        compact
        onClearFilter={handleClear}
      />
    </div>
  );
}

/** Thin top bar: wordmark, quick search, program code, language and dark-mode toggles. */
export function Header() {
  const { t } = useT();
  const mounted = useMounted();
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const onToast = (e: Event) => {
      const msg = (e as CustomEvent<string>).detail;
      if (msg) {
        setToast(msg);
        setTimeout(() => setToast(null), 2500);
      }
    };
    window.addEventListener("uel:toast", onToast);
    return () => window.removeEventListener("uel:toast", onToast);
  }, []);

  // Publish the real header height so sticky bars can sit right under it.
  const headerRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const publish = () => document.documentElement.style.setProperty("--app-header-h", `${el.offsetHeight}px`);
    publish();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dark = mounted && (theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches));
  return (
    <>
      <header ref={headerRef} className="sticky top-0 z-30 flex min-h-[4.125rem] flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-slate-200 bg-white px-3 py-1.5 sm:flex-nowrap sm:gap-x-3 desk:h-[4.125rem] desk:px-[1.125rem] dark:border-slate-800 dark:bg-slate-900">
        <Logo />
        <MockBadge />
        <HeaderProgramCode />
        <div className="ml-auto flex shrink-0 items-center gap-0 sm:ml-0 desk:gap-3">
          <button
            onClick={openCommandPalette}
            className="flex items-center gap-3 rounded border border-slate-200 px-2.5 py-1.5 text-[18px] text-slate-600 hover:bg-slate-50 desk:px-3 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label={t("header.searchAria")}
          >
            <Search className="h-[18px] w-[18px]" aria-hidden />
            <span className="hidden desk:inline">{t("header.search")}</span>
            <kbd className="hidden rounded bg-slate-100 px-1.5 text-[15px] desk:inline dark:bg-slate-800">Ctrl K</kbd>
          </button>
          <LangToggle />
          <button
            onClick={() => setTheme(dark ? "light" : "dark")}
            className="rounded p-2 text-slate-600 desk:p-2.5 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label={dark ? t("header.toLight") : t("header.toDark")}
            aria-pressed={dark}
          >
            {dark ? <Sun className="h-6 w-6" aria-hidden /> : <Moon className="h-6 w-6" aria-hidden />}
          </button>
        </div>
      </header>
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 left-1/2 z-[100] -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-xl dark:bg-slate-100 dark:text-slate-900 desk:bottom-6"
        >
          {toast}
        </div>
      )}
    </>
  );
}

/** Fixed left navigation (md and up). */
export function SideNav() {
  const { t } = useT();
  const path = usePathname();
  const booksItem = visibleSecondary("/books");
  const settingsItem = visibleSecondary("/settings");

  return (
    <nav
      className="side-nav fixed bottom-0 left-0 top-[4.125rem] z-20 hidden w-[13.25rem] flex-col overflow-y-auto border-r border-slate-200 bg-white py-2 desk:flex dark:border-slate-800 dark:bg-slate-900"
      aria-label={t("nav.main")}
    >
      {visiblePrimary().map((n) => {
        const on = isActive(path, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={on ? "page" : undefined}
            className={`mx-2.5 my-px flex items-center gap-3 rounded px-3 py-2 text-[17.5px] ${
              on
                ? "brand-fill font-semibold"
                : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <n.icon className="h-5 w-5 shrink-0" aria-hidden />
            {t(n.labelKey)}
          </Link>
        );
      })}

      {/* Gạch ngang phân cách (vạch ngăn menu phụ) */}
      <div className="mx-2.5 my-2 border-t border-slate-200 dark:border-slate-800" role="separator" />

      {/* Trao đổi sách */}
      {booksItem && (
        <Link
          key={booksItem.href}
          href={booksItem.href}
          aria-current={isActive(path, booksItem.href) ? "page" : undefined}
          className={`mx-2.5 my-px flex items-center gap-3 rounded px-3 py-2 text-[17.5px] ${
            isActive(path, booksItem.href)
              ? "brand-fill font-semibold"
              : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          <booksItem.icon className="h-5 w-5 shrink-0" aria-hidden />
          {t(booksItem.labelKey)}
        </Link>
      )}

      {/* Góp ý */}
      <Link
        href="/feedback"
        aria-current={isActive(path, "/feedback") ? "page" : undefined}
        title={t("fb.title")}
        className={`mx-2.5 my-px flex items-center gap-3 rounded px-3 py-2 text-[17.5px] ${
          isActive(path, "/feedback")
            ? "brand-fill font-semibold"
            : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        }`}
      >
        <MessageSquarePlus className="h-5 w-5 shrink-0" aria-hidden />
        {t("nav.feedback")}
      </Link>

      {/* Cài đặt */}
      {settingsItem && (
        <Link
          key={settingsItem.href}
          href={settingsItem.href}
          aria-current={isActive(path, settingsItem.href) ? "page" : undefined}
          className={`mx-2.5 my-px flex items-center gap-3 rounded px-3 py-2 text-[17.5px] ${
            isActive(path, settingsItem.href)
              ? "brand-fill font-semibold"
              : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          <settingsItem.icon className="h-5 w-5 shrink-0" aria-hidden />
          {t(settingsItem.labelKey)}
        </Link>
      )}
    </nav>
  );
}

/** Bottom tab bar (below md): main items + "Thêm". */
export function BottomNav() {
  const { t } = useT();
  const path = usePathname();
  const [more, setMore] = useState(false);
  const main = visiblePrimary().filter((n) => n.main);
  const restPrimary = visiblePrimary().filter((n) => !n.main);
  const booksItem = visibleSecondary("/books");
  const settingsItem = visibleSecondary("/settings");
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  // Bấm/chạm ra ngoài (hoặc Esc) thì tự đóng menu "Thêm".
  useEffect(() => {
    if (!more) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (moreMenuRef.current?.contains(target) || moreButtonRef.current?.contains(target)) return;
      setMore(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMore(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [more]);

  return (
    <>
      {/* z-50: menu "Thêm" nằm trên các nút tròn nổi (lọc, chat — z-40) để không bị che */}
      {more && (
        <div
          ref={moreMenuRef}
          className="fixed right-2 bottom-16 z-50 w-max rounded-lg border border-slate-200 bg-white p-[5px] shadow-lg desk:hidden dark:border-slate-800 dark:bg-slate-900"
        >
          <ul className="flex flex-col gap-[2.5px]">
            {restPrimary.map((n) => {
              const on = isActive(path, n.href);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    onClick={() => setMore(false)}
                    aria-current={on ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded px-[15px] py-[7.5px] text-[17.5px] ${
                      on
                        ? "brand-fill font-semibold"
                        : "hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    <n.icon className="h-5 w-5" aria-hidden /> {t(n.labelKey)}
                  </Link>
                </li>
              );
            })}

            {/* Đường kẻ ngang phân cách trong menu di động */}
            <li className="my-1 border-t border-slate-200 dark:border-slate-800" role="separator" />

            {booksItem && (
              <li key={booksItem.href}>
                <Link
                  href={booksItem.href}
                  onClick={() => setMore(false)}
                  aria-current={isActive(path, booksItem.href) ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded px-[15px] py-[7.5px] text-[17.5px] ${
                    isActive(path, booksItem.href)
                      ? "brand-fill font-semibold"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <booksItem.icon className="h-5 w-5" aria-hidden /> {t(booksItem.labelKey)}
                </Link>
              </li>
            )}

            <li>
              <Link
                href="/feedback"
                onClick={() => setMore(false)}
                aria-current={isActive(path, "/feedback") ? "page" : undefined}
                title={t("fb.title")}
                className={`flex w-full items-center gap-2.5 rounded px-[15px] py-[7.5px] text-[17.5px] ${
                  isActive(path, "/feedback")
                    ? "brand-fill font-semibold"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <MessageSquarePlus className="h-5 w-5" aria-hidden /> {t("nav.feedback")}
              </Link>
            </li>

            {settingsItem && (
              <li key={settingsItem.href}>
                <Link
                  href={settingsItem.href}
                  onClick={() => setMore(false)}
                  aria-current={isActive(path, settingsItem.href) ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded px-[15px] py-[7.5px] text-[17.5px] ${
                    isActive(path, settingsItem.href)
                      ? "brand-fill font-semibold"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <settingsItem.icon className="h-5 w-5" aria-hidden /> {t(settingsItem.labelKey)}
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}
      {/* z-45: luôn nổi trên mọi overlay/dropdown trong trang (vốn tối đa z-40), không bị che; vẫn dưới hộp thoại toàn màn hình (z-50) vì hộp thoại cố ý phủ hết màn hình kể cả thanh này. */}
      <nav className="fixed inset-x-0 bottom-0 z-[45] flex h-14 border-t border-slate-200 bg-white desk:hidden dark:border-slate-800 dark:bg-slate-900" aria-label={t("nav.mobile")}>
        {main.map((n) => {
          const on = isActive(path, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={on ? "page" : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-center text-[10px] leading-tight ${on ? "brand-fill m-1 rounded font-semibold" : "text-slate-400 dark:text-slate-500"}`}
            >
              <n.icon className="h-5 w-5 shrink-0" aria-hidden />
              {n.shortKey ? <FitLabel full={t(n.labelKey)} short={t(n.shortKey)} /> : t(n.labelKey)}
            </Link>
          );
        })}
        <button
          ref={moreButtonRef}
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-slate-400 dark:text-slate-500"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden />
          {t("nav.more")}
        </button>
      </nav>
    </>
  );
}

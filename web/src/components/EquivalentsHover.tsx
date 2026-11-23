"use client";

import { Loading } from "@/components/ui";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { EquivalentItem } from "@/lib/types";
import { useT } from "@/i18n";
import { moduleName } from "@/i18n/names";

export interface EquivalentsHoverProps {
  code: string;
}

export function EquivalentsHover({ code }: EquivalentsHoverProps) {
  const { t, lang } = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<EquivalentItem | null>(null);

  const fetchedRef = useRef(false);
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    api.equivalent(code)
      .then((res) => {
        setData(res.data);
      })
      .catch(() => {
        setData(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [code]);

  const openPopover = useCallback(() => {
    setIsOpen(true);
    fetchData();
  }, [fetchData]);

  const closePopover = useCallback(() => {
    if (enterTimerRef.current) {
      clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
    setIsOpen(false);
  }, []);

  const handleMouseEnter = () => {
    if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
    enterTimerRef.current = setTimeout(() => {
      openPopover();
    }, 150);
  };

  const handleMouseLeave = () => {
    closePopover();
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (enterTimerRef.current) {
      clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
    if (isOpen) {
      closePopover();
    } else {
      openPopover();
    }
  };

  const handleFocus = () => {
    if (enterTimerRef.current) {
      clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
    openPopover();
  };

  const handleBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      closePopover();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      closePopover();
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closePopover();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, closePopover]);

  useEffect(() => {
    return () => {
      if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={handleClick}
        onFocus={handleFocus}
        className="chip bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200 cursor-pointer"
      >
        {t("mod.card.hasEquiv")}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label={t("eq.hoverTitle")}
          className="absolute left-0 top-full z-20 mt-1.5 w-72 max-w-xs rounded-md border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-900 text-left before:absolute before:-top-2 before:left-0 before:right-0 before:h-2 before:content-['']"
        >
          <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
            {t("eq.hoverTitle")}
          </div>

          {loading ? (
            <Loading compact />
          ) : !data || !data.equivalents || data.equivalents.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("eq.none")}
            </p>
          ) : (
            <ul className="space-y-2 text-xs">
              {data.equivalents.map((eq) => (
                <li key={eq.code} className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/modules/${encodeURIComponent(eq.code)}`}
                      className="font-mono font-medium text-brand-600 hover:underline dark:text-brand-300 block truncate"
                    >
                      {eq.code}
                    </Link>
                    <span className="text-slate-600 dark:text-slate-300 line-clamp-2">
                      {moduleName(eq, lang)}
                    </span>
                  </div>
                  <span className="shrink-0 text-slate-400 dark:text-slate-500">
                    {t("common.credits", { n: eq.credits })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default EquivalentsHover;

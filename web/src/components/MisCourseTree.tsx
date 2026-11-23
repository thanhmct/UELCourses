"use client";

import { useT } from "@/i18n";
import { formatPlannerTerm } from "@/i18n/names";

type TreeCourse = {
  code: string;
  name: string;
  suggested_term: string | null;
  previous: string[];
  next: string[];
};

export function MisCourseTree({
  course,
  courses,
  onSelect,
}: {
  course: TreeCourse;
  courses: Map<string, TreeCourse>;
  onSelect: (code: string) => void;
}) {
  const { t, lang } = useT();
  const node = (code: string) => {
    const linked = courses.get(code);
    return linked ? (
      <button key={code} type="button" className="tree-course tree-course-link" onClick={() => onSelect(code)} title={`${linked.name} · ${linked.suggested_term ? formatPlannerTerm(linked.suggested_term, lang) : t("mis.noTerm")}`}>
        <span className="tree-code">{code}</span>
        <span className="tree-name">{linked.name}</span>
      </button>
    ) : (
      <span key={code} className="tree-course tree-course-missing" title={t("mis.missingCodeTitle")}>
        <span className="tree-code">{code}</span>
        <span className="tree-name">{t("mis.reviewCode")}</span>
      </span>
    );
  };

  return (
    <section className="card !p-0 overflow-hidden" aria-label={t("mis.treeAria", { code: course.code })}>
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <h2 className="text-lg font-bold text-slate-700 dark:text-slate-100">{t("mis.title")}</h2>
        <p className="mt-1 text-xs text-slate-500">{t("mis.desc")}</p>
      </div>
      <div className="overflow-x-auto px-5 py-9">
        <div className="tree-layout">
          <div className="tree-side">
            <p className="tree-label">{t("mis.previous")}</p>
            <div className="tree-list tree-list-before">
              {course.previous.length ? course.previous.map(node) : <span className="tree-empty">{t("mis.noCondition")}</span>}
            </div>
          </div>
          <div className="tree-connector"><span className="tree-relation">{t("mis.previousRelation")}</span></div>
          <div className="tree-current" title={course.name}>
            <span className="tree-code">{course.code}</span>
            <span className="tree-name">{course.name}</span>
            <span className="tree-term">{course.suggested_term ? formatPlannerTerm(course.suggested_term, lang) : t("mis.noTerm")}</span>
          </div>
          <div className="tree-connector"><span className="tree-relation">{t("mis.unlocks")}</span></div>
          <div className="tree-side">
            <p className="tree-label">{t("mis.next")}</p>
            <div className="tree-list tree-list-after">
              {course.next.length ? course.next.map(node) : <span className="tree-empty">{t("mis.noLinked")}</span>}
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        {t("mis.footerBefore")} <strong>{t("mis.previousRelation")}</strong> {t("mis.footerAfter")}
      </div>
    </section>
  );
}

"use client";

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
  const node = (code: string) => {
    const linked = courses.get(code);
    return linked ? (
      <button key={code} type="button" className="tree-course tree-course-link" onClick={() => onSelect(code)} title={`${linked.name} · ${linked.suggested_term ?? "Chưa có học kỳ"}`}>
        <span className="tree-code">{code}</span>
        <span className="tree-name">{linked.name}</span>
      </button>
    ) : (
      <span key={code} className="tree-course tree-course-missing" title="Mã này chưa có trong danh sách CTĐT">
        <span className="tree-code">{code}</span>
        <span className="tree-name">Cần rà soát mã</span>
      </span>
    );
  };

  return (
    <section className="card !p-0 overflow-hidden" aria-label={`Cây quan hệ môn ${course.code}`}>
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <h2 className="text-lg font-bold text-slate-700 dark:text-slate-100">Cây quan hệ học phần</h2>
        <p className="mt-1 text-xs text-slate-500">Chọn một mã môn trong sơ đồ để xem các quan hệ của môn đó.</p>
      </div>
      <div className="overflow-x-auto px-5 py-9">
        <div className="tree-layout">
          <div className="tree-side">
            <p className="tree-label">CẦN HỌC TRƯỚC</p>
            <div className="tree-list tree-list-before">
              {course.previous.length ? course.previous.map(node) : <span className="tree-empty">Không ghi điều kiện</span>}
            </div>
          </div>
          <div className="tree-connector"><span className="tree-relation">học trước</span></div>
          <div className="tree-current" title={course.name}>
            <span className="tree-code">{course.code}</span>
            <span className="tree-name">{course.name}</span>
            <span className="tree-term">{course.suggested_term ?? "Chưa có học kỳ"}</span>
          </div>
          <div className="tree-connector"><span className="tree-relation">mở ra</span></div>
          <div className="tree-side">
            <p className="tree-label">MÔN HỌC SAU</p>
            <div className="tree-list tree-list-after">
              {course.next.length ? course.next.map(node) : <span className="tree-empty">Chưa có môn liên kết</span>}
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        Đường nối thể hiện quan hệ <strong>Học Trước</strong> trong đề cương. Nguồn hiện chưa khai báo môn song hành.
      </div>
    </section>
  );
}

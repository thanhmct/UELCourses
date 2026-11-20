import Link from "next/link";

const FEATURES = [
  { href: "/today", title: "Lịch học hôm nay", desc: "Xem nhanh các tiết học diễn ra trong ngày, phòng học và thời gian bắt đầu." },
  { href: "/modules", title: "Tra cứu học phần", desc: "Tìm theo mã, tên; lọc theo số tín chỉ, loại học phần, có học phần tương đương." },
  { href: "/programs", title: "CTĐT Hệ thống thông tin quản lý", desc: "Xem môn theo học kỳ, môn bắt buộc và các quan hệ học trước, học sau trong CTĐT 2025." },
  { href: "/timetable", title: "Thời khóa biểu", desc: "Chọn lớp, phát hiện trùng lịch, kéo-thả đổi lớp, chia sẻ qua link, xuất ảnh PNG và lịch .ics." },
  { href: "/planner", title: "Kế hoạch nhiều học kỳ & GPA", desc: "Sắp xếp môn theo từng kỳ, theo dõi tổng tín chỉ, tính điểm GPA và mô phỏng mục tiêu tốt nghiệp." },
  { href: "/venues", title: "Phòng học", desc: "Xem lịch sử dụng phòng và tìm phòng trống theo khung giờ." },
  { href: "/equivalents", title: "Học phần tương đương", desc: "Tra cứu học phần thay thế, nhóm theo môn gốc." },
  { href: "/regulations", title: "Quy chế & Hỏi AI", desc: "Đọc văn bản theo Điều/Khoản, hỏi đáp có trích dẫn nguyên văn, so sánh giữa các khóa." },
];

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-12 text-white sm:px-10">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-200">Dành cho sinh viên UEL</p>
        <h1 className="mt-2 max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">
          Lên kế hoạch học tập rõ ràng, xếp lịch không trùng, hiểu đúng quy chế.
        </h1>
        <p className="mt-3 max-w-xl text-brand-100">
          UELPlan gom tra cứu học phần, thời khóa biểu, kế hoạch nhiều kỳ và quy chế học vụ vào một nơi — dữ liệu lưu ngay trên trình duyệt của bạn.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/timetable" className="btn bg-white text-brand-700 hover:bg-brand-50">Xếp thời khóa biểu</Link>
          <Link href="/regulations" className="btn border border-white/40 text-white hover:bg-white/10">Hỏi về quy chế</Link>
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <Link key={f.href} href={f.href} className="card group transition hover:border-brand-400 hover:shadow-md">
            <h2 className="font-semibold text-brand-700 group-hover:underline dark:text-brand-300">{f.title}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{f.desc}</p>
          </Link>
        ))}
      </section>
      <section className="card text-sm text-slate-600 dark:text-slate-400">
        <h2 className="mb-1 font-semibold text-slate-900 dark:text-white">Bắt đầu nhanh</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Vào <Link className="text-brand-600 underline" href="/settings">Cài đặt</Link> chọn khóa tuyển sinh để lọc đúng quy chế.</li>
          <li>Tìm môn ở <Link className="text-brand-600 underline" href="/modules">Học phần</Link> và thêm vào thời khóa biểu hoặc kế hoạch.</li>
          <li>Bấm <strong>Góp ý</strong> ở góc phải để giúp nhóm cải thiện UELPlan.</li>
        </ol>
      </section>
    </div>
  );
}

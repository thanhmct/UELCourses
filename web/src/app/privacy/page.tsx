"use client";
import Link from "next/link";
import { useT } from "@/i18n";

const CONTACT = "uelpath@gmail.com";

const VI = {
  title: "Chính sách quyền riêng tư",
  updated: "Cập nhật lần cuối: 26/11/2026",
  intro: "UELPATH là công cụ hỗ trợ sinh viên tra cứu học phần, xếp thời khóa biểu và tra cứu quy chế. UELPATH không phải trang chính thức của nhà trường.",
  sections: [
    {
      h: "Dữ liệu chúng tôi thu thập",
      items: [
        "Khi bạn đăng nhập bằng Google hoặc Facebook: mã định danh tài khoản, tên hiển thị và email do nhà cung cấp trả về. Tên thật không bao giờ hiển thị công khai; email chỉ dùng để thông báo khi tài khoản bị khóa.",
        "Biệt danh công khai bạn tự đặt (nếu có), các đánh giá và bình luận bạn viết.",
        "Dữ liệu sử dụng ẩn danh (học phần được xem, tìm kiếm) khi bạn bật chia sẻ trong Cài đặt. Không thu thập tên, email hay mã số sinh viên trong dữ liệu này.",
        "Lựa chọn cá nhân như chương trình đào tạo, thời khóa biểu nháp được lưu ngay trên trình duyệt của bạn, không gửi về máy chủ.",
      ],
    },
    {
      h: "Mục đích sử dụng",
      items: [
        "Cho phép bạn viết đánh giá, bình luận và duy trì phiên đăng nhập.",
        "Kiểm duyệt nội dung và ngăn chặn lạm dụng (khóa tài khoản hoặc địa chỉ IP vi phạm lặp lại; địa chỉ IP được băm một chiều, không lưu dạng gốc).",
        "Cải thiện sản phẩm dựa trên thống kê tổng hợp, ẩn danh.",
      ],
    },
    {
      h: "Chia sẻ dữ liệu",
      items: [
        "Chúng tôi không bán và không chuyển dữ liệu cá nhân cho bên thứ ba vì mục đích quảng cáo.",
        "Dữ liệu được lưu tại các nhà cung cấp hạ tầng (Vercel, Render, Supabase) chỉ để vận hành dịch vụ.",
        "Việc dùng thông tin từ Google tuân thủ Chính sách dữ liệu người dùng của Google API Services, gồm cả các yêu cầu về Sử dụng hạn chế.",
      ],
    },
    {
      h: "Quyền của bạn",
      items: [
        `Bạn có thể đổi hoặc xóa biệt danh trong mục Cài đặt, hoặc đăng xuất bất cứ lúc nào.`,
        `Để yêu cầu xem, sửa hoặc xóa tài khoản cùng các đánh giá, bình luận của bạn, hãy gửi email tới ${CONTACT}. Chúng tôi xử lý trong thời gian hợp lý.`,
        "Bạn có thể thu hồi quyền truy cập của UELPATH trong phần quản lý tài khoản Google hoặc Facebook của mình.",
      ],
    },
    {
      h: "Cookie",
      items: ["UELPATH dùng một cookie phiên đăng nhập (httpOnly) khi bạn đăng nhập. Chúng tôi không dùng cookie quảng cáo."],
    },
  ],
  contact: `Liên hệ: ${CONTACT}`,
  back: "Về trang chủ",
};

const EN = {
  title: "Privacy Policy",
  updated: "Last updated: 26 November 2026",
  intro: "UELPATH helps students look up modules, plan timetables and check regulations. UELPATH is not an official website of the university.",
  sections: [
    {
      h: "Data we collect",
      items: [
        "When you sign in with Google or Facebook: your account identifier, display name and email returned by the provider. Your real name is never shown publicly; the email is only used to notify you if your account is suspended.",
        "The public nickname you choose (if any), and the reviews and comments you write.",
        "Anonymous usage data (modules viewed, searches) only if you enable sharing in Settings. No names, emails or student IDs are collected in this data.",
        "Personal choices such as your programme and draft timetables are stored in your own browser and are not sent to our servers.",
      ],
    },
    {
      h: "How we use it",
      items: [
        "To let you write reviews and comments and keep you signed in.",
        "To moderate content and prevent abuse (accounts or IP addresses with repeated violations may be blocked; IP addresses are one-way hashed, never stored in plain form).",
        "To improve the product using aggregated, anonymous statistics.",
      ],
    },
    {
      h: "Sharing",
      items: [
        "We do not sell personal data or share it with third parties for advertising.",
        "Data is stored with infrastructure providers (Vercel, Render, Supabase) solely to operate the service.",
        "Our use of information received from Google complies with the Google API Services User Data Policy, including the Limited Use requirements.",
      ],
    },
    {
      h: "Your rights",
      items: [
        "You can change or remove your nickname in Settings, or sign out at any time.",
        `To request access, correction or deletion of your account and your reviews and comments, email ${CONTACT}. We respond within a reasonable time.`,
        "You can revoke UELPATH's access in your Google or Facebook account settings.",
      ],
    },
    {
      h: "Cookies",
      items: ["UELPATH uses one httpOnly session cookie when you sign in. We do not use advertising cookies."],
    },
  ],
  contact: `Contact: ${CONTACT}`,
  back: "Back to home",
};

export default function PrivacyPage() {
  const { lang } = useT();
  const c = lang === "en" ? EN : VI;
  return (
    <article className="mx-auto max-w-3xl space-y-6 px-1 py-4 text-slate-800 dark:text-slate-200">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{c.title}</h1>
        <p className="text-xs text-slate-500">{c.updated}</p>
      </header>
      <p className="text-sm leading-relaxed">{c.intro}</p>
      {c.sections.map((s) => (
        <section key={s.h} className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">{s.h}</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            {s.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-sm font-medium">{c.contact}</p>
      <Link href="/" className="text-sm text-brand-600 underline dark:text-brand-400">
        {c.back}
      </Link>
    </article>
  );
}

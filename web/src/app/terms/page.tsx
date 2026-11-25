"use client";
import Link from "next/link";
import { useT } from "@/i18n";

const CONTACT = "uelpath@gmail.com";

const VI = {
  title: "Điều khoản sử dụng",
  updated: "Cập nhật lần cuối: 26/11/2026",
  intro: "Khi dùng UELPATH, bạn đồng ý với các điều khoản dưới đây. UELPATH là công cụ do sinh viên phát triển, không phải trang chính thức của nhà trường.",
  sections: [
    {
      h: "Mục đích và độ chính xác",
      items: [
        "Thông tin về học phần, chương trình đào tạo, thời khóa biểu và quy chế chỉ mang tính tham khảo. Hãy đối chiếu với thông báo chính thức của nhà trường trước khi đăng ký học phần hay đưa ra quyết định.",
        "Chúng tôi không bảo đảm dịch vụ luôn hoạt động liên tục hay không có sai sót.",
      ],
    },
    {
      h: "Tài khoản, đánh giá và bình luận",
      items: [
        "Bạn chịu trách nhiệm về nội dung mình đăng. Chỉ viết nhận xét trung thực, mang tính xây dựng, dựa trên trải nghiệm của chính bạn.",
        "Không đăng nội dung lăng mạ, đe dọa, quảng cáo, liên kết, thông tin cá nhân (số điện thoại, email) hoặc giả danh quản trị viên, nhà trường.",
        "Nội dung vi phạm có thể bị ẩn hoặc xóa; tài khoản hoặc địa chỉ IP vi phạm lặp lại có thể bị khóa tạm thời hoặc vĩnh viễn.",
        "Bạn cho phép UELPATH hiển thị nội dung đã đăng công khai dưới biệt danh bạn chọn (hoặc “Sinh viên ẩn danh”).",
      ],
    },
    {
      h: "Sử dụng hợp lý",
      items: [
        "Không dùng công cụ tự động để thu thập hàng loạt dữ liệu, gây quá tải hay can thiệp vào hoạt động của dịch vụ.",
        "Không dùng UELPATH để gửi yêu cầu đăng ký, hủy hay thay đổi học phần thay cho hệ thống của nhà trường.",
      ],
    },
    {
      h: "Giới hạn trách nhiệm",
      items: ["UELPATH được cung cấp “như hiện có”. Trong phạm vi pháp luật cho phép, chúng tôi không chịu trách nhiệm cho thiệt hại phát sinh từ việc dùng hoặc không dùng được dịch vụ."],
    },
    {
      h: "Thay đổi điều khoản",
      items: ["Chúng tôi có thể cập nhật điều khoản này; bản mới có hiệu lực khi đăng tại trang này."],
    },
  ],
  contact: `Liên hệ: ${CONTACT}`,
  privacy: "Chính sách quyền riêng tư",
  back: "Về trang chủ",
};

const EN = {
  title: "Terms of Service",
  updated: "Last updated: 26 November 2026",
  intro: "By using UELPATH you agree to these terms. UELPATH is a student-built tool and is not an official website of the university.",
  sections: [
    {
      h: "Purpose and accuracy",
      items: [
        "Information about modules, programmes, timetables and regulations is for reference only. Check the university's official announcements before registering for classes or making decisions.",
        "We do not guarantee that the service is uninterrupted or error-free.",
      ],
    },
    {
      h: "Accounts, reviews and comments",
      items: [
        "You are responsible for what you post. Write honest, constructive comments based on your own experience.",
        "Do not post abusive or threatening content, advertising, links, personal information (phone numbers, emails) or impersonate administrators or the university.",
        "Violating content may be hidden or removed; accounts or IP addresses with repeated violations may be temporarily or permanently blocked.",
        "You allow UELPATH to display your posts publicly under the nickname you choose (or “Anonymous student”).",
      ],
    },
    {
      h: "Fair use",
      items: [
        "Do not use automated tools to bulk-collect data, overload the service or interfere with its operation.",
        "Do not use UELPATH to submit requests to register, cancel or change classes on behalf of the university's own system.",
      ],
    },
    {
      h: "Limitation of liability",
      items: ["UELPATH is provided “as is”. To the extent permitted by law, we are not liable for damages arising from using or being unable to use the service."],
    },
    {
      h: "Changes",
      items: ["We may update these terms; the new version takes effect when published on this page."],
    },
  ],
  contact: `Contact: ${CONTACT}`,
  privacy: "Privacy Policy",
  back: "Back to home",
};

export default function TermsPage() {
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
      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/privacy" className="text-brand-600 underline dark:text-brand-400">
          {c.privacy}
        </Link>
        <Link href="/" className="text-brand-600 underline dark:text-brand-400">
          {c.back}
        </Link>
      </div>
    </article>
  );
}

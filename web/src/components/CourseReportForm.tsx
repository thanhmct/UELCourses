"use client";

import { useId, useState, type FormEvent } from "react";
import { useT } from "@/i18n";
import { facultyName, moduleName } from "@/i18n/names";
import type { ModuleDetail } from "@/lib/types";

export type CourseReportModule = Pick<ModuleDetail, "code" | "name" | "name_en" | "faculty" | "department">;

// Public faculty directory: https://uel.edu.vn/Resources/Docs/SubDomain/HomePage/LienHe/DanhbaUEL.pdf
const facultyContacts = [
  { name: "Khoa Hệ thống thông tin", email: "khoahttt@uel.edu.vn" },
  { name: "Khoa Kế toán - Kiểm toán", email: "khoaktkt@uel.edu.vn" },
  { name: "Khoa Kinh tế", email: "khoakinhte@uel.edu.vn" },
  { name: "Khoa Kinh tế đối ngoại", email: "khoaktdn@uel.edu.vn" },
  { name: "Khoa Luật", email: "khoaluat@uel.edu.vn" },
  { name: "Khoa Luật Kinh tế", email: "khoaluatkinhte@uel.edu.vn" },
  { name: "Khoa Quản trị kinh doanh", email: "khoaqtkd@uel.edu.vn" },
  { name: "Khoa Tài chính - Ngân hàng", email: "khoatcnh@uel.edu.vn" },
  { name: "Khoa Toán kinh tế", email: "khoatkt@uel.edu.vn" },
];

// UEL's general student feedback channel for units outside the list.
// https://uel.edu.vn/sinh-vien-la-nguoi-dong-hanh-trong-hanh-trinh-doi-moi-cua-uel
const otherContact = "toicoykien@uel.edu.vn";
const facultyCollator = new Intl.Collator("vi", { sensitivity: "accent", ignorePunctuation: true });
const shortFacultyName = (name: string) => name.trim().replace(/^khoa\s+/i, "").replace(/\s+/g, " ");

export function CourseReportForm({ course, onReportSiteBug }: { course: CourseReportModule; onReportSiteBug: () => void }) {
  const { t, lang } = useT();
  const id = useId();
  const [recipient, setRecipient] = useState(() => {
    const faculty = shortFacultyName(facultyName(course, "vi"));
    return facultyContacts.find(({ name }) => facultyCollator.compare(shortFacultyName(name), faculty) === 0)?.email ?? "";
  });

  function openEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const fullName = data.get("fullName")?.toString().trim();
    const studentId = data.get("studentId")?.toString().trim();
    const email = data.get("schoolEmail")?.toString().trim();
    const issue = data.get("issue")?.toString().trim();
    const faculty = facultyContacts.find((contact) => contact.email === recipient);
    if ((!faculty && recipient !== otherContact) || !fullName || !studentId || !email || !issue) return;

    const subject = `Báo lỗi học phần ${course.code}`;
    const details = [
      `Học phần: ${course.code} — ${moduleName(course, "vi")}`,
      `Họ và tên: ${fullName}`,
      `Mã số sinh viên: ${studentId}`,
      `Khoa/bộ môn: ${faculty?.name ?? (facultyName(course, "vi") || "Chưa xác định")}`,
      `Email trường: ${email}`,
      "",
      "Mô tả vấn đề:",
      issue,
    ];
    const draft = document.createElement("a");
    const body = details.join("\n").replace(/\r\n?|\n/g, "\r\n");
    draft.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    draft.click();
  }

  return (
    <form onSubmit={openEmail} className="space-y-3">
      <div className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
        <p>{t("fb.course.checkPortal")}</p>
        <button type="button" className="font-medium text-brand-700 underline dark:text-brand-300" onClick={onReportSiteBug}>
          {t("fb.course.siteBug")}
        </button>
      </div>

      <div>
        <label className="label" htmlFor={`${id}-name`}>{t("fb.course.name")}</label>
        <input id={`${id}-name`} name="fullName" className="input" autoComplete="name" required pattern={String.raw`.*\S.*`} />
      </div>

      <div>
        <label className="label" htmlFor={`${id}-student`}>{t("fb.course.studentId")}</label>
        <input id={`${id}-student`} name="studentId" className="input" autoCapitalize="characters" required pattern={String.raw`.*\S.*`} />
      </div>

      <div>
        <label className="label" htmlFor={`${id}-unit`}>{t("fb.course.faculty")}</label>
        <select
          id={`${id}-unit`}
          className="input"
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          aria-describedby={recipient ? `${id}-recipient` : undefined}
          required
        >
          <option value="" disabled>{t("fb.course.chooseFaculty")}</option>
          {facultyContacts.map(({ name, email }) => <option value={email} key={email}>{facultyName(name, lang)}</option>)}
          <option value={otherContact}>{t("fb.course.otherFaculty")}</option>
        </select>
        {recipient && (
          <p id={`${id}-recipient`} className="mt-1 break-words text-xs text-slate-600 dark:text-slate-400">
            {t("fb.course.recipient", { email: recipient })}
          </p>
        )}
      </div>

      <div>
        <label className="label" htmlFor={`${id}-email`}>{t("fb.course.schoolEmail")}</label>
        <input
          id={`${id}-email`}
          name="schoolEmail"
          type="email"
          className="input"
          autoComplete="email"
          placeholder="sinhvien@st.uel.edu.vn"
          pattern={String.raw`[^@]+@([sS][tT]\.)?[uU][eE][lL]\.[eE][dD][uU]\.[vV][nN]`}
          title={t("fb.course.emailHint")}
          required
        />
      </div>

      <div>
        <label className="label" htmlFor={`${id}-issue`}>{t("fb.course.issue")}</label>
        <textarea
          id={`${id}-issue`}
          name="issue"
          className="input min-h-24"
          placeholder={t("fb.course.issuePlaceholder")}
          required
        />
      </div>

      <button type="submit" className="btn-primary w-full">{t("fb.course.openEmail")}</button>
      <p className="text-xs text-slate-600 dark:text-slate-400">{t("fb.course.emailDraft")}</p>
    </form>
  );
}

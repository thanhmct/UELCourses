"use client";
import Link from "next/link";
import { useState, useMemo } from "react";
import {
  AlertCircle,
  BookMarked,
  PlusCircle,
  Search,
  Tag,
  User,
  Clock,
  X,
  Lock,
  ArrowRightLeft,
} from "lucide-react";
import {
  MOCK_BOOKS,
  BOOK_FACULTIES,
  type BookListing,
} from "@/mocks/books";
import { useT } from "@/i18n";

export default function BooksPage() {
  const { t, lang } = useT();
  const bookTitle = (book: BookListing) => lang === "en" ? book.titleEn : book.title;
  const moduleTitle = (book: BookListing) => lang === "en" ? book.moduleNameEn : book.moduleName;
  const facultyTitle = (book: BookListing) => lang === "en" ? book.facultyEn : book.faculty;
  const authorTitle = (book: BookListing) => lang === "en" ? book.authorEn : book.author;
  const exchangeTitle = (book: BookListing) => lang === "en" ? book.exchangeForEn : book.exchangeFor;
  const formatPrice = (price: number) => lang === "en"
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(price)
    : `${price.toLocaleString("vi-VN")} đ`;

  // Filters & Search
  const [search, setSearch] = useState("");
  const [faculty, setFaculty] = useState("");
  const [condition, setCondition] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [sort, setSort] = useState<"newest" | "price_asc" | "price_desc">("newest");

  // Modals
  const [contactBook, setContactBook] = useState<BookListing | null>(null);
  const [showPostDialog, setShowPostDialog] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Filtered & Sorted list
  const filteredBooks = useMemo(() => {
    return MOCK_BOOKS.filter((b) => {
      const q = search.trim().toLowerCase();
      if (q) {
        const matchTitle = `${b.title} ${b.titleEn}`.toLowerCase().includes(q);
        const matchCode = b.moduleCode.toLowerCase().includes(q);
        const matchName = `${b.moduleName} ${b.moduleNameEn}`.toLowerCase().includes(q);
        const matchNotes = `${b.notes ?? ""} ${b.notesEn ?? ""}`.toLowerCase().includes(q);
        if (!matchTitle && !matchCode && !matchName && !matchNotes) return false;
      }
      if (faculty && b.faculty !== faculty) return false;
      if (condition && b.condition !== condition) return false;
      if (type && b.type !== type) return false;
      return true;
    }).sort((a, b) => {
      if (sort === "price_asc") {
        return (a.price ?? 0) - (b.price ?? 0);
      }
      if (sort === "price_desc") {
        return (b.price ?? 0) - (a.price ?? 0);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [search, faculty, condition, type, sort]);

  const hasFilter = Boolean(search || faculty || condition || type || sort !== "newest");

  const clearFilters = () => {
    setSearch("");
    setFaculty("");
    setCondition("");
    setType("");
    setSort("newest");
  };

  const triggerToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* 1. Banner đầu trang thông báo dữ liệu mẫu */}
      <div
        role="alert"
        className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200"
      >
        <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <div className="flex-1">
          <p className="font-semibold">{t("books.banner")}</p>
        </div>
      </div>

      {/* 2. Tiêu đề trang + Nút Đăng bài */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2.5">
            <BookMarked className="h-7 w-7 text-brand-600 dark:text-brand-400" aria-hidden />
            <span>{t("books.title")}</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("books.subtitle")}
          </p>
        </div>

        <button
          onClick={() => setShowPostDialog(true)}
          className="btn-primary inline-flex items-center gap-2 self-start py-2.5 text-sm sm:self-auto"
        >
          <PlusCircle className="h-4 w-4" aria-hidden />
          <span>{t("books.createPost")}</span>
        </button>
      </div>

      {/* 3. Thanh tìm kiếm + Bộ lọc */}
      <div className="card space-y-3.5 p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("books.searchPlaceholder")}
              aria-label={t("books.searchAria")}
              className="input pl-9"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                aria-label={t("common.clearSearch")}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={faculty}
              onChange={(e) => setFaculty(e.target.value)}
              className="input w-auto text-xs sm:text-sm"
              aria-label={t("books.filterFaculty")}
            >
              <option value="">{t("books.allFaculties")}</option>
              {BOOK_FACULTIES.map((f) => (
                <option key={f} value={f}>
                  {lang === "en" ? (MOCK_BOOKS.find((book) => book.faculty === f)?.facultyEn ?? f) : f}
                </option>
              ))}
            </select>

            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="input w-auto text-xs sm:text-sm"
              aria-label={t("books.filterCondition")}
            >
              <option value="">{t("books.condAll")}</option>
              <option value="new">{t("books.condNew")}</option>
              <option value="like_new">{t("books.condLikeNew")}</option>
              <option value="good">{t("books.condGood")}</option>
              <option value="fair">{t("books.condFair")}</option>
            </select>

            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="input w-auto text-xs sm:text-sm"
              aria-label={t("books.filterType")}
            >
              <option value="">{t("books.typeAll")}</option>
              <option value="giveaway">{t("books.typeGiveaway")}</option>
              <option value="exchange">{t("books.typeExchange")}</option>
              <option value="resell">{t("books.typeResell")}</option>
            </select>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="input w-auto text-xs sm:text-sm"
              aria-label={t("books.sort")}
            >
              <option value="newest">{t("books.sortNewest")}</option>
              <option value="price_asc">{t("books.sortPriceAsc")}</option>
              <option value="price_desc">{t("books.sortPriceDesc")}</option>
            </select>

            {hasFilter && (
              <button
                onClick={clearFilters}
                className="btn-ghost text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                {t("books.clearFilters")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. Lưới thẻ bài đăng */}
      {filteredBooks.length === 0 ? (
        <div className="card py-12 text-center text-slate-500">
          <BookMarked className="mx-auto mb-3 h-10 w-10 text-slate-400" aria-hidden />
          <p className="text-sm">{t("books.empty")}</p>
          {hasFilter && (
            <button onClick={clearFilters} className="btn-outline mt-3 text-xs">
              {t("books.clearFilters")}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredBooks.map((book) => {
            const isGiveaway = book.type === "giveaway";
            const isExchange = book.type === "exchange";

            return (
              <div
                key={book.id}
                className="card flex flex-col justify-between transition-all hover:border-slate-300 hover:shadow-md dark:hover:border-slate-700"
              >
                <div className="space-y-2.5">
                  {/* Hàng nhãn môn & giá / hình thức */}
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/modules/${book.moduleCode}`}
                      className="group inline-flex items-center gap-1 rounded bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 dark:bg-brand-950/60 dark:text-brand-300"
                      title={moduleTitle(book)}
                    >
                      <Tag className="h-3 w-3" />
                      <span>{book.moduleCode}</span>
                    </Link>

                    {isGiveaway ? (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {t("books.freePrice")}
                      </span>
                    ) : isExchange ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-950/60 dark:text-violet-300">
                        <ArrowRightLeft className="h-3 w-3" />
                        {t("books.typeExchange")}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                        {formatPrice(book.price ?? 0)}
                      </span>
                    )}
                  </div>

                  {/* Tên giáo trình */}
                  <h3 className="line-clamp-2 text-base font-semibold leading-snug text-slate-800 dark:text-slate-100">
                    {bookTitle(book)}
                  </h3>

                  {/* Tên môn và Khoa */}
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {moduleTitle(book)}
                    </span>{" "}
                    · {facultyTitle(book)}
                  </p>

                  {/* Tình trạng sách */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {lang === "en" ? book.conditionTextEn : book.conditionText}
                    </span>
                  </div>

                  {/* Mô tả / Ghi chú */}
                  {(book.notes || book.exchangeFor) && (
                    <div className="rounded-md bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                      {exchangeTitle(book) && (
                        <p className="font-medium text-violet-700 dark:text-violet-300">
                          ↔ {exchangeTitle(book)}
                        </p>
                      )}
                      {book.notes && (
                        <p className="line-clamp-2 italic text-slate-500 dark:text-slate-400">
                          “{lang === "en" && book.notesEn ? book.notesEn : book.notes}”
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Chân thẻ: Người đăng + Thời gian + Nút Liên hệ */}
                <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">
                      <User className="h-3.5 w-3.5 text-slate-400" />
                      {authorTitle(book)}
                    </span>
                    <span className="flex items-center gap-1 text-[11px]">
                      <Clock className="h-3 w-3 text-slate-400" />
                      {lang === "en" ? book.timeAgoEn : book.timeAgoVi}
                    </span>
                  </div>

                  <button
                    onClick={() => setContactBook(book)}
                    className="btn-outline mt-2.5 w-full justify-center py-1.5 text-xs font-semibold hover:border-brand-500 hover:text-brand-600 dark:hover:border-brand-400 dark:hover:text-brand-300"
                  >
                    {t("books.contact")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Hộp thoại Liên hệ (Yêu cầu đăng nhập) */}
      {contactBook && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={() => setContactBook(null)}
        >
          <div
            className="card w-full max-w-md space-y-4 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
              <div>
                <h2 id="contact-dialog-title" className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {t("books.contactTitle")}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">{bookTitle(contactBook)}</p>
              </div>
              <button
                onClick={() => setContactBook(null)}
                className="btn-ghost -mr-1 -mt-1 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
              <div className="flex items-center gap-2 font-semibold">
                <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span>{t("books.contactLoginReq")}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                {t("books.contactLoginMsg")}
              </p>
            </div>

            <div className="space-y-2">
              <button
                disabled
                className="btn-primary flex w-full items-center justify-center gap-2 py-2.5 text-sm opacity-60"
              >
                <span>{t("books.loginWithSchoolEmail")}</span>
                <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  {t("books.comingSoon")}
                </span>
              </button>
              <button
                onClick={() => setContactBook(null)}
                className="btn-outline w-full py-2 text-xs"
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Hộp thoại Đăng bài */}
      {showPostDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="post-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-xs"
          onClick={() => setShowPostDialog(false)}
        >
          <div
            className="card my-8 w-full max-w-lg space-y-4 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <h2 id="post-dialog-title" className="text-base font-bold text-slate-800 dark:text-slate-100">
                {t("books.postDialogTitle")}
              </h2>
              <button
                onClick={() => setShowPostDialog(false)}
                className="btn-ghost -mr-1 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Banner đăng nhập để đăng bài */}
            <div className="rounded-lg border border-brand-200 bg-brand-50 p-3.5 text-xs text-brand-900 dark:border-brand-800/60 dark:bg-brand-950/40 dark:text-brand-200">
              <div className="flex items-center gap-2 font-semibold">
                <Lock className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                <span>{t("books.loginBannerTitle")}</span>
              </div>
              <p className="mt-1 text-slate-600 dark:text-slate-300">
                {t("books.loginBannerSub")}
              </p>
              <button
                disabled
                className="btn-primary mt-2.5 flex w-full items-center justify-center gap-2 py-2 text-xs opacity-60"
              >
                <span>{t("books.loginWithSchoolEmail")}</span>
                <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  {t("books.comingSoon")}
                </span>
              </button>
            </div>

            {/* Form mẫu */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setShowPostDialog(false);
                triggerToast(t("books.postSuccess"));
              }}
              className="space-y-3"
            >
              <div>
                <label className="label text-xs font-semibold">{t("books.fieldModule")}</label>
                <input
                  type="text"
                  required
                  placeholder={t("books.fieldModulePh")}
                  className="input text-xs sm:text-sm"
                />
              </div>

              <div>
                <label className="label text-xs font-semibold">{t("books.fieldTitle")}</label>
                <input
                  type="text"
                  required
                  placeholder={t("books.fieldTitlePh")}
                  className="input text-xs sm:text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="label text-xs font-semibold">{t("books.fieldCondition")}</label>
                  <select className="input text-xs sm:text-sm">
                    <option value="like_new">{t("books.condLikeNew")}</option>
                    <option value="new">{t("books.condNew")}</option>
                    <option value="good">{t("books.condGood")}</option>
                    <option value="fair">{t("books.condFair")}</option>
                  </select>
                </div>

                <div>
                  <label className="label text-xs font-semibold">{t("books.fieldType")}</label>
                  <select className="input text-xs sm:text-sm">
                    <option value="giveaway">{t("books.typeGiveaway")}</option>
                    <option value="exchange">{t("books.typeExchange")}</option>
                    <option value="resell">{t("books.typeResell")}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="label text-xs font-semibold">{t("books.fieldPrice")}</label>
                  <input
                    type="number"
                    placeholder={t("books.fieldPricePh")}
                    className="input text-xs sm:text-sm"
                  />
                </div>

                <div>
                  <label className="label text-xs font-semibold">{t("books.fieldExchangeFor")}</label>
                  <input
                    type="text"
                    placeholder={t("books.fieldExchangeForPh")}
                    className="input text-xs sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="label text-xs font-semibold">{t("books.fieldImage")}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    disabled
                    className="input py-1.5 text-xs text-slate-500 file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs"
                  />
                </div>
                <span className="text-[11px] text-slate-400">{t("books.fieldImageHint")}</span>
              </div>

              <div>
                <label className="label text-xs font-semibold">{t("books.fieldNotes")}</label>
                <textarea
                  rows={2}
                  placeholder={t("books.fieldNotesPh")}
                  className="input text-xs sm:text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPostDialog(false)}
                  className="btn-outline py-2 text-xs"
                >
                  {t("common.cancel")}
                </button>
                <button type="submit" className="btn-primary py-2 text-xs">
                  {t("books.submitPost")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Thông báo toast nổi */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 left-1/2 z-[100] -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-medium text-white shadow-xl dark:bg-slate-100 dark:text-slate-900 md:bottom-6"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

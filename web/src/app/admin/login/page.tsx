"use client";
import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi, AdminApiError } from "@/lib/adminApi";
import { useT } from "@/i18n";

export default function AdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useT();

  const nextUrl = searchParams.get("next") || "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!email.trim() || !password) {
      setErrorMsg("Vui lòng nhập đầy đủ email và mật khẩu.");
      return;
    }

    setIsSubmitting(true);
    try {
      await adminApi.login({ email: email.trim(), password });
      router.push(nextUrl);
    } catch (err: any) {
      if (err instanceof AdminApiError) {
        setErrorMsg(err.message || "Email hoặc mật khẩu không chính xác.");
      } else {
        setErrorMsg("Có lỗi xảy ra khi đăng nhập. Vui lòng thử lại.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 w-full max-w-md mx-auto">
      <div className="card p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-1">
          <div className="w-10 h-10 rounded-xl bg-brand-600 text-white flex items-center justify-center font-bold mx-auto mb-2 text-sm shadow">
            U
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {t("admin.loginTitle")}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t("admin.loginSubtitle")}
          </p>
        </div>

        {/* Thông báo lỗi trong form (không dùng toast lớn - Brief A1) */}
        {errorMsg && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/50 dark:border-red-900 dark:text-red-300 text-xs font-medium"
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="admin-email">
              {t("admin.loginEmail")}
            </label>
            <input
              id="admin-email"
              type="email"
              autoComplete="email"
              required
              className="input text-sm"
              placeholder="admin@uel.edu.vn"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="label" htmlFor="admin-password">
              {t("admin.loginPassword")}
            </label>
            <div className="relative">
              <input
                id="admin-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                className="input text-sm pr-10"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xs p-1"
                aria-label={showPassword ? t("admin.loginHidePassword") : t("admin.loginShowPassword")}
              >
                {showPassword ? "Ẩn" : "Hiện"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary w-full py-2.5 text-sm font-semibold justify-center"
          >
            {isSubmitting ? t("admin.loginSubmitting") : t("admin.loginSubmit")}
          </button>
        </form>
      </div>
    </div>
  );
}

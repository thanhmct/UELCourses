"use client";
import { Loading } from "@/components/ui";
import React, { useEffect, useState } from "react";
import { useT } from "@/i18n";
import { adminApi, AdminApiError } from "@/lib/adminApi";
import type { AdminRole, AdminUserItem } from "@/lib/types";

export default function AdminUsersPage() {
  const { t } = useT();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Modal / Drawer tạo tài khoản mới
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<AdminRole>("moderator");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Hộp hiển thị mật khẩu tạm thời (CHỈ HIỂN THỊ MỘT LẦN)
  const [tempPassDisplay, setTempPassDisplay] = useState<{
    email?: string;
    password: string;
    message: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Form đổi mật khẩu của tôi
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changePwdLoading, setChangePwdLoading] = useState(false);
  const [changePwdSuccess, setChangePwdSuccess] = useState<string | null>(null);
  const [changePwdError, setChangePwdError] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.getUsers();
      setUsers(data);
    } catch (err: any) {
      setError(err?.message || "Không thể tải danh sách tài khoản");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);
    try {
      const res = await adminApi.createUser({
        email: newEmail.trim(),
        role: newRole,
      });
      // Hiển thị hộp mật khẩu tạm
      setTempPassDisplay({
        email: res.user.email,
        password: res.temporary_password,
        message: res.message,
      });
      setIsCreateOpen(false);
      setNewEmail("");
      fetchUsers();
    } catch (err: any) {
      setCreateError(err?.message || "Không thể tạo tài khoản");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleResetPassword = async (user: AdminUserItem) => {
    try {
      const res = await adminApi.resetPassword(user.id);
      setTempPassDisplay({
        email: user.email,
        password: res.temporary_password,
        message: res.message,
      });
    } catch (err: any) {
      alert("Đặt lại mật khẩu thất bại: " + (err?.message || "Lỗi không xác định"));
    }
  };

  const handleToggleActive = async (user: AdminUserItem) => {
    try {
      await adminApi.updateUser(user.id, {
        is_active: !user.is_active,
      });
      fetchUsers();
    } catch (err: any) {
      alert("Cập nhật trạng thái thất bại: " + (err?.message || "Lỗi không xác định"));
    }
  };

  const handleChangeRole = async (user: AdminUserItem, nextRole: AdminRole) => {
    try {
      await adminApi.updateUser(user.id, {
        role: nextRole,
      });
      fetchUsers();
    } catch (err: any) {
      alert("Đổi vai trò thất bại: " + (err?.message || "Lỗi không xác định"));
    }
  };

  const handleCopyPassword = () => {
    if (tempPassDisplay?.password) {
      navigator.clipboard.writeText(tempPassDisplay.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleChangeMyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePwdSuccess(null);
    setChangePwdError(null);

    if (newPassword !== confirmPassword) {
      setChangePwdError(t("admin.passwordMismatchError"));
      return;
    }
    if (newPassword.length < 8) {
      setChangePwdError("Mật khẩu mới phải có ít nhất 8 ký tự.");
      return;
    }

    setChangePwdLoading(true);
    try {
      const res = await adminApi.changeMyPassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setChangePwdSuccess(res.message || t("admin.passwordChangedSuccess"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setChangePwdError(err?.message || "Đổi mật khẩu thất bại");
    } finally {
      setChangePwdLoading(false);
    }
  };

  const getRoleBadge = (role: AdminRole) => {
    switch (role) {
      case "admin":
        return "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800";
      case "moderator":
        return "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800";
      case "data_editor":
        return "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
            {t("admin.usersTitle")}
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t("admin.usersSubtitle")}
          </p>
        </div>

        <div>
          <button
            type="button"
            onClick={() => {
              setIsCreateOpen(true);
              setCreateError(null);
            }}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 text-white shadow-sm transition flex items-center gap-1.5"
          >
            {t("admin.btnAddUser")}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Hộp hiển thị mật khẩu tạm thời (CHỈ HIỂN THỊ MỘT LẦN) */}
      {tempPassDisplay && (
        <div
          role="alert"
          className="p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-400 dark:border-amber-600 shadow-md space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black tracking-wider uppercase text-amber-900 dark:text-amber-300 flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {t("admin.tempPassBoxTitle")}
            </span>
            <button
              type="button"
              onClick={() => setTempPassDisplay(null)}
              className="text-xs text-amber-700 dark:text-amber-400 hover:underline font-semibold"
            >
              Đóng
            </button>
          </div>

          <p className="text-xs text-amber-900 dark:text-amber-200">
            {t("admin.tempPassWarning")} {tempPassDisplay.email && <strong>({tempPassDisplay.email})</strong>}
          </p>

          <div className="flex items-center gap-3">
            <input
              type="text"
              readOnly
              value={tempPassDisplay.password}
              aria-label="Mật khẩu tạm thời"
              className="flex-1 px-4 py-2.5 font-mono text-base font-bold tracking-wider bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 rounded-xl text-gray-900 dark:text-white select-all shadow-inner focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCopyPassword}
              className={`px-4 py-2.5 text-xs font-bold rounded-xl transition shadow-sm ${
                copied
                  ? "bg-emerald-600 text-white"
                  : "bg-amber-600 hover:bg-amber-700 text-white"
              }`}
            >
              {copied ? t("admin.copied") : t("admin.btnCopy")}
            </button>
          </div>
        </div>
      )}

      {/* Bảng danh sách tài khoản */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 uppercase font-semibold">
                <th className="py-3 px-4">{t("admin.usersColEmail")}</th>
                <th className="py-3 px-4">{t("admin.usersColRole")}</th>
                <th className="py-3 px-4">{t("admin.usersColStatus")}</th>
                <th className="py-3 px-4">{t("admin.usersColLastLogin")}</th>
                <th className="py-3 px-4 text-right">{t("admin.usersColActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-700 dark:text-gray-300">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400">
                    <Loading compact />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400 italic">
                    Chưa có tài khoản quản trị nào.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition">
                    <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white font-mono">
                      {u.email}
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={u.role}
                        onChange={(e) => handleChangeRole(u, e.target.value as AdminRole)}
                        aria-label={`Vai trò của ${u.email}`}
                        className={`px-2 py-0.5 text-xs font-semibold rounded-md border ${getRoleBadge(
                          u.role
                        )} bg-transparent cursor-pointer focus:outline-none`}
                      >
                        <option value="admin">admin</option>
                        <option value="moderator">moderator</option>
                        <option value="data_editor">data_editor</option>
                      </select>
                    </td>
                    <td className="py-3 px-4">
                      {u.is_active ? (
                        <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                          {t("admin.statusActive")}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                          {t("admin.statusDisabled")}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400 font-mono">
                      {u.last_login_at
                        ? new Date(u.last_login_at).toLocaleString("vi-VN")
                        : "Chưa đăng nhập"}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleResetPassword(u)}
                        className="px-2.5 py-1 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition"
                      >
                        {t("admin.btnResetPassword")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(u)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${
                          u.is_active
                            ? "border border-red-200 dark:border-red-900 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                            : "border border-emerald-200 dark:border-emerald-900 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                        }`}
                      >
                        {u.is_active ? "Khóa / Tắt" : "Kích hoạt"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Thêm tài khoản quản trị */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                {t("admin.modalCreateUserTitle")}
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-5 space-y-4 text-xs">
              {createError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
                  {createError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t("admin.fieldEmail")} *
                </label>
                <input
                  type="email"
                  required
                  placeholder="admin@uel.edu.vn"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t("admin.fieldRole")} *
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as AdminRole)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="admin">{t("admin.roleAdmin")}</option>
                  <option value="moderator">{t("admin.roleModerator")}</option>
                  <option value="data_editor">{t("admin.roleDataEditor")}</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-1.5 font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50"
                >
                  {createLoading ? "Đang tạo..." : t("admin.btnSubmitCreateUser")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mục "Tài khoản của tôi — Đổi mật khẩu" */}
      <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4 max-w-xl">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">
            {t("admin.myAccountTitle")}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Đổi mật khẩu tài khoản đang đăng nhập. Các phiên khác sẽ được tự động thu hồi.
          </p>
        </div>

        <form onSubmit={handleChangeMyPassword} className="space-y-3.5 text-xs">
          {changePwdSuccess && (
            <div role="status" className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300">
              {changePwdSuccess}
            </div>
          )}

          {changePwdError && (
            <div role="alert" className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
              {changePwdError}
            </div>
          )}

          <div>
            <label htmlFor="current-password-input" className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
              {t("admin.fieldCurrentPassword")}
            </label>
            <input
              id="current-password-input"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="new-password-input" className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                {t("admin.fieldNewPassword")}
              </label>
              <input
                id="new-password-input"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label htmlFor="confirm-password-input" className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                {t("admin.fieldConfirmPassword")}
              </label>
              <input
                id="confirm-password-input"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={changePwdLoading}
              className="px-4 py-2 font-semibold rounded-lg bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 transition disabled:opacity-50"
            >
              {changePwdLoading ? "Đang cập nhật..." : t("admin.btnChangePassword")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

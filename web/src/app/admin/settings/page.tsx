"use client";
import React, { useEffect, useState } from "react";
import { useT } from "@/i18n";
import { adminApi } from "@/lib/adminApi";
import type { AdminSettingsData } from "@/lib/types";

export default function AdminSettingsPage() {
  const { t } = useT();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [moderationMode, setModerationMode] = useState<"auto" | "pre" | "post">("auto");
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  const [retentionDays, setRetentionDays] = useState(180);
  const [lastUpdated, setLastUpdated] = useState<{ by?: string | null; at?: string | null }>({});

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.getSettings();
      setModerationMode(data.moderation_mode || "auto");
      setAnalyticsEnabled(data.analytics_enabled !== false);
      setRetentionDays(data.analytics_retention_days || 180);
      setLastUpdated({ by: data.updated_by, at: data.updated_at });
    } catch (err: any) {
      setError(err?.message || "Không thể tải cài đặt quản trị");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    if (retentionDays < 30 || retentionDays > 365) {
      setError("Thời gian lưu trữ dữ liệu phân tích phải nằm trong khoảng từ 30 đến 365 ngày.");
      setSaving(false);
      return;
    }

    try {
      const updated = await adminApi.updateSettings({
        moderation_mode: moderationMode,
        analytics_enabled: analyticsEnabled,
        analytics_retention_days: Number(retentionDays),
      });
      setSuccessMsg(t("admin.settingsSavedSuccess"));
      setLastUpdated({ by: updated.updated_by, at: updated.updated_at });
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err?.message || "Không thể lưu cài đặt");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-800 pb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
          {t("admin.settingsTitle")}
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
          {t("admin.settingsSubtitle")}
        </p>
      </div>

      {loading ? (
        <div className="p-8 space-y-4 animate-pulse">
          <div className="h-6 bg-gray-100 dark:bg-gray-800 rounded w-1/3" />
          <div className="h-24 bg-gray-100 dark:bg-gray-800 rounded-xl" />
          <div className="h-24 bg-gray-100 dark:bg-gray-800 rounded-xl" />
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6 text-xs">
          {successMsg && (
            <div
              role="status"
              className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-medium flex items-center justify-between"
            >
              <span>{successMsg}</span>
              <button
                type="button"
                onClick={() => setSuccessMsg(null)}
                className="text-xs text-emerald-600 dark:text-emerald-400 font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 font-medium"
            >
              {error}
            </div>
          )}

          {/* 1. Chế độ kiểm duyệt nội dung */}
          <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm space-y-3">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">
              {t("admin.settingModMode")}
            </h2>
            <div className="space-y-2.5">
              <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-800 hover:bg-gray-50/60 dark:hover:bg-gray-800/40 cursor-pointer transition">
                <input
                  type="radio"
                  name="moderation_mode"
                  value="auto"
                  checked={moderationMode === "auto"}
                  onChange={() => setModerationMode("auto")}
                  className="mt-0.5 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <span className="font-semibold text-gray-900 dark:text-white block">
                    Tự duyệt (Auto-moderation)
                  </span>
                  <span className="text-gray-500 dark:text-gray-400 block mt-0.5">
                    {t("admin.modAuto")}
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-800 hover:bg-gray-50/60 dark:hover:bg-gray-800/40 cursor-pointer transition">
                <input
                  type="radio"
                  name="moderation_mode"
                  value="pre"
                  checked={moderationMode === "pre"}
                  onChange={() => setModerationMode("pre")}
                  className="mt-0.5 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <span className="font-semibold text-gray-900 dark:text-white block">
                    Kiểm duyệt trước (Pre-moderation)
                  </span>
                  <span className="text-gray-500 dark:text-gray-400 block mt-0.5">
                    {t("admin.modPre")}
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-800 hover:bg-gray-50/60 dark:hover:bg-gray-800/40 cursor-pointer transition">
                <input
                  type="radio"
                  name="moderation_mode"
                  value="post"
                  checked={moderationMode === "post"}
                  onChange={() => setModerationMode("post")}
                  className="mt-0.5 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <span className="font-semibold text-gray-900 dark:text-white block">
                    Kiểm duyệt sau (Post-moderation)
                  </span>
                  <span className="text-gray-500 dark:text-gray-400 block mt-0.5">
                    {t("admin.modPost")}
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* 2. Thu thập dữ liệu phân tích xu hướng */}
          <div className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                  {t("admin.settingAnalytics")}
                </h2>
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                  {t("admin.settingAnalyticsDesc")}
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={analyticsEnabled}
                  onChange={(e) => setAnalyticsEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600" />
              </label>
            </div>

            {/* 3. Thời gian lưu trữ dữ liệu thô */}
            <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
              <label className="block font-semibold text-gray-900 dark:text-white mb-1">
                {t("admin.settingRetention")}
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={30}
                  max={365}
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Number(e.target.value))}
                  className="w-32 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <span className="text-gray-500 dark:text-gray-400">ngày (30 – 365)</span>
              </div>
              <p className="text-gray-400 dark:text-gray-500 mt-1">
                {t("admin.settingRetentionDesc")}
              </p>
            </div>
          </div>

          {/* Last updated info & Submit Button */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
            <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
              {lastUpdated.at && (
                <>
                  Cập nhật lần cuối: {new Date(lastUpdated.at).toLocaleString("vi-VN")}
                  {lastUpdated.by && ` (${lastUpdated.by})`}
                </>
              )}
            </span>

            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 text-xs font-bold rounded-xl bg-primary-600 hover:bg-primary-700 text-white shadow-sm transition disabled:opacity-50"
            >
              {saving ? "Đang lưu..." : t("admin.btnSaveSettings")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

#!/usr/bin/env python3
"""Phân tích khảo sát UELPlan (Design Thinking: Vòng 0 nhu cầu, Vòng 1..n thử nghiệm).

Đầu vào
  * Một hoặc nhiều CSV xuất từ Google Forms. Mỗi tiêu đề câu hỏi bắt đầu bằng mã trong
    ngoặc vuông, ví dụ "[SUS3] Tôi thấy UELPlan dễ sử dụng." (xem research/05-test/survey-feedback.md
    và research/01-empathize/survey-needs.md). Mã kết thúc bằng "_M" là câu chọn nhiều đáp án.
    Gán nhãn vòng bằng cú pháp NHÃN=đường_dẫn (V1=a.csv V2=b.csv); nếu không có nhãn, dùng cột
    [ROUND] trong file, cuối cùng là tên file.
  * --tasks: CSV phiếu quan sát kiểm thử khả dụng (round, participant, task_id, success, time_sec,
    errors, seq, ai_citations_total, ai_citations_correct, notes).
  * --feedback-json: JSON lưu từ GET /api/feedback/stats (dạng bản ghi thô hoặc dạng tổng hợp).

Đầu ra (thư mục --out): summary.md, summary.json, các bảng CSV và biểu đồ PNG.

Ví dụ
  python analyze_survey.py sample_responses.csv --tasks sample_tasks.csv \
      --feedback-json sample_feedback_stats.json --out output/sample
  python analyze_survey.py --make-sample .      # tạo lại bộ dữ liệu GIẢ LẬP
"""
from __future__ import annotations

import argparse
import io
import json
import math
import random
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

plt.rcParams["font.family"] = ["Segoe UI", "Arial", "DejaVu Sans"]
plt.rcParams["axes.spines.top"] = False
plt.rcParams["axes.spines.right"] = False

CODE_RE = re.compile(r"\[([A-Z][A-Z0-9_]*)\]")
PLAIN_CODE_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")
TIMESTAMP_NAMES = {"dấu thời gian", "timestamp", "thời gian", "dau thoi gian"}
META_CODES = {"ROUND", "PID", "TIMESTAMP"}
SUS_ITEMS = [f"SUS{i}" for i in range(1, 11)]
SUS_ODD = [f"SUS{i}" for i in (1, 3, 5, 7, 9)]
SUS_EVEN = [f"SUS{i}" for i in (2, 4, 6, 8, 10)]

# Ngưỡng thành công (research/README.md, mục 3)
TARGETS = {
    "sus_mean": 70.0,
    "task_completion": 0.80,
    "ai_citation_accuracy": 0.95,
    "seq_mean": 5.5,
    "nps": 0.0,
    "feedback_avg_rating": 4.0,
}

# Thang xếp hạng SUS có điều chỉnh (Sauro & Lewis, 2016)
SUS_GRADES = [(84.1, "A+"), (80.8, "A"), (78.9, "A-"), (77.2, "B+"), (74.1, "B"), (72.6, "B-"),
              (71.1, "C+"), (65.0, "C"), (62.7, "C-"), (51.7, "D"), (0.0, "F")]
# Thang tính từ (Bangor và cộng sự, 2009) – ranh giới là điểm giữa các trung bình của từng nhãn
SUS_ADJECTIVES = [(88.2, "Tốt nhất có thể"), (78.5, "Xuất sắc"), (61.2, "Tốt"), (43.3, "Tạm được"),
                  (28.0, "Kém"), (16.4, "Rất kém"), (0.0, "Tệ nhất có thể")]

# t tới hạn hai phía 95% theo bậc tự do
_T95 = {1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262,
        10: 2.228, 11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131, 16: 2.120, 17: 2.110,
        18: 2.101, 19: 2.093, 20: 2.086, 21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060,
        26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042}

WARNINGS: list[str] = []


def warn(msg: str) -> None:
    WARNINGS.append(msg)
    print(f"[cảnh báo] {msg}", file=sys.stderr)


# --------------------------------------------------------------------------- tiện ích thống kê

def t_crit(df: int) -> float:
    if df <= 0:
        return float("nan")
    if df in _T95:
        return _T95[df]
    if df <= 60:
        return 2.000
    if df <= 120:
        return 1.980
    return 1.960


def describe(values) -> dict:
    s = pd.Series(values, dtype="float64").dropna()
    n = int(s.size)
    out = {"n": n, "mean": None, "sd": None, "median": None, "ci95_low": None, "ci95_high": None,
           "min": None, "max": None}
    if n == 0:
        return out
    mean = float(s.mean())
    out.update(mean=mean, median=float(s.median()), min=float(s.min()), max=float(s.max()))
    if n >= 2:
        sd = float(s.std(ddof=1))
        half = t_crit(n - 1) * sd / math.sqrt(n)
        out.update(sd=sd, ci95_low=mean - half, ci95_high=mean + half)
    return out


def adjusted_wald(successes: float, n: int, z: float = 1.96) -> tuple[float, float]:
    """Khoảng tin cậy Adjusted-Wald cho tỉ lệ hoàn thành (Sauro & Lewis, 2016)."""
    if n == 0:
        return (float("nan"), float("nan"))
    p = (successes + z * z / 2) / (n + z * z)
    half = z * math.sqrt(p * (1 - p) / (n + z * z))
    return (max(0.0, p - half), min(1.0, p + half))


def normal_cdf(z: float) -> float:
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def mann_whitney(a, b) -> dict | None:
    """Kiểm định Mann–Whitney U hai phía, xấp xỉ chuẩn có hiệu chỉnh hạng trùng."""
    a = [float(x) for x in a if pd.notna(x)]
    b = [float(x) for x in b if pd.notna(x)]
    n1, n2 = len(a), len(b)
    if n1 < 3 or n2 < 3:
        return None
    combined = pd.Series(a + b)
    ranks = combined.rank(method="average")
    r1 = float(ranks.iloc[:n1].sum())
    u1 = r1 - n1 * (n1 + 1) / 2
    big_n = n1 + n2
    ties = combined.value_counts()
    tie_term = float(((ties ** 3) - ties).sum()) / (big_n * (big_n - 1))
    sigma = math.sqrt(n1 * n2 / 12 * ((big_n + 1) - tie_term))
    if sigma == 0:
        return {"U": u1, "z": 0.0, "p": 1.0, "r": 0.0, "n1": n1, "n2": n2}
    z = (u1 - n1 * n2 / 2) / sigma
    p = 2 * (1 - normal_cdf(abs(z)))
    return {"U": u1, "z": z, "p": p, "r": abs(z) / math.sqrt(big_n), "n1": n1, "n2": n2}


def sus_grade(score: float) -> str:
    return next(g for cut, g in SUS_GRADES if score >= cut)


def sus_adjective(score: float) -> str:
    return next(a for cut, a in SUS_ADJECTIVES if score >= cut)


def natural_key(s: str):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", str(s))]


def to_number(series: pd.Series) -> pd.Series:
    s = series.astype("string").str.strip()
    num = pd.to_numeric(s.str.replace(",", ".", regex=False), errors="coerce")
    lead = s.str.extract(r"^\s*(-?\d+(?:[.,]\d+)?)", expand=False).str.replace(",", ".", regex=False)
    return num.fillna(pd.to_numeric(lead, errors="coerce")).astype("float64")


def fmt(x, digits: int = 2, pct: bool = False) -> str:
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return "–"
    if pct:
        return f"{x * 100:.1f}%"
    if isinstance(x, (int,)) and not isinstance(x, bool):
        return str(x)
    return f"{x:.{digits}f}"


PCT_PREFIXES = ("%", "Ủng hộ", "Trung lập", "Phản đối", "Hoàn thành", "Thành công", "Độ chính xác")


def md_table(df: pd.DataFrame, pct_cols: tuple[str, ...] = ()) -> str:
    """Bảng Markdown; cột tỉ lệ (0–1) được hiển thị dạng phần trăm."""
    if df is None or df.empty:
        return "_(không có dữ liệu)_\n"
    cols = [str(c) for c in df.columns]
    is_pct = [c.startswith(PCT_PREFIXES) or c in pct_cols for c in cols]
    lines = ["| " + " | ".join(cols) + " |", "|" + "|".join("---" for _ in cols) + "|"]
    for _, row in df.iterrows():
        cells = []
        for v, pct in zip(row.tolist(), is_pct):
            if isinstance(v, float):
                cells.append(fmt(v, pct=pct))
            elif v is None or (not isinstance(v, str) and pd.isna(v)):
                cells.append("–")
            else:
                cells.append(str(v).replace("|", "/").replace("\n", " "))
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines) + "\n"


def strip_leading_comments(text: str) -> str:
    lines = text.splitlines(keepends=True)
    i = 0
    while i < len(lines) and (lines[i].lstrip().startswith("#") or not lines[i].strip()):
        i += 1
    return "".join(lines[i:])


# --------------------------------------------------------------------------- đọc dữ liệu

def extract_code(header: str) -> str | None:
    h = str(header).strip()
    if h.lower() in TIMESTAMP_NAMES:
        return "TIMESTAMP"
    found = CODE_RE.findall(h)
    if found:
        return found[-1]
    if PLAIN_CODE_RE.match(h):
        return h
    return None


def read_forms_csv(path: Path, label: str | None) -> tuple[pd.DataFrame, list[str]]:
    text = strip_leading_comments(path.read_text(encoding="utf-8-sig"))
    raw = pd.read_csv(io.StringIO(text), dtype=str)
    rename, uncoded = {}, []
    for col in raw.columns:
        code = extract_code(col)
        if code is None:
            uncoded.append(str(col))
            continue
        if code in rename.values():
            warn(f"{path.name}: mã [{code}] xuất hiện nhiều lần, chỉ giữ cột đầu tiên.")
            continue
        rename[col] = code
    df = raw[list(rename)].rename(columns=rename)
    df = df.replace(r"^\s*$", pd.NA, regex=True)
    if label:
        df["ROUND"] = label
    elif "ROUND" in df.columns:
        df["ROUND"] = df["ROUND"].fillna(path.stem)
    else:
        df["ROUND"] = path.stem
    df["ROUND"] = df["ROUND"].astype("string").str.strip()
    df["_SOURCE"] = path.name
    return df, uncoded


def classify_columns(df: pd.DataFrame) -> dict[str, str]:
    kinds = {}
    for col in df.columns:
        if col in META_CODES or col.startswith("_"):
            continue
        s = df[col].dropna()
        if col.startswith("OPEN_") or col.endswith("_WHY") or col in ("AI_WRONG", "FT_BEST", "FT_WORST"):
            kinds[col] = "open"
        elif col.endswith("_M"):
            kinds[col] = "multi"
        elif s.empty:
            kinds[col] = "empty"
        elif to_number(s).notna().mean() >= 0.9:
            kinds[col] = "numeric"
        else:
            lengths = s.astype(str).str.len()
            if len(s) >= 5 and (lengths.mean() > 40 or (s.nunique() / len(s) > 0.8 and lengths.mean() > 15)):
                kinds[col] = "open"
            else:
                kinds[col] = "categorical"
    return kinds


def ordered_rounds(values) -> list[str]:
    return sorted({str(v) for v in values if pd.notna(v)}, key=natural_key)


# --------------------------------------------------------------------------- phân tích khảo sát

def analyze_sus(df: pd.DataFrame, rounds: list[str]):
    if not all(c in df.columns for c in SUS_ITEMS):
        missing = [c for c in SUS_ITEMS if c not in df.columns]
        if any(c in df.columns for c in SUS_ITEMS):
            warn(f"Thiếu câu SUS {missing}; không tính điểm SUS.")
        return None, None
    items = df[SUS_ITEMS].apply(to_number)
    valid = items.notna().all(axis=1) & items.isin([1, 2, 3, 4, 5]).all(axis=1)
    if (~valid).sum():
        warn(f"{int((~valid).sum())} phiếu thiếu/sai giá trị SUS (ngoài 1–5) bị loại khỏi điểm SUS.")
    odd = (items[SUS_ODD] - 1).sum(axis=1)
    even = (5 - items[SUS_EVEN]).sum(axis=1)
    learn_raw = (5 - items["SUS4"]) + (5 - items["SUS10"])
    scores = pd.DataFrame({
        "ROUND": df["ROUND"],
        "PID": df["PID"] if "PID" in df.columns else pd.NA,
        "sus": ((odd + even) * 2.5).where(valid),
        "sus_usability": ((odd + even - learn_raw) * 3.125).where(valid),
        "sus_learnability": (learn_raw * 12.5).where(valid),
    })
    rows = []
    for r in rounds:
        sub = scores.loc[scores["ROUND"] == r]
        d = describe(sub["sus"])
        if d["n"] == 0:
            continue
        rows.append({
            "Vòng": r, "n": d["n"], "SUS TB": d["mean"], "ĐLC": d["sd"], "Trung vị": d["median"],
            "CI95 thấp": d["ci95_low"], "CI95 cao": d["ci95_high"],
            "Khả dụng TB": float(sub["sus_usability"].mean()),
            "Khả năng học TB": float(sub["sus_learnability"].mean()),
            "% ≥ 70": float((sub["sus"].dropna() >= 70).mean()),
            "Xếp hạng": sus_grade(d["mean"]), "Tính từ": sus_adjective(d["mean"]),
        })
    return scores, pd.DataFrame(rows)


def analyze_nps(df: pd.DataFrame, rounds: list[str]) -> pd.DataFrame | None:
    if "NPS" not in df.columns:
        return None
    vals = to_number(df["NPS"])
    bad = vals.notna() & ~vals.between(0, 10)
    if bad.any():
        warn(f"{int(bad.sum())} giá trị NPS ngoài 0–10 bị loại.")
    vals = vals.where(~bad)
    rows = []
    for r in rounds:
        v = vals[df["ROUND"] == r].dropna()
        if v.empty:
            continue
        pro, det = float((v >= 9).mean()), float((v <= 6).mean())
        rows.append({"Vòng": r, "n": int(v.size), "Ủng hộ (9–10)": pro,
                     "Trung lập (7–8)": float(v.between(7, 8).mean()), "Phản đối (0–6)": det,
                     "NPS": (pro - det) * 100, "Điểm TB": float(v.mean())})
    return pd.DataFrame(rows)


def analyze_numeric(df: pd.DataFrame, cols: list[str], rounds: list[str]) -> pd.DataFrame:
    rows = []
    for col in cols:
        vals = to_number(df[col])
        scale_max = vals.max()
        for r in rounds:
            v = vals[df["ROUND"] == r]
            d = describe(v)
            if d["n"] == 0:
                continue
            top2 = float((v.dropna() >= 4).mean()) if pd.notna(scale_max) and scale_max <= 5 else None
            rows.append({"Mã": col, "Vòng": r, "n": d["n"], "TB": d["mean"], "ĐLC": d["sd"],
                         "Trung vị": d["median"], "CI95 thấp": d["ci95_low"], "CI95 cao": d["ci95_high"],
                         "% đồng ý (4–5)": top2})
    return pd.DataFrame(rows)


def analyze_categorical(df: pd.DataFrame, cols: list[str], multi: set[str], rounds: list[str]) -> pd.DataFrame:
    rows = []
    for col in cols:
        for r in rounds:
            s = df.loc[df["ROUND"] == r, col].dropna().astype(str)
            if s.empty:
                continue
            respondents = int(s.size)
            if col in multi:
                s = s.str.split(r",\s+").explode().str.strip()
                s = s[s != ""]
            counts = s.value_counts()
            for option, count in counts.items():
                rows.append({"Mã": col, "Vòng": r, "Lựa chọn": option, "Số lượt": int(count),
                             "% người trả lời": count / respondents})
    return pd.DataFrame(rows)


def collect_open(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    rows = []
    for col in cols:
        for idx, val in df[col].dropna().items():
            rows.append({"Vòng": df.at[idx, "ROUND"], "PID": df.at[idx, "PID"] if "PID" in df.columns else "",
                         "Mã": col, "Câu trả lời": str(val).strip()})
    return pd.DataFrame(rows)


# --------------------------------------------------------------------------- phiếu quan sát tác vụ

def read_tasks(paths: list[Path]) -> pd.DataFrame | None:
    frames = []
    for p in paths:
        t = pd.read_csv(io.StringIO(strip_leading_comments(p.read_text(encoding="utf-8-sig"))), dtype=str)
        t.columns = [c.strip().lower() for c in t.columns]
        missing = {"round", "participant", "task_id", "success"} - set(t.columns)
        if missing:
            warn(f"{p.name}: thiếu cột {sorted(missing)} – bỏ qua file phiếu quan sát này.")
            continue
        frames.append(t)
    if not frames:
        return None
    t = pd.concat(frames, ignore_index=True)
    for c in ("success", "time_sec", "errors", "seq", "ai_citations_total", "ai_citations_correct"):
        t[c] = to_number(t[c]) if c in t.columns else float("nan")
    bad = t["success"].notna() & ~t["success"].isin([0, 0.5, 1])
    if bad.any():
        warn(f"{int(bad.sum())} dòng phiếu quan sát có success khác 0/0.5/1 bị loại.")
        t = t.loc[~bad]
    t["round"] = t["round"].astype("string").str.strip()
    t["task_id"] = t["task_id"].astype("string").str.strip()
    return t


def analyze_tasks(t: pd.DataFrame):
    rounds = ordered_rounds(t["round"])
    per_task, per_round = [], []
    for r in rounds:
        tr = t.loc[t["round"] == r]
        for task in sorted(tr["task_id"].dropna().unique(), key=natural_key):
            s = tr.loc[tr["task_id"] == task]
            n = int(s["success"].notna().sum())
            ok = s.loc[s["success"] == 1, "time_sec"].dropna()
            ok = ok[ok > 0]
            lo, hi = adjusted_wald(float(s["success"].sum()), n)
            per_task.append({
                "Vòng": r, "Tác vụ": task, "n": n,
                "Hoàn thành TB": float(s["success"].mean()) if n else None,
                "CI95 thấp": lo, "CI95 cao": hi,
                "Thành công trọn vẹn": float((s["success"] == 1).mean()) if n else None,
                "Thời gian trung vị (s)": float(ok.median()) if not ok.empty else None,
                "Thời gian TB hình học (s)": float(math.exp(ok.apply(math.log).mean())) if not ok.empty else None,
                "Lỗi TB": float(s["errors"].mean()) if s["errors"].notna().any() else None,
                "SEQ TB": float(s["seq"].mean()) if s["seq"].notna().any() else None,
            })
        cit_total = float(tr["ai_citations_total"].sum(skipna=True))
        cit_ok = float(tr["ai_citations_correct"].sum(skipna=True))
        task_means = tr.groupby("task_id")["success"].mean()
        per_round.append({
            "Vòng": r, "Số người": int(tr["participant"].nunique()), "Số lượt tác vụ": int(tr["success"].notna().sum()),
            "Hoàn thành TB (mọi lượt)": float(tr["success"].mean()),
            "Hoàn thành TB (theo tác vụ)": float(task_means.mean()),
            "SEQ TB": float(tr["seq"].mean()) if tr["seq"].notna().any() else None,
            "Trích dẫn AI": int(cit_total),
            "Độ chính xác trích dẫn AI": (cit_ok / cit_total) if cit_total > 0 else None,
        })
    return pd.DataFrame(per_task), pd.DataFrame(per_round)


# --------------------------------------------------------------------------- GET /api/feedback/stats

def _normalize_group(obj, key_name: str) -> pd.DataFrame:
    rows = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, dict):
                rows.append({key_name: k, "count": _pick(v, ("count", "n", "total")),
                             "avg_rating": _pick(v, ("average_rating", "avg_rating", "avg", "mean_rating", "mean"))})
            else:
                rows.append({key_name: k, "count": v, "avg_rating": None})
    elif isinstance(obj, list):
        for item in obj:
            if not isinstance(item, dict):
                continue
            key = _pick(item, (key_name, "page", "category", "app_version", "name", "key", "label", "rating"))
            rows.append({key_name: key, "count": _pick(item, ("count", "n", "total")),
                         "avg_rating": _pick(item, ("average_rating", "avg_rating", "avg", "mean_rating", "mean"))})
    df = pd.DataFrame(rows, columns=[key_name, "count", "avg_rating"])
    for c in ("count", "avg_rating"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


def _pick(d: dict, keys):
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return None


def analyze_feedback_json(paths: list[Path]) -> dict | None:
    results = []
    for p in paths:
        data = json.loads(p.read_text(encoding="utf-8-sig"))
        records = None
        if isinstance(data, list):
            records = data
        elif isinstance(data, dict):
            for key in ("items", "feedback", "records", "data", "results"):
                v = data.get(key)
                if isinstance(v, list) and v and isinstance(v[0], dict) and "rating" in v[0]:
                    records = v
                    break
        res = {"source": p.name}
        if records:
            fb = pd.DataFrame(records).drop(columns=["contact", "email"], errors="ignore")
            fb["rating"] = pd.to_numeric(fb.get("rating"), errors="coerce")
            res["total"] = int(len(fb))
            res["avg_rating"] = float(fb["rating"].mean())
            for key in ("page", "category", "app_version"):
                if key in fb.columns:
                    g = fb.groupby(key, dropna=False)["rating"].agg(["count", "mean"]).reset_index()
                    res[f"by_{key}"] = g.rename(columns={"mean": "avg_rating"}).sort_values("count", ascending=False)
            dist = fb["rating"].value_counts().sort_index()
            res["rating_distribution"] = pd.DataFrame({"rating": dist.index.astype(int), "count": dist.values})
            if "message" in fb.columns:
                cols = [c for c in ("created_at", "app_version", "page", "category", "rating", "message") if c in fb.columns]
                res["messages"] = fb.loc[fb["message"].notna() & (fb["message"].astype(str).str.strip() != ""), cols]
        elif isinstance(data, dict):
            total = _pick(data, ("total", "count", "n"))
            avg = _pick(data, ("average_rating", "avg_rating", "mean_rating", "avg"))
            res["total"] = int(total) if total is not None else None
            res["avg_rating"] = float(avg) if avg is not None else None
            for key in ("page", "category", "app_version"):
                obj = data.get(f"by_{key}")
                if obj:
                    res[f"by_{key}"] = _normalize_group(obj, key).sort_values("count", ascending=False)
            dist = data.get("rating_distribution") or data.get("ratings")
            if dist:
                d = _normalize_group(dist, "rating")[["rating", "count"]]
                d["rating"] = pd.to_numeric(d["rating"], errors="coerce")
                res["rating_distribution"] = d.sort_values("rating")
            if res["avg_rating"] is None and "rating_distribution" in res:
                d = res["rating_distribution"]
                if d["count"].sum() > 0:
                    res["avg_rating"] = float((d["rating"] * d["count"]).sum() / d["count"].sum())
        else:
            warn(f"{p.name}: không nhận dạng được cấu trúc JSON feedback.")
            continue
        results.append(res)
    if not results:
        return None
    if len(results) > 1:
        warn("Nhiều file feedback JSON: chỉ phân tích chi tiết file đầu tiên, các file khác liệt kê ở tổng quan.")
    main = results[0]
    main["all_sources"] = [{"source": r["source"], "total": r.get("total"), "avg_rating": r.get("avg_rating")}
                           for r in results]
    return main


# --------------------------------------------------------------------------- biểu đồ

COLORS = ["#2f6db5", "#e0782f", "#3a9d5d", "#b8434f", "#7d5ab5", "#8c6d46", "#c25fa3", "#6b7280"]


def _save(fig, out: Path, name: str, charts: list[str]) -> None:
    path = out / name
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)
    charts.append(name)


def chart_sus(scores: pd.DataFrame, rounds: list[str], out: Path, charts: list[str]) -> None:
    data = [scores.loc[scores["ROUND"] == r, "sus"].dropna() for r in rounds]
    keep = [(r, d) for r, d in zip(rounds, data) if not d.empty]
    if not keep:
        return
    fig, ax = plt.subplots(figsize=(max(5, 1.6 * len(keep) + 2), 4.5))
    ax.boxplot([d for _, d in keep], tick_labels=[r for r, _ in keep], widths=0.5, showmeans=True)
    rng = random.Random(0)
    for i, (_, d) in enumerate(keep, start=1):
        ax.scatter([i + rng.uniform(-0.12, 0.12) for _ in d], d, s=18, alpha=0.6, color=COLORS[0], zorder=3)
    ax.axhline(68, color="#9ca3af", ls="--", lw=1, label="Trung bình chuẩn 68 (Sauro, 2011)")
    ax.axhline(TARGETS["sus_mean"], color="#b8434f", ls=":", lw=1.5, label=f"Mục tiêu {TARGETS['sus_mean']:.0f}")
    ax.set_ylim(0, 100)
    ax.set_ylabel("Điểm SUS")
    ax.set_title("Phân bố điểm SUS theo vòng")
    ax.legend(loc="lower right", fontsize=8)
    _save(fig, out, "sus_by_round.png", charts)


def chart_nps(nps: pd.DataFrame, out: Path, charts: list[str]) -> None:
    fig, ax = plt.subplots(figsize=(7, 0.7 * len(nps) + 1.8))
    y = range(len(nps))
    det, pas, pro = nps["Phản đối (0–6)"] * 100, nps["Trung lập (7–8)"] * 100, nps["Ủng hộ (9–10)"] * 100
    ax.barh(y, det, color="#b8434f", label="Phản đối (0–6)")
    ax.barh(y, pas, left=det, color="#d1d5db", label="Trung lập (7–8)")
    ax.barh(y, pro, left=det + pas, color="#3a9d5d", label="Ủng hộ (9–10)")
    ax.set_yticks(list(y), [f"{r}  (NPS {v:+.0f})" for r, v in zip(nps["Vòng"], nps["NPS"])])
    ax.set_xlim(0, 100)
    ax.set_xlabel("% người trả lời")
    ax.set_title("Net Promoter Score theo vòng")
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.25), ncol=3, fontsize=8, frameon=False)
    _save(fig, out, "nps_by_round.png", charts)


def chart_grouped_means(table: pd.DataFrame, codes: list[str], title: str, xmax: float, out: Path,
                        name: str, charts: list[str], ref: float | None = None) -> None:
    sub = table.loc[table["Mã"].isin(codes)]
    if sub.empty:
        return
    rounds = ordered_rounds(sub["Vòng"])
    codes = [c for c in codes if c in set(sub["Mã"])]
    height = 0.8 / len(rounds)
    fig, ax = plt.subplots(figsize=(8, 0.45 * len(codes) * max(1, len(rounds) * 0.7) + 1.5))
    for i, r in enumerate(rounds):
        vals = [sub.loc[(sub["Mã"] == c) & (sub["Vòng"] == r), "TB"] for c in codes]
        vals = [float(v.iloc[0]) if not v.empty else float("nan") for v in vals]
        ypos = [k + i * height for k in range(len(codes))]
        ax.barh(ypos, vals, height=height * 0.9, color=COLORS[i % len(COLORS)], label=r)
        for yy, vv in zip(ypos, vals):
            if not math.isnan(vv):
                ax.text(vv + xmax * 0.01, yy, f"{vv:.2f}", va="center", fontsize=7)
    ax.set_yticks([k + height * (len(rounds) - 1) / 2 for k in range(len(codes))], codes)
    ax.invert_yaxis()
    ax.set_xlim(0, xmax * 1.08)
    if ref is not None:
        ax.axvline(ref, color="#9ca3af", ls="--", lw=1)
    ax.set_xlabel("Điểm trung bình")
    ax.set_title(title)
    if len(rounds) > 1:
        ax.legend(fontsize=8, loc="lower right")
    _save(fig, out, name, charts)


def chart_categorical(cat: pd.DataFrame, code: str, out: Path, charts: list[str]) -> None:
    sub = cat.loc[cat["Mã"] == code]
    rounds = ordered_rounds(sub["Vòng"])
    options = sub.groupby("Lựa chọn")["Số lượt"].sum().sort_values(ascending=False).index[:12].tolist()
    height = 0.8 / len(rounds)
    fig, ax = plt.subplots(figsize=(8, 0.42 * len(options) * max(1, len(rounds) * 0.7) + 1.5))
    for i, r in enumerate(rounds):
        vals = []
        for o in options:
            v = sub.loc[(sub["Vòng"] == r) & (sub["Lựa chọn"] == o), "% người trả lời"]
            vals.append(float(v.iloc[0]) * 100 if not v.empty else 0.0)
        ax.barh([k + i * height for k in range(len(options))], vals, height=height * 0.9,
                color=COLORS[i % len(COLORS)], label=r)
    ax.set_yticks([k + height * (len(rounds) - 1) / 2 for k in range(len(options))],
                  [o if len(o) <= 45 else o[:42] + "…" for o in options])
    ax.invert_yaxis()
    ax.set_xlabel("% người trả lời")
    ax.set_title(f"[{code}]")
    if len(rounds) > 1:
        ax.legend(fontsize=8, loc="lower right")
    _save(fig, out, f"cat_{code}.png", charts)


def chart_tasks(per_task: pd.DataFrame, out: Path, charts: list[str]) -> None:
    rounds = ordered_rounds(per_task["Vòng"])
    tasks = sorted(per_task["Tác vụ"].unique(), key=natural_key)
    width = 0.8 / len(rounds)
    fig, ax = plt.subplots(figsize=(max(6, 0.9 * len(tasks) * max(1, len(rounds) * 0.6) + 2), 4.2))
    for i, r in enumerate(rounds):
        vals, lo, hi = [], [], []
        for t in tasks:
            row = per_task.loc[(per_task["Vòng"] == r) & (per_task["Tác vụ"] == t)]
            if row.empty:
                vals.append(float("nan")); lo.append(0); hi.append(0)
                continue
            v = float(row["Hoàn thành TB"].iloc[0]) * 100
            vals.append(v)
            lo.append(max(0, v - float(row["CI95 thấp"].iloc[0]) * 100))
            hi.append(max(0, float(row["CI95 cao"].iloc[0]) * 100 - v))
        ax.bar([k + i * width for k in range(len(tasks))], vals, width=width * 0.9, yerr=[lo, hi], capsize=3,
               color=COLORS[i % len(COLORS)], label=r, error_kw={"elinewidth": 0.8, "ecolor": "#374151"})
    ax.axhline(TARGETS["task_completion"] * 100, color="#b8434f", ls=":", lw=1.5,
               label=f"Mục tiêu {TARGETS['task_completion'] * 100:.0f}%")
    ax.set_xticks([k + width * (len(rounds) - 1) / 2 for k in range(len(tasks))], tasks)
    ax.set_ylim(0, 105)
    ax.set_ylabel("Tỉ lệ hoàn thành (%)")
    ax.set_title("Tỉ lệ hoàn thành tác vụ (CI 95% Adjusted-Wald)")
    ax.legend(fontsize=8, loc="upper center", bbox_to_anchor=(0.5, -0.1), ncol=len(rounds) + 1, frameon=False)
    _save(fig, out, "tasks_completion.png", charts)

    sub = per_task.dropna(subset=["Thời gian trung vị (s)"])
    if sub.empty:
        return
    fig, ax = plt.subplots(figsize=(max(6, 0.9 * len(tasks) * max(1, len(rounds) * 0.6) + 2), 4.0))
    for i, r in enumerate(rounds):
        vals = []
        for t in tasks:
            row = sub.loc[(sub["Vòng"] == r) & (sub["Tác vụ"] == t)]
            vals.append(float(row["Thời gian trung vị (s)"].iloc[0]) if not row.empty else float("nan"))
        ax.bar([k + i * width for k in range(len(tasks))], vals, width=width * 0.9,
               color=COLORS[i % len(COLORS)], label=r)
    ax.set_xticks([k + width * (len(rounds) - 1) / 2 for k in range(len(tasks))], tasks)
    ax.set_ylabel("Giây (trung vị, lượt thành công)")
    ax.set_title("Thời gian hoàn thành tác vụ")
    if len(rounds) > 1:
        ax.legend(fontsize=8)
    _save(fig, out, "tasks_time.png", charts)


def chart_feedback(fb: dict, out: Path, charts: list[str]) -> None:
    if "by_page" in fb and not fb["by_page"].empty:
        g = fb["by_page"].head(15)
        fig, ax = plt.subplots(figsize=(8, 0.4 * len(g) + 1.6))
        ax.barh(g["page"].astype(str), g["avg_rating"], color=COLORS[0])
        for y, (v, c) in enumerate(zip(g["avg_rating"], g["count"])):
            if pd.notna(v):
                ax.text(v + 0.05, y, f"{v:.2f} (n={int(c) if pd.notna(c) else '?'})", va="center", fontsize=7)
        ax.axvline(TARGETS["feedback_avg_rating"], color="#b8434f", ls=":", lw=1.5)
        ax.invert_yaxis()
        ax.set_xlim(0, 5.6)
        ax.set_xlabel("Điểm đánh giá trung bình (1–5)")
        ax.set_title("Widget feedback: điểm theo trang")
        _save(fig, out, "feedback_by_page.png", charts)
    if "rating_distribution" in fb and not fb["rating_distribution"].empty:
        d = fb["rating_distribution"]
        fig, ax = plt.subplots(figsize=(5.5, 3.5))
        ax.bar(d["rating"].astype(int).astype(str), d["count"], color=COLORS[2])
        ax.set_xlabel("Số sao")
        ax.set_ylabel("Số phản hồi")
        ax.set_title("Widget feedback: phân bố điểm")
        _save(fig, out, "feedback_rating_distribution.png", charts)


# --------------------------------------------------------------------------- tiêu chí & so sánh

def criteria_table(sus_tbl, nps_tbl, task_round, fb) -> pd.DataFrame:
    rows = []

    def add(name, target_txt, values: dict, ok_fn, as_pct=False):
        for r, v in values.items():
            if v is None or (isinstance(v, float) and math.isnan(v)):
                continue
            rows.append({"Chỉ số": name, "Ngưỡng": target_txt, "Vòng": r,
                         "Giá trị": fmt(v, pct=as_pct), "Kết quả": "ĐẠT" if ok_fn(v) else "CHƯA ĐẠT"})

    if sus_tbl is not None and not sus_tbl.empty:
        add("SUS trung bình", f"≥ {TARGETS['sus_mean']:.0f}", dict(zip(sus_tbl["Vòng"], sus_tbl["SUS TB"])),
            lambda v: v >= TARGETS["sus_mean"])
    if task_round is not None and not task_round.empty:
        add("Tỉ lệ hoàn thành tác vụ (TB theo tác vụ)", f"≥ {TARGETS['task_completion'] * 100:.0f}%",
            dict(zip(task_round["Vòng"], task_round["Hoàn thành TB (theo tác vụ)"])),
            lambda v: v >= TARGETS["task_completion"], as_pct=True)
        add("Độ chính xác trích dẫn AI", f"≥ {TARGETS['ai_citation_accuracy'] * 100:.0f}%",
            dict(zip(task_round["Vòng"], task_round["Độ chính xác trích dẫn AI"])),
            lambda v: v >= TARGETS["ai_citation_accuracy"], as_pct=True)
        add("SEQ trung bình (1–7)", f"≥ {TARGETS['seq_mean']}", dict(zip(task_round["Vòng"], task_round["SEQ TB"])),
            lambda v: v >= TARGETS["seq_mean"])
    if nps_tbl is not None and not nps_tbl.empty:
        add("NPS", f"≥ {TARGETS['nps']:.0f}", dict(zip(nps_tbl["Vòng"], nps_tbl["NPS"])), lambda v: v >= TARGETS["nps"])
    if fb and fb.get("avg_rating") is not None:
        add("Điểm widget feedback (1–5)", f"≥ {TARGETS['feedback_avg_rating']}", {"API": fb["avg_rating"]},
            lambda v: v >= TARGETS["feedback_avg_rating"])
    return pd.DataFrame(rows)


def round_comparison(rounds, sus_scores, sus_tbl, nps_tbl, num_tbl, task_round) -> tuple[pd.DataFrame, list[dict]]:
    if len(rounds) < 2:
        return pd.DataFrame(), []
    metrics = {}
    if sus_tbl is not None and not sus_tbl.empty:
        metrics["SUS TB"] = dict(zip(sus_tbl["Vòng"], sus_tbl["SUS TB"]))
    if nps_tbl is not None and not nps_tbl.empty:
        metrics["NPS"] = dict(zip(nps_tbl["Vòng"], nps_tbl["NPS"]))
    if task_round is not None and not task_round.empty:
        metrics["Hoàn thành tác vụ (%)"] = {r: v * 100 for r, v in
                                            zip(task_round["Vòng"], task_round["Hoàn thành TB (theo tác vụ)"])}
        metrics["Độ chính xác trích dẫn AI (%)"] = {r: (v * 100 if v is not None and pd.notna(v) else None) for r, v in
                                                    zip(task_round["Vòng"], task_round["Độ chính xác trích dẫn AI"])}
        metrics["SEQ TB"] = dict(zip(task_round["Vòng"], task_round["SEQ TB"]))
    if num_tbl is not None and not num_tbl.empty:
        for code in [c for c in num_tbl["Mã"].unique() if c.startswith(("FT_", "AI_"))]:
            s = num_tbl.loc[num_tbl["Mã"] == code]
            metrics[code] = dict(zip(s["Vòng"], s["TB"]))
    rows = []
    for name, vals in metrics.items():
        row = {"Chỉ số": name}
        for r in rounds:
            row[r] = vals.get(r)
        present = [r for r in rounds if vals.get(r) is not None and pd.notna(vals.get(r))]
        row[f"Δ ({present[-1]} − {present[0]})" if len(present) >= 2 else "Δ"] = (
            vals[present[-1]] - vals[present[0]] if len(present) >= 2 else None)
        rows.append(row)
    comp = pd.DataFrame(rows)
    delta_cols = [c for c in comp.columns if str(c).startswith("Δ")]
    if len(delta_cols) > 1:
        comp["Δ cuối − đầu"] = comp[delta_cols].bfill(axis=1).iloc[:, 0]
        comp = comp.drop(columns=delta_cols)
    tests = []
    if sus_scores is not None:
        for a, b in zip(rounds, rounds[1:]):
            res = mann_whitney(sus_scores.loc[sus_scores["ROUND"] == a, "sus"],
                               sus_scores.loc[sus_scores["ROUND"] == b, "sus"])
            if res:
                tests.append({"so sánh": f"{a} vs {b}", **res})
    return comp, tests


# --------------------------------------------------------------------------- báo cáo

def df_records(df):
    if df is None:
        return None
    return json.loads(df.to_json(orient="records", force_ascii=False))


def write_outputs(out: Path, ctx: dict) -> None:
    md = ["# Kết quả phân tích khảo sát UELPlan", "",
          f"_Tạo lúc {datetime.now():%Y-%m-%d %H:%M} bởi `research/analysis/analyze_survey.py`._", ""]
    if ctx.get("synthetic"):
        md += ["> **CẢNH BÁO: dữ liệu đầu vào được đánh dấu là GIẢ LẬP – không dùng kết quả này trong khóa luận.**", ""]
    md += ["## 1. Dữ liệu đầu vào", ""]
    md.append(md_table(pd.DataFrame(ctx["sources"])))
    if ctx["uncoded"]:
        md += ["Cột không có mã `[...]` (bị bỏ qua, gồm cả cột email/liên hệ nếu có): "
               + "; ".join(f"`{c[:60]}`" for c in ctx["uncoded"]), ""]

    md += ["## 2. Kiểm tra tiêu chí thành công", ""]
    md.append(md_table(ctx["criteria"]))

    if ctx["sus_tbl"] is not None and not ctx["sus_tbl"].empty:
        md += ["## 3. System Usability Scale (Brooke, 1996)", "",
               "Điểm 0–100 (không phải %). Khả dụng = 8 câu (trừ SUS4, SUS10) và Khả năng học = SUS4 + SUS10 "
               "(Lewis & Sauro, 2009). Xếp hạng: thang A–F của Sauro & Lewis (2016); tính từ: Bangor và cộng sự (2009).",
               "", md_table(ctx["sus_tbl"])]
    if ctx["nps_tbl"] is not None and not ctx["nps_tbl"].empty:
        md += ["## 4. Net Promoter Score (Reichheld, 2003)", "", md_table(ctx["nps_tbl"]),
               "_Với n < 30, NPS dao động mạnh; chỉ dùng như chỉ báo bổ trợ._", ""]
    num = ctx["num_tbl"]
    if num is not None and not num.empty:
        md += ["## 5. Câu hỏi thang đo (thống kê mô tả)", ""]
        groups = [("Đánh giá tính năng (FT_)", "FT_"), ("Đánh giá AI quy chế (AI_)", "AI_")]
        shown = set()
        for title, prefix in groups:
            sub = num.loc[num["Mã"].str.startswith(prefix)]
            if not sub.empty:
                md += [f"### {title}", "", md_table(sub)]
                shown |= set(sub["Mã"])
        rest = num.loc[~num["Mã"].isin(shown)]
        if not rest.empty:
            md += ["### Câu thang đo khác", "", md_table(rest)]
    cat = ctx["cat_tbl"]
    if cat is not None and not cat.empty:
        md += ["## 6. Câu hỏi lựa chọn (tần suất)", "",
               "Câu nhiều lựa chọn (`_M`): % tính trên số người trả lời câu đó nên tổng có thể > 100%.", ""]
        for code in cat["Mã"].unique():
            md += [f"### [{code}]", "", md_table(cat.loc[cat["Mã"] == code].drop(columns=["Mã"]))]
    if ctx["open_n"]:
        md += ["## 7. Câu hỏi mở", "",
               f"{ctx['open_n']} câu trả lời mở được xuất ra `open_answers.csv` để mã hóa theo chủ đề "
               "(Braun & Clarke, 2006).", ""]
    if ctx["task_round"] is not None:
        md += ["## 8. Kiểm thử khả dụng (phiếu quan sát)", "", "### Theo vòng", "", md_table(ctx["task_round"]),
               "### Theo tác vụ", "", md_table(ctx["task_tbl"], pct_cols=("CI95 thấp", "CI95 cao")),
               "_Hoàn thành: 1 = thành công, 0,5 = một phần/có trợ giúp, 0 = thất bại. Thời gian chỉ tính lượt "
               "thành công trọn vẹn; CI 95% Adjusted-Wald (Sauro & Lewis, 2016)._", ""]
    fb = ctx["feedback"]
    if fb:
        md += ["## 9. Widget feedback (`GET /api/feedback/stats`)", "",
               f"Nguồn: `{fb['source']}` – tổng {fmt(fb.get('total'))} phản hồi, điểm trung bình "
               f"{fmt(fb.get('avg_rating'))}/5.", ""]
        for key, title in (("by_page", "Theo trang"), ("by_category", "Theo loại góp ý"),
                           ("by_app_version", "Theo phiên bản (so sánh giữa các bản phát hành)"),
                           ("rating_distribution", "Phân bố điểm")):
            if key in fb and not fb[key].empty:
                md += [f"### {title}", "", md_table(fb[key])]
        if "messages" in fb and not fb["messages"].empty:
            md += [f"{len(fb['messages'])} góp ý dạng văn bản được xuất ra `feedback_messages.csv`.", ""]
    if not ctx["comparison"].empty:
        md += ["## 10. So sánh giữa các vòng", "", md_table(ctx["comparison"])]
        if ctx["tests"]:
            t = pd.DataFrame(ctx["tests"])[["so sánh", "n1", "n2", "U", "z", "p", "r"]]
            md += ["Kiểm định Mann–Whitney U cho điểm SUS (hai phía, xấp xỉ chuẩn; r = |z|/√N là độ lớn hiệu ứng). "
                   "Với cỡ mẫu nhỏ, kết quả chỉ mang tính tham khảo.", "", md_table(t)]
    if ctx["charts"]:
        md += ["## Biểu đồ", ""] + [f"![{c}]({c})" for c in ctx["charts"]] + [""]
    if WARNINGS:
        md += ["## Cảnh báo khi xử lý", ""] + [f"- {w}" for w in WARNINGS] + [""]
    (out / "summary.md").write_text("\n".join(md), encoding="utf-8")

    summary = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "synthetic_input": ctx.get("synthetic", False),
        "sources": ctx["sources"], "rounds": ctx["rounds"], "targets": TARGETS,
        "criteria": df_records(ctx["criteria"]), "sus": df_records(ctx["sus_tbl"]),
        "nps": df_records(ctx["nps_tbl"]), "numeric": df_records(ctx["num_tbl"]),
        "categorical": df_records(ctx["cat_tbl"]), "tasks_by_round": df_records(ctx["task_round"]),
        "tasks_by_task": df_records(ctx["task_tbl"]), "comparison": df_records(ctx["comparison"]),
        "sus_tests": ctx["tests"], "charts": ctx["charts"], "warnings": WARNINGS,
    }
    if fb:
        summary["feedback"] = {k: (df_records(v) if isinstance(v, pd.DataFrame) else v)
                               for k, v in fb.items() if k != "messages"}
    (out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


def save_csv(df, path: Path) -> None:
    if df is not None and not df.empty:
        df.to_csv(path, index=False, encoding="utf-8-sig")


# --------------------------------------------------------------------------- dữ liệu GIẢ LẬP

SAMPLE_QUESTIONS = [
    ("ROUND", "[ROUND] Vòng thử nghiệm"),
    ("PID", "[PID] Mã người tham gia"),
    ("COHORT", "[COHORT] Khóa tuyển sinh"),
    ("DEVICE", "[DEVICE] Thiết bị bạn dùng trong buổi thử"),
    ("SUS1", "[SUS1] Tôi nghĩ rằng tôi sẽ muốn sử dụng UELPlan thường xuyên."),
    ("SUS2", "[SUS2] Tôi thấy UELPlan phức tạp một cách không cần thiết."),
    ("SUS3", "[SUS3] Tôi thấy UELPlan dễ sử dụng."),
    ("SUS4", "[SUS4] Tôi nghĩ rằng tôi sẽ cần sự hỗ trợ của người am hiểu kỹ thuật để có thể sử dụng UELPlan."),
    ("SUS5", "[SUS5] Tôi thấy các chức năng của UELPlan được kết hợp với nhau tốt."),
    ("SUS6", "[SUS6] Tôi thấy UELPlan có quá nhiều điểm thiếu nhất quán."),
    ("SUS7", "[SUS7] Tôi nghĩ rằng hầu hết mọi người sẽ học cách sử dụng UELPlan rất nhanh."),
    ("SUS8", "[SUS8] Tôi thấy UELPlan rất rườm rà, bất tiện khi sử dụng."),
    ("SUS9", "[SUS9] Tôi cảm thấy rất tự tin khi sử dụng UELPlan."),
    ("SUS10", "[SUS10] Tôi cần học nhiều thứ trước khi có thể bắt đầu sử dụng UELPlan."),
    ("FT_SEARCH", "[FT_SEARCH] Tìm kiếm và lọc học phần"),
    ("FT_TIMETABLE", "[FT_TIMETABLE] Xếp thời khóa biểu, cảnh báo trùng lịch"),
    ("FT_DRAG", "[FT_DRAG] Kéo-thả đổi lớp, nhiều phương án TKB"),
    ("FT_SHARE", "[FT_SHARE] Chia sẻ link, xuất PNG/ICS"),
    ("FT_EQUIV", "[FT_EQUIV] Tra cứu học phần tương đương"),
    ("FT_REG", "[FT_REG] Duyệt văn bản quy chế, cảnh báo hiệu lực"),
    ("FT_AI", "[FT_AI] Hỏi AI về quy chế"),
    ("AI_ACCURATE", "[AI_ACCURATE] Câu trả lời của AI đúng với điều tôi cần biết."),
    ("AI_COHORT", "[AI_COHORT] Câu trả lời áp dụng đúng cho khóa của tôi."),
    ("AI_CITATION", "[AI_CITATION] Phần trích dẫn (số quyết định, Điều, Khoản) giúp tôi kiểm chứng câu trả lời."),
    ("AI_TRUST", "[AI_TRUST] Tôi tin tưởng câu trả lời của AI trong UELPlan."),
    ("AI_USEFUL", "[AI_USEFUL] AI quy chế giúp tôi tiết kiệm thời gian so với tự tìm văn bản."),
    ("NPS", "[NPS] Bạn có khả năng giới thiệu UELPlan cho một người bạn cùng trường ở mức nào?"),
    ("NPS_WHY", "[NPS_WHY] Lý do chính cho điểm số trên là gì?"),
    ("OPEN_IMPROVE", "[OPEN_IMPROVE] Nếu chỉ được cải thiện một điều, bạn sẽ chọn điều gì?"),
]

_OPEN_V1 = ["Cảnh báo trùng lịch khó thấy, nên tô đỏ rõ hơn.", "Muốn kéo-thả đổi lớp nhanh hơn.",
            "Kết quả AI dài, khó tìm đúng Khoản.", "Nút chia sẻ khó tìm.", "Giao diện điện thoại bị chật.",
            "Không biết đổi khóa tuyển sinh ở đâu."]
_OPEN_V2 = ["Nên có thêm gợi ý lớp thay thế tự động.", "AI nên tóm tắt ngắn trước khi trích nguyên văn.",
            "Ổn rồi, muốn thêm xuất lịch Google.", "Thêm chế độ tối cho đỡ mỏi mắt."]


def make_sample(out_dir: Path, seed: int = 2026) -> list[Path]:
    """Sinh bộ dữ liệu GIẢ LẬP (2 vòng × 12 người) để chạy thử script."""
    rng = random.Random(seed)
    out_dir.mkdir(parents=True, exist_ok=True)
    clip = lambda v, lo, hi: max(lo, min(hi, int(round(v))))  # noqa: E731
    rows, start = [], datetime(2026, 3, 10, 9, 0)
    plan = [("V1", 12, 0.55, 0.0), ("V2", 12, 1.0, 0.45)]
    pid = 0
    for rnd, n, mu, boost in plan:
        for i in range(n):
            pid += 1
            q = rng.gauss(mu, 0.55)
            r = {"ROUND": rnd, "PID": f"P{pid:02d}", "COHORT": rng.choice(["K46", "K47", "K48", "K49", "K49", "K50"]),
                 "DEVICE": rng.choice(["Máy tính", "Máy tính", "Điện thoại"])}
            for k in range(1, 11):
                noise = rng.gauss(0, 0.6)
                r[f"SUS{k}"] = clip(3 + q + noise, 1, 5) if k % 2 else clip(3 - q + noise, 1, 5)
            for code, base in (("FT_SEARCH", 3.9), ("FT_TIMETABLE", 4.2), ("FT_DRAG", 3.4), ("FT_SHARE", 3.6),
                               ("FT_EQUIV", 4.0), ("FT_REG", 3.5), ("FT_AI", 3.8)):
                if rng.random() < 0.08:
                    r[code] = ""  # chưa dùng tính năng
                else:
                    r[code] = clip(base + boost + 0.4 * q + rng.gauss(0, 0.6), 1, 5)
            for code, base in (("AI_ACCURATE", 3.7), ("AI_COHORT", 3.9), ("AI_CITATION", 4.3), ("AI_TRUST", 3.5),
                               ("AI_USEFUL", 3.9)):
                r[code] = clip(base + boost + 0.3 * q + rng.gauss(0, 0.6), 1, 5)
            r["NPS"] = clip(6.8 + 1.6 * q + 0.8 * boost + rng.gauss(0, 1.1), 0, 10)
            r["NPS_WHY"] = rng.choice(["Tiện khi xếp TKB.", "Có trích dẫn quy chế rõ ràng.", "Còn vài lỗi nhỏ.",
                                       "Tiết kiệm thời gian.", ""])
            r["OPEN_IMPROVE"] = rng.choice(_OPEN_V1 if rnd == "V1" else _OPEN_V2)
            ts = start + timedelta(days=(0 if rnd == "V1" else 35) + i // 4, minutes=37 * i)
            r["TIMESTAMP"] = ts.strftime("%Y/%m/%d %I:%M:%S %p") + " GMT+7"
            rows.append(r)
    header = ["Dấu thời gian"] + [text for _, text in SAMPLE_QUESTIONS]
    codes = ["TIMESTAMP"] + [c for c, _ in SAMPLE_QUESTIONS]
    df = pd.DataFrame([[row.get(c, "") for c in codes] for row in rows], columns=header)
    resp = out_dir / "sample_responses.csv"
    with resp.open("w", encoding="utf-8-sig", newline="") as fh:
        fh.write("# DỮ LIỆU GIẢ LẬP – sinh bởi analyze_survey.py --make-sample; KHÔNG dùng trong khóa luận\n")
        df.to_csv(fh, index=False)

    # Phiếu quan sát tác vụ (GIẢ LẬP)
    tasks = {"T1": (0.80, 150), "T2": (0.70, 330), "T3": (0.75, 120), "T4": (0.70, 210), "T5": (0.60, 260),
             "T6": (0.85, 90), "T7": (0.65, 240)}
    trows = []
    for rnd, n, _, boost in plan:
        first = 1 if rnd == "V1" else 13
        for p in range(first, first + n):
            for task, (p_ok, base_t) in tasks.items():
                p_succ = min(0.97, p_ok + boost * 0.4)
                u = rng.random()
                success = 1 if u < p_succ else (0.5 if u < p_succ + (1 - p_succ) * 0.5 else 0)
                t = max(30, rng.lognormvariate(math.log(base_t * (1 - 0.25 * boost)), 0.3))
                errors = max(0, int(round(rng.gauss(1.4 - boost * 1.5 if success == 1 else 2.8, 0.8))))
                seq = clip(4.3 + 1.6 * success + boost + rng.gauss(0, 0.8), 1, 7)
                cit_total = cit_ok = ""
                if task in ("T4", "T5"):
                    cit_total = rng.randint(2, 4)
                    p_cit = 0.90 if rnd == "V1" else 0.985
                    cit_ok = sum(rng.random() < p_cit for _ in range(cit_total))
                trows.append({"round": rnd, "participant": f"P{p:02d}", "task_id": task, "success": success,
                              "time_sec": int(t), "errors": errors, "seq": seq, "ai_citations_total": cit_total,
                              "ai_citations_correct": cit_ok, "notes": ""})
    tpath = out_dir / "sample_tasks.csv"
    with tpath.open("w", encoding="utf-8-sig", newline="") as fh:
        fh.write("# DỮ LIỆU GIẢ LẬP – phiếu quan sát kiểm thử khả dụng; KHÔNG dùng trong khóa luận\n")
        pd.DataFrame(trows).to_csv(fh, index=False)

    # Export GET /api/feedback/stats (GIẢ LẬP) – gồm cả phần tổng hợp và bản ghi thô
    pages = {"/": 4.1, "/modules": 4.0, "/timetable": 3.7, "/equivalents": 4.2, "/regulations": 3.9,
             "/regulations/ask": 3.6, "/planner": 3.8}
    cats = ["bug", "suggestion", "praise", "content", "other"]
    items = []
    for k in range(60):
        version = "0.1.0" if k < 32 else "0.2.0"
        page = rng.choice(list(pages))
        rating = clip(pages[page] + (0.35 if version == "0.2.0" else 0) + rng.gauss(0, 0.9), 1, 5)
        items.append({"id": k + 1, "page": page, "rating": rating, "category": rng.choice(cats),
                      "message": rng.choice(["", "Lọc theo khoa chưa nhớ lựa chọn.", "Trùng lịch hiển thị tốt.",
                                             "Trích dẫn rất hữu ích.", "Trang chậm khi tải nhiều lớp."]),
                      "app_version": version,
                      "created_at": (start + timedelta(hours=9 * k)).isoformat(timespec="seconds")})
    fb = pd.DataFrame(items)
    by_page = fb.groupby("page")["rating"].agg(["count", "mean"]).reset_index()
    by_cat = fb.groupby("category")["rating"].agg(["count", "mean"]).reset_index()
    stats = {
        "_note": "DỮ LIỆU GIẢ LẬP – mô phỏng phản hồi của GET /api/feedback/stats; KHÔNG dùng trong khóa luận",
        "total": int(len(fb)),
        "average_rating": round(float(fb["rating"].mean()), 3),
        "by_page": [{"page": r.page, "count": int(r["count"]), "average_rating": round(float(r["mean"]), 3)}
                    for _, r in by_page.iterrows()],
        "by_category": [{"category": r.category, "count": int(r["count"]), "average_rating": round(float(r["mean"]), 3)}
                        for _, r in by_cat.iterrows()],
        "rating_distribution": {str(k): int(v) for k, v in fb["rating"].value_counts().sort_index().items()},
        "items": items,
    }
    jpath = out_dir / "sample_feedback_stats.json"
    jpath.write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")
    return [resp, tpath, jpath]


# --------------------------------------------------------------------------- main

def parse_input(arg: str) -> tuple[str | None, Path]:
    if "=" in arg and not Path(arg).exists():
        label, path = arg.split("=", 1)
        return label.strip() or None, Path(path)
    return None, Path(arg)


def is_synthetic(paths: list[Path]) -> bool:
    for p in paths:
        try:
            head = p.read_text(encoding="utf-8-sig")[:400]
        except OSError:
            continue
        if "GIẢ LẬP" in head:
            return True
    return False


def run(args) -> int:
    WARNINGS.clear()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    charts: list[str] = []

    frames, sources, uncoded = [], [], []
    for item in args.inputs:
        label, path = parse_input(item)
        if not path.exists():
            print(f"Không tìm thấy file: {path}", file=sys.stderr)
            return 2
        d, unc = read_forms_csv(path, label or args.round)
        frames.append(d)
        uncoded += [u for u in unc if u not in uncoded]
        sources.append({"Loại": "Khảo sát (Google Forms)", "File": path.name, "Số phiếu": len(d),
                        "Vòng": ", ".join(ordered_rounds(d["ROUND"]))})
    df = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(columns=["ROUND"])
    rounds = ordered_rounds(df["ROUND"]) if not df.empty else []

    kinds = classify_columns(df) if not df.empty else {}
    sus_scores, sus_tbl = analyze_sus(df, rounds) if not df.empty else (None, None)
    nps_tbl = analyze_nps(df, rounds) if not df.empty else None
    numeric_cols = [c for c, k in kinds.items() if k == "numeric" and c not in SUS_ITEMS and c != "NPS"]
    num_tbl = analyze_numeric(df, numeric_cols, rounds) if numeric_cols else None
    cat_cols = [c for c, k in kinds.items() if k in ("categorical", "multi")]
    cat_tbl = analyze_categorical(df, cat_cols, {c for c in cat_cols if kinds[c] == "multi"}, rounds) if cat_cols else None
    open_tbl = collect_open(df, [c for c, k in kinds.items() if k == "open"]) if kinds else pd.DataFrame()

    task_tbl = task_round = None
    if args.tasks:
        tdf = read_tasks([Path(p) for p in args.tasks])
        if tdf is not None and not tdf.empty:
            task_tbl, task_round = analyze_tasks(tdf)
            sources.append({"Loại": "Phiếu quan sát tác vụ", "File": ", ".join(Path(p).name for p in args.tasks),
                            "Số phiếu": len(tdf), "Vòng": ", ".join(ordered_rounds(tdf["round"]))})
            rounds = sorted(set(rounds) | set(ordered_rounds(tdf["round"])), key=natural_key)

    fb = analyze_feedback_json([Path(p) for p in args.feedback_json]) if args.feedback_json else None
    if fb:
        sources.append({"Loại": "GET /api/feedback/stats", "File": ", ".join(Path(p).name for p in args.feedback_json),
                        "Số phiếu": fb.get("total"), "Vòng": "–"})

    if df.empty and task_tbl is None and fb is None:
        print("Không có dữ liệu để phân tích. Xem --help.", file=sys.stderr)
        return 2

    # Bảng CSV
    if sus_scores is not None:
        save_csv(sus_scores.dropna(subset=["sus"]), out / "sus_scores.csv")
    save_csv(sus_tbl, out / "sus_summary.csv")
    save_csv(nps_tbl, out / "nps_summary.csv")
    save_csv(num_tbl, out / "likert_summary.csv")
    save_csv(cat_tbl, out / "categorical_summary.csv")
    save_csv(open_tbl, out / "open_answers.csv")
    save_csv(task_tbl, out / "tasks_by_task.csv")
    save_csv(task_round, out / "tasks_by_round.csv")
    if fb:
        for key in ("by_page", "by_category", "by_app_version"):
            if key in fb:
                save_csv(fb[key], out / f"feedback_{key}.csv")
        save_csv(fb.get("messages"), out / "feedback_messages.csv")

    # Biểu đồ
    if not args.no_charts:
        def safe(fn, *a):
            try:
                fn(*a)
            except Exception as exc:  # biểu đồ lỗi không được làm hỏng toàn bộ báo cáo
                warn(f"Không vẽ được biểu đồ {fn.__name__}: {exc}")
        if sus_scores is not None:
            safe(chart_sus, sus_scores, rounds, out, charts)
        if nps_tbl is not None and not nps_tbl.empty:
            safe(chart_nps, nps_tbl, out, charts)
        if num_tbl is not None and not num_tbl.empty:
            codes = list(dict.fromkeys(num_tbl["Mã"]))
            ft = [c for c in codes if c.startswith("FT_")]
            ai = [c for c in codes if c.startswith("AI_")]
            other = [c for c in codes if c not in ft and c not in ai]
            safe(chart_grouped_means, num_tbl, ft, "Mức hữu ích của tính năng (1–5)", 5, out, "features_mean.png", charts, 4)
            safe(chart_grouped_means, num_tbl, ai, "Đánh giá AI quy chế (1–5)", 5, out, "ai_mean.png", charts, 4)
            if other:
                xmax = float(num_tbl.loc[num_tbl["Mã"].isin(other), "TB"].max())
                safe(chart_grouped_means, num_tbl, other, "Câu thang đo (điểm trung bình)", max(5.0, xmax), out,
                     "likert_mean.png", charts, None)
        if cat_tbl is not None and not cat_tbl.empty:
            for code in cat_tbl["Mã"].unique():
                safe(chart_categorical, cat_tbl, code, out, charts)
        if task_tbl is not None and not task_tbl.empty:
            safe(chart_tasks, task_tbl, out, charts)
        if fb:
            safe(chart_feedback, fb, out, charts)

    criteria = criteria_table(sus_tbl, nps_tbl, task_round, fb)
    comparison, tests = round_comparison(rounds, sus_scores, sus_tbl, nps_tbl, num_tbl, task_round)
    save_csv(comparison, out / "round_comparison.csv")

    synthetic = is_synthetic([parse_input(i)[1] for i in args.inputs] + [Path(p) for p in (args.tasks or [])]
                             + [Path(p) for p in (args.feedback_json or [])])
    write_outputs(out, {
        "synthetic": synthetic, "sources": sources, "uncoded": uncoded, "rounds": rounds, "criteria": criteria,
        "sus_tbl": sus_tbl, "nps_tbl": nps_tbl, "num_tbl": num_tbl, "cat_tbl": cat_tbl,
        "open_n": len(open_tbl), "task_tbl": task_tbl, "task_round": task_round, "feedback": fb,
        "comparison": comparison, "tests": tests, "charts": charts,
    })

    # Tóm tắt ra màn hình
    print(f"Đã phân tích: vòng {', '.join(rounds) or '–'}; kết quả tại {out.resolve()}")
    if sus_tbl is not None and not sus_tbl.empty:
        for _, r in sus_tbl.iterrows():
            print(f"  SUS {r['Vòng']}: {r['SUS TB']:.1f} (n={r['n']}, CI95 {fmt(r['CI95 thấp'], 1)}–"
                  f"{fmt(r['CI95 cao'], 1)}, hạng {r['Xếp hạng']})")
    if nps_tbl is not None and not nps_tbl.empty:
        for _, r in nps_tbl.iterrows():
            print(f"  NPS {r['Vòng']}: {r['NPS']:+.0f} (n={r['n']})")
    if task_round is not None:
        for _, r in task_round.iterrows():
            acc = r["Độ chính xác trích dẫn AI"]
            print(f"  Tác vụ {r['Vòng']}: hoàn thành {r['Hoàn thành TB (theo tác vụ)'] * 100:.1f}%, "
                  f"trích dẫn AI đúng {fmt(acc, pct=True)}")
    if fb:
        print(f"  Feedback API: {fmt(fb.get('total'))} phản hồi, TB {fmt(fb.get('avg_rating'))}/5")
    if not criteria.empty:
        print(f"  Tiêu chí: {(criteria['Kết quả'] == 'ĐẠT').sum()}/{len(criteria)} dòng ĐẠT")
    print(f"  {len(charts)} biểu đồ PNG, {len(WARNINGS)} cảnh báo")
    if synthetic:
        print("  LƯU Ý: đầu vào là DỮ LIỆU GIẢ LẬP.")
    return 0


def main(argv=None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description="Phân tích khảo sát/kiểm thử UELPlan (SUS, NPS, Likert, tác vụ, feedback).")
    ap.add_argument("inputs", nargs="*", help="CSV Google Forms, dạng NHÃN=đường_dẫn hoặc đường_dẫn")
    ap.add_argument("--tasks", nargs="+", help="CSV phiếu quan sát tác vụ")
    ap.add_argument("--feedback-json", nargs="+", help="JSON lưu từ GET /api/feedback/stats")
    ap.add_argument("--round", help="Nhãn vòng mặc định cho CSV không có nhãn và không có cột [ROUND]")
    ap.add_argument("--out", default=str(Path(__file__).with_name("output")), help="Thư mục kết quả")
    ap.add_argument("--no-charts", action="store_true", help="Không vẽ biểu đồ")
    ap.add_argument("--make-sample", metavar="DIR", help="Sinh bộ dữ liệu GIẢ LẬP vào DIR rồi thoát")
    args = ap.parse_args(argv)
    if args.make_sample:
        for p in make_sample(Path(args.make_sample)):
            print(f"Đã tạo (GIẢ LẬP): {p}")
        return 0
    if not args.inputs and not args.tasks and not args.feedback_json:
        ap.print_help()
        return 2
    return run(args)


if __name__ == "__main__":
    sys.exit(main())

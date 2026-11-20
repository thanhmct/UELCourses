"""Kiểm thử cho analyze_survey.py.

Chạy: research\\.venv\\Scripts\\python -m unittest discover -s research\\analysis -v
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import analyze_survey as az  # noqa: E402


def _write(path: Path, text: str) -> Path:
    path.write_text(text, encoding="utf-8-sig")
    return path


class SusNpsTests(unittest.TestCase):
    def _df(self, rows):
        df = pd.DataFrame(rows, columns=az.SUS_ITEMS).astype(str)
        df["ROUND"] = "V1"
        return df

    def test_sus_known_values(self):
        best = [5, 1] * 5      # 100
        worst = [1, 5] * 5     # 0
        neutral = [3] * 10     # 50
        scores, tbl = az.analyze_sus(self._df([best, worst, neutral]), ["V1"])
        self.assertEqual(scores["sus"].tolist(), [100.0, 0.0, 50.0])
        self.assertAlmostEqual(tbl.loc[0, "SUS TB"], 50.0)
        self.assertEqual(scores["sus_learnability"].tolist(), [100.0, 0.0, 50.0])

    def test_sus_invalid_row_excluded(self):
        scores, tbl = az.analyze_sus(self._df([[3] * 10, [3] * 9 + [6]]), ["V1"])
        self.assertTrue(pd.isna(scores["sus"].iloc[1]))
        self.assertEqual(int(tbl.loc[0, "n"]), 1)

    def test_nps(self):
        df = pd.DataFrame({"NPS": ["10", "9", "8", "6", "0"], "ROUND": "V1"})
        tbl = az.analyze_nps(df, ["V1"])
        self.assertAlmostEqual(tbl.loc[0, "NPS"], (2 / 5 - 2 / 5) * 100)

    def test_grades(self):
        self.assertEqual(az.sus_grade(68), "C")
        self.assertEqual(az.sus_grade(85), "A+")
        self.assertEqual(az.sus_adjective(72), "Tốt")

    def test_mann_whitney_identical(self):
        res = az.mann_whitney([1, 2, 3, 4], [1, 2, 3, 4])
        self.assertAlmostEqual(res["p"], 1.0)


class ParsingTests(unittest.TestCase):
    def test_code_extraction(self):
        self.assertEqual(az.extract_code("[SUS3] Tôi thấy dễ dùng"), "SUS3")
        self.assertEqual(az.extract_code("[G] Mức hữu ích [[G2] Xếp TKB]"), "G2")
        self.assertEqual(az.extract_code("Dấu thời gian"), "TIMESTAMP")
        self.assertEqual(az.extract_code("C1"), "C1")
        self.assertIsNone(az.extract_code("Địa chỉ email"))

    def test_needs_survey_multiselect_and_aggregated_feedback(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            csv = _write(tmp / "needs.csv",
                         "Dấu thời gian,Địa chỉ email,[A1] Khóa,[B1_M] Cách xếp TKB,[C1] Khó phát hiện trùng\n"
                         '2026/01/01,a@x.vn,K49,"Excel hoặc Google Sheets, Giấy bút",4\n'
                         "2026/01/02,,K50,Giấy bút,5\n"
                         "2026/01/03,,K49,,2\n")
            fb = tmp / "stats.json"
            fb.write_text(json.dumps({"total": 3, "by_page": {"/timetable": {"count": 2, "avg_rating": 4.5},
                                                              "/": 1},
                                      "rating_distribution": {"4": 1, "5": 2}}), encoding="utf-8")
            out = tmp / "out"
            code = az.main(["V0=" + str(csv), "--feedback-json", str(fb), "--out", str(out), "--no-charts"])
            self.assertEqual(code, 0)
            summary = json.loads((out / "summary.json").read_text(encoding="utf-8"))
            cat = pd.DataFrame(summary["categorical"])
            b1 = cat[cat["Mã"] == "B1_M"].set_index("Lựa chọn")["Số lượt"].to_dict()
            self.assertEqual(b1, {"Giấy bút": 2, "Excel hoặc Google Sheets": 1})
            num = pd.DataFrame(summary["numeric"])
            self.assertAlmostEqual(num.loc[num["Mã"] == "C1", "TB"].iloc[0], 11 / 3)
            self.assertAlmostEqual(summary["feedback"]["avg_rating"], 14 / 3)
            md = (out / "summary.md").read_text(encoding="utf-8")
            self.assertNotIn("a@x.vn", md)

    def test_sample_end_to_end(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            resp, tasks, fb = az.make_sample(tmp)
            code = az.main([str(resp), "--tasks", str(tasks), "--feedback-json", str(fb),
                            "--out", str(tmp / "out")])
            self.assertEqual(code, 0)
            summary = json.loads((tmp / "out" / "summary.json").read_text(encoding="utf-8"))
            self.assertTrue(summary["synthetic_input"])
            self.assertEqual([r["Vòng"] for r in summary["sus"]], ["V1", "V2"])
            self.assertTrue((tmp / "out" / "sus_by_round.png").exists())


if __name__ == "__main__":
    unittest.main()

"""Dựng lại hàng đợi truy vấn còn lại của lần quét DKHP từ file kết quả một phần (KHÔNG gọi server).

Dùng khi lần quét bị dừng và trạng thái trong trình duyệt đã mất:
    python scripts/dkhp_replay_queue.py            # đọc data/dkhp_classes_partial.json
Kết quả: data/dkhp_resume_state.json  {done, queue, skipped_no_known_match, known_codes}
  - queue: các chuỗi con còn phải truy vấn (đã lọc: chỉ giữ chuỗi nằm trong ít nhất một mã học phần đã biết).

Thuật toán gốc (xem docs/gemini/fetch_all_dkhp_TASK.md): API tìm theo mã học phần (ReqParam2="0"),
khớp chuỗi con, tối đa 100 dòng/truy vấn -> quét mọi bigram A-Z0-9, truy vấn nào đủ 100 dòng thì
mở rộng bằng cách ghép thêm 1 ký tự ở đầu/cuối.
"""
import json
import sys
from collections import deque
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[1]
src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "raw" / "dkhp" / "dkhp_classes_partial.json"
d = json.loads(src.read_text(encoding="utf-8"))
AL = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
trunc = set(d["truncated_queries"])

queue = deque(a + b for a in AL for b in AL)
done: set[str] = set()
steps = 0
while steps < d["queries"] and queue:
    q = queue.popleft()
    if q in done:
        continue
    done.add(q)
    steps += 1
    if q in trunc:
        for c in AL:
            if q + c not in done:
                queue.append(q + c)
            if c + q not in done:
                queue.append(c + q)

remaining, seen = [], set()
for q in queue:
    if q not in done and q not in seen:
        seen.add(q)
        remaining.append(q)

codes = {str(x.get("CurriculumID", "")).upper() for x in d["items"] if x.get("CurriculumID")}
blob = "\n".join(sorted(codes))
keep = [q for q in remaining if q in blob]
print(f"đã làm: {len(done)} | còn lại (duy nhất): {len(remaining)} | giữ lại sau lọc: {len(keep)} | mã môn đã biết: {len(codes)}")

dst = ROOT / "data" / "raw" / "dkhp" / "dkhp_resume_state.json"
dst.write_text(json.dumps({"done": sorted(done), "queue": keep,
                           "skipped_no_known_match": len(remaining) - len(keep),
                           "known_codes": sorted(codes)}, ensure_ascii=False), encoding="utf-8")
print("đã lưu", dst)

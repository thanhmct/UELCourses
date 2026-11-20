cd /workspace/api
run() { echo ">>> $*"; python -m app.cli "$@" 2>&1 | tail -c 600; echo; }
run import-uis-classes ../data/raw/UIS-DanhSachThongTinLHPDangKy_2025-2026_HK01.xlsx
run import-ta-plan ../data/raw/Thong_tin_mon_hoc_TA_2026_2027.xlsx --year 2026-2027
run import-classes ../data/raw/dkhp/dkhp_classes_partial.json
run import-ctdt ../data/raw/ctdt_programs.json
run import-equivalents ../data/raw/equivalents_portal.json
run import-regulations
run import-outlines
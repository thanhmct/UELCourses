"""Build browser preview catalog from the local portal CTĐT export."""
import json
import re
from collections import defaultdict
from pathlib import Path

source = Path('data/raw/ctdt_programs.json')
target = Path('web/src/data/programs_catalog.json')
program_ids_target = Path('web/src/data/program_ids.json')
programs = json.loads(source.read_text(encoding='utf-8'))
catalog = json.loads(target.read_text(encoding='utf-8'))

def codes(value):
    return list(dict.fromkeys(re.findall(r'\b[A-Z]{1,5}\d{1,5}[A-Z0-9]*\b', str(value or '').upper())))

for pid, rows in programs.items():
    if pid in catalog['details'] or not rows:
        continue
    summary = next((s for s in catalog['summaries'] if s['program_id'] == pid), None)
    if summary is None:
        continue
    groups = defaultdict(list)
    for row in rows:
        code = str(row.get('MaHP') or '').strip()
        if not code:
            continue
        term_text = str(row.get('HocKyHienThi') or row.get('HocKy') or '')
        match = re.search(r'HK\s*0*(\d+)', term_text, re.I)
        group = str(row.get('TenKhoiKienThuc') or 'Chưa phân khối').strip()
        groups[(group, str(row.get('TenKhoaKienThucCha') or '').strip())].append({
            'code': code,
            'name': str(row.get('TenHP') or code),
            'credits': row.get('STC') or 0,
            'required': str(row.get('BatBuoc') or '').strip().casefold() == 'bắt buộc',
            'suggested_term': int(match.group(1)) if match else None,
            'prereq': codes(row.get('HPTienQuyet')),
            'previous': codes(row.get('HPHocTruoc')),
            'coreq': codes(row.get('HPSongHanh')),
            'equivalents': [],
        })
    catalog['details'][pid] = {
        'program': summary,
        'blocks': [{'name': name, 'parent': parent or None, 'modules': modules} for (name, parent), modules in groups.items()],
    }

target.write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
program_ids = sorted({str(summary['program_id']) for summary in catalog['summaries']})
program_ids_target.write_text(
    json.dumps(program_ids, ensure_ascii=False, indent=2) + '\n',
    encoding='utf-8',
)
print(f"detail programs: {len(catalog['details'])}")

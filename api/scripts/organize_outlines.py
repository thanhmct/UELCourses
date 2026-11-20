"""Extract originals and build a searchable SQLite catalog, including Excel hyperlinks."""
import hashlib
import json
import sqlite3
import sys
import zipfile
from pathlib import Path

import openpyxl

ROOT = Path('data/outlines_2025')

def main(source):
    original = ROOT / 'originals'
    original.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source) as archive:
        for member in archive.infolist():
            if member.filename.lower().endswith('.xlsx'):
                (original / Path(member.filename).name).write_bytes(archive.read(member))
    records = [json.loads(line) for line in Path('data/processed/ctdt_outlines_2025/rows.jsonl').open(encoding='utf-8')]
    db = sqlite3.connect(ROOT / 'catalog.sqlite')
    db.executescript('''
        CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, program TEXT, sheet TEXT, category TEXT, code TEXT, name TEXT, term TEXT, credits REAL, required_raw TEXT, source_file TEXT, source_row INTEGER, payload TEXT);
        CREATE TABLE IF NOT EXISTS resources(id TEXT PRIMARY KEY, record_id TEXT, kind TEXT, label TEXT, url TEXT, source_column INTEGER);
        CREATE INDEX IF NOT EXISTS records_code ON records(code);
        CREATE INDEX IF NOT EXISTS records_program ON records(program, sheet);
        DELETE FROM records; DELETE FROM resources;
    ''')
    books = {}
    inventory = {}
    for record in records:
        src, n = record['source'], record['normalized']
        filename, sheet, row = src['file'], src['sheet'], src['row']
        if filename not in books:
            books[filename] = openpyxl.load_workbook(original / filename, data_only=False)
        ws = books[filename][sheet]
        category = 'curriculum_source' if ('gốc' in sheet.lower() or 'dlg' in sheet.lower()) else 'track_or_review'
        rid = hashlib.sha256(f'{filename}|{sheet}|{row}'.encode()).hexdigest()[:24]
        db.execute('INSERT INTO records VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', (rid,n['program_label'],sheet,category,n['course_code'],n['course_name'],n['term'],n['credits'],n['required_raw'],filename,row,json.dumps(record,ensure_ascii=False)))
        for cell in ws[row]:
            header = ws.cell(src['header_row'],cell.column).value
            header = str(header or '')
            if 'đề cương' not in header.lower():
                continue
            label = str(cell.value or '').strip()
            url = cell.hyperlink.target if cell.hyperlink else None
            if not url and label.startswith(('https://','http://')):
                url = label
            if not label and not url:
                continue
            resource_id = f'{rid}-{cell.column}'
            db.execute('INSERT INTO resources VALUES(?,?,?,?,?,?)', (resource_id,rid,header,label,url,cell.column))
        inventory.setdefault(filename,{}).setdefault(sheet,0)
        inventory[filename][sheet] += 1
    for book in books.values():
        book.close()
    db.commit()
    resource_rows = [dict(zip(['id','record_id','kind','label','url','source_column'],r)) for r in db.execute('SELECT * FROM resources')]
    (ROOT / 'resources.json').write_text(json.dumps(resource_rows,ensure_ascii=False,indent=2),encoding='utf-8')
    (ROOT / 'inventory.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'records':len(records),'resources':len(resource_rows),'with_url':sum(bool(r['url']) for r in resource_rows)}))
    db.close()

if __name__ == '__main__':
    main(sys.argv[1])

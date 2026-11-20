"""Search the unified catalog: --code BIM3049 or --program 'Hệ thống'."""
import argparse
import json
import sqlite3
import sys

sys.stdout.reconfigure(encoding='utf-8')

parser = argparse.ArgumentParser()
parser.add_argument('--code')
parser.add_argument('--program')
parser.add_argument('--sheet')
args = parser.parse_args()
db = sqlite3.connect('data/outlines_2025/catalog.sqlite')
db.row_factory = sqlite3.Row
conditions, values = [], []
for column, value in [('code',args.code),('program',args.program),('sheet',args.sheet)]:
    if value:
        conditions.append(column + (' = ?' if column == 'code' else ' LIKE ?'))
        values.append(value.upper() if column == 'code' else '%' + value + '%')
query = 'SELECT id, program, sheet, category, code, name, term, credits, required_raw, source_file, source_row FROM records'
if conditions:
    query += ' WHERE ' + ' AND '.join(conditions)
print(json.dumps([dict(row) for row in db.execute(query,values)],ensure_ascii=False,indent=2))
db.close()

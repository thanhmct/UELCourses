"""Recheck failed links except 401, attempting PDF export for Google Docs."""
import concurrent.futures
import hashlib
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path('data/outlines_2025')
report = json.loads((ROOT/'download_report.json').read_text(encoding='utf-8'))
urls = [u for u,v in report['urls'].items() if v['status']=='failed' and '401' not in v.get('reason','')]

def check(url):
    match = re.search(r'/document/(?:u/\d+/)?d/([^/]+)',url)
    fid = re.search(r'/file/d/([^/]+)',url)
    target = f'https://docs.google.com/document/d/{match.group(1)}/export?format=pdf' if match else f'https://drive.google.com/uc?export=download&id={fid.group(1)}' if fid else url
    result = {'url':url,'checked_url':target}
    try:
        with urllib.request.urlopen(urllib.request.Request(target,headers={'User-Agent':'UELCourse-outline-downloader/1.0'}),timeout=40) as response:
            body = response.read()
            result['content_type'] = response.headers.get('Content-Type','')
            if body.startswith(b'%PDF-'):
                path = ROOT/'pdfs'/(hashlib.sha256(url.encode()).hexdigest()[:24]+'.pdf')
                path.write_bytes(body)
                result.update(status='downloaded',file=str(path))
            else:
                text = body[:200000].decode('utf-8',errors='replace')
                title = re.search(r'<title[^>]*>(.*?)</title>',text,re.S|re.I)
                result.update(status='not_pdf',title=title.group(1).strip() if title else '',final_url=response.url)
    except Exception as error:
        result.update(status='failed',reason=str(error))
    return result

results=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    for result in pool.map(check,urls):
        results.append(result)
        (ROOT/'recheck_report.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
        print(f'{len(results)}/{len(urls)} {result["status"]}',flush=True)

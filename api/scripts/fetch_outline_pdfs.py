"""Download accessible PDF outline links. Never treat HTML login pages as PDFs.

python api/scripts/fetch_outline_pdfs.py [--limit 10]
"""
import argparse
import hashlib
import json
import re
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path('data/outlines_2025')

def download(url, folder):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ('http','https'):
        raise ValueError('unsupported URL scheme')
    if parsed.hostname == 'drive.google.com':
        match = re.search(r'/file/d/([^/]+)',parsed.path)
        file_id = match.group(1) if match else urllib.parse.parse_qs(parsed.query).get('id',[None])[0]
        if file_id:
            url = 'https://drive.google.com/uc?export=download&id=' + urllib.parse.quote(file_id)
    dest = folder / (hashlib.sha256(url.encode()).hexdigest()[:24] + '.pdf')
    if dest.exists() and dest.read_bytes()[:5] == b'%PDF-':
        return {'status':'cached','file':str(dest)}
    request = urllib.request.Request(url,headers={'User-Agent':'UELCourse-outline-downloader/1.0'})
    temp = dest.with_suffix('.part')
    try:
        with urllib.request.urlopen(request,timeout=45) as response:
            first = response.read(1024)
            if not first.startswith(b'%PDF-'):
                raise ValueError('response is not PDF (may require login, confirmation, or be DOCX)')
            with temp.open('wb') as out:
                out.write(first)
                while chunk := response.read(65536):
                    out.write(chunk)
        temp.replace(dest)
    finally:
        temp.unlink(missing_ok=True)
    return {'status':'downloaded','file':str(dest)}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit',type=int,default=0,help='0 downloads all unique URLs')
    parser.add_argument('--delay',type=float,default=0.5)
    parser.add_argument('--workers',type=int,default=6)
    args = parser.parse_args()
    folder = ROOT / 'pdfs'
    folder.mkdir(parents=True,exist_ok=True)
    resources = json.loads((ROOT/'resources.json').read_text(encoding='utf-8'))
    urls = list(dict.fromkeys(r['url'] for r in resources if r['url']))
    if args.limit:
        urls = urls[:args.limit]
    results = {}
    report = ROOT/'download_report.json'
    def fetch_one(url):
        try:
            return download(url,folder)
        except Exception as error:
            return {'status':'failed','reason':str(error)}
        finally:
            time.sleep(max(0,args.delay))
    with ThreadPoolExecutor(max_workers=max(1,min(args.workers,12))) as pool:
        pending = {pool.submit(fetch_one,url):url for url in urls}
        for index,future in enumerate(as_completed(pending),1):
            url = pending[future]
            results[url] = future.result()
            print(f'{index}/{len(urls)} {results[url]["status"]}',flush=True)
            report.write_text(json.dumps({'urls':results,'resources_without_url':[r for r in resources if not r['url']]},ensure_ascii=False,indent=2),encoding='utf-8')
    if not urls:
        report.write_text(json.dumps({'urls':{},'resources_without_url':resources},ensure_ascii=False,indent=2),encoding='utf-8')

if __name__ == '__main__':
    main()

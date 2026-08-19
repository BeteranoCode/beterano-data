"""Volcado bruto de todas las paginas de automobile-museums.com via WP REST API."""
import json, os, sys, time
import requests

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw_pages.json")
BASE = "https://automobile-museums.com/wp-json/wp/v2/pages"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
FIELDS = "id,slug,link,title,content,modified,yoast_head_json"

session = requests.Session()
session.headers.update({"User-Agent": UA, "Accept": "application/json"})

pages = []
page = 1
while True:
    url = f"{BASE}?per_page=100&page={page}&_fields={FIELDS}"
    for attempt in range(4):
        try:
            r = session.get(url, timeout=90)
            break
        except Exception as exc:  # noqa: BLE001
            print(f"  retry {attempt+1} page {page}: {exc}", flush=True)
            time.sleep(3)
    else:
        sys.exit(f"fallo definitivo en page {page}")

    if r.status_code == 400:  # fuera de rango -> fin
        break
    r.raise_for_status()
    batch = r.json()
    if not batch:
        break
    pages.extend(batch)
    total = r.headers.get("X-WP-TotalPages")
    print(f"page {page}/{total} -> {len(batch)} items (acum {len(pages)})", flush=True)
    if total and page >= int(total):
        break
    page += 1

with open(OUT, "w", encoding="utf-8") as fh:
    json.dump(pages, fh, ensure_ascii=False)
print(f"OK {len(pages)} paginas -> {OUT}")

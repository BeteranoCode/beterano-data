"""Empareja FR<->EN leyendo los <link rel=alternate hreflang> de cada ficha (Polylang).

Es la fuente autoritativa: no depende de heuristicas de telefono/direccion.
"""
import json, os, re, time
import requests
from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw_pages.json")
OUT = os.path.join(HERE, "hreflang.json")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

HREF_RE = re.compile(r'<link rel="alternate" href="([^"]+)" hreflang="([a-zA-Z-]+)"', re.I)

raw = json.load(open(RAW, encoding="utf-8"))
museum_pages = [
    p for p in raw
    if "jetpack-address" in ((p.get("content") or {}).get("rendered") or "")
]
print(f"fichas de museo: {len(museum_pages)}")

cache = {}
if os.path.exists(OUT):
    cache = json.load(open(OUT, encoding="utf-8"))
    print(f"cache previa: {len(cache)}")

session = requests.Session()
session.headers.update({"User-Agent": UA})

for i, p in enumerate(museum_pages, 1):
    pid = str(p["id"])
    if pid in cache:
        continue
    url = p["link"]
    alts = {}
    for attempt in range(3):
        try:
            r = session.get(url, timeout=45)
            head = r.text[:60000]
            for href, lang in HREF_RE.findall(head):
                alts[lang.lower()] = href
            break
        except Exception as exc:  # noqa: BLE001
            print(f"  retry {attempt+1} {url}: {exc}", flush=True)
            time.sleep(2)
    cache[pid] = {"link": url, "alts": alts}
    if i % 20 == 0:
        print(f"{i}/{len(museum_pages)}", flush=True)
        json.dump(cache, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)

json.dump(cache, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
ok = sum(1 for v in cache.values() if len(v["alts"]) >= 2)
print(f"OK -> {OUT} | con alternates: {ok}/{len(cache)}")

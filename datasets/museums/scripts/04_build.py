"""Construye el dataset de museos: parsea las fichas y las agrupa por hreflang (FR<->EN)."""
import importlib.util, json, os, re
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("parser", os.path.join(HERE, "02_parse.py"))
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)

RAW = os.path.join(HERE, "raw_pages.json")
HREF = os.path.join(HERE, "hreflang.json")
OUT = os.path.join(HERE, "museums.json")


def slugify(text):
    s = P.norm(text)
    s = re.sub(r"&#?\w+;", " ", s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:80]


def unescape_entities(text):
    import html
    return html.unescape(text or "")


def main():
    raw = json.load(open(RAW, encoding="utf-8"))
    href = json.load(open(HREF, encoding="utf-8"))

    parsed = []
    for pg in raw:
        rec = P.parse_page(pg)
        if rec:
            rec["_alts"] = (href.get(str(pg["id"])) or {}).get("alts") or {}
            parsed.append(rec)

    groups = defaultdict(list)
    for rec in parsed:
        alts = rec["_alts"]
        key = alts.get("fr") or alts.get("en") or rec["sourceUrl"]
        groups[key].append(rec)

    museums = []
    for key, recs in groups.items():
        m = P.merge(recs)
        m.pop("_unused", None)
        for f in ("name", "nameFr", "nameEn"):
            m[f] = unescape_entities(m[f])
        m["summaryEn"] = unescape_entities(m["summaryEn"])
        m["summaryFr"] = unescape_entities(m["summaryFr"])
        for key_sections in ("sectionsEn", "sectionsFr"):
            for s in m[key_sections]:
                s["heading"] = unescape_entities(s["heading"])
                s["text"] = unescape_entities(s["text"])
        m["id"] = slugify(m["nameEn"] or m["name"])
        m["groupKey"] = key
        museums.append(m)

    # ids unicos
    seen = Counter()
    for m in museums:
        seen[m["id"]] += 1
        if seen[m["id"]] > 1:
            m["id"] = f"{m['id']}-{seen[m['id']]}"

    museums.sort(key=lambda m: (m["address"]["country"] or "zz", m["name"]))
    json.dump(museums, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(f"fichas: {len(parsed)} | museos: {len(museums)}")
    print("fichas por museo:", dict(sorted(Counter(len(g) for g in groups.values()).items())))
    print(f"\npaises: {len({m['address']['countryCode'] for m in museums if m['address']['countryCode']})}")
    for c, n in Counter(m["address"]["country"] or "??" for m in museums).most_common():
        print(f"  {n:3d}  {c}")

    total = len(museums)
    print("\ncobertura:")
    for label, test in [
        ("web", lambda m: bool(m["website"])),
        ("telefono", lambda m: bool(m["phone"])),
        ("logo", lambda m: bool(m["logo"])),
        ("fotos", lambda m: bool(m["photos"])),
        ("horarios", lambda m: bool(m["opening"]["rows"] or m["opening"]["note"])),
        ("tarifas", lambda m: bool(m["rates"]["rows"] or m["rates"]["note"])),
        ("desc EN", lambda m: bool(m["summaryEn"])),
        ("desc FR", lambda m: bool(m["summaryFr"])),
        ("calle", lambda m: bool(m["address"]["line1"])),
        ("CP", lambda m: bool(m["address"]["postal"])),
        ("ISO2", lambda m: bool(m["address"]["countryCode"])),
        ("FR+EN", lambda m: len(m["langs"]) == 2),
    ]:
        n = sum(1 for m in museums if test(m))
        print(f"  {label:10s} {n:3d}/{total} ({round(100*n/total)}%)")

    bad = [m for m in museums if not m["address"]["countryCode"]]
    if bad:
        print("\nsin pais:", [(m["name"], m["address"]["countryRaw"], m["address"]["city"]) for m in bad])
    print(f"-> {OUT}")


if __name__ == "__main__":
    main()

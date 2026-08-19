"""Parseo de las fichas de museo a partir del volcado bruto de automobile-museums.com.

Cada museo tiene 2 fichas (FR y EN). Se parsea cada ficha y luego se emparejan
por web / telefono / (CP+ciudad) usando union-find.
"""
import json, os, re, unicodedata
from collections import Counter, defaultdict
from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw_pages.json")
OUT = os.path.join(HERE, "parsed.json")

SITE_HOST = "automobile-museums.com"
NAV_MARKERS = ("decouvrez plus de musees", "discover more automobile museums", "discover more car museums")

# nombre de pais tal cual aparece en la ficha -> (nombre canonico EN, ISO2)
COUNTRY_MAP = {
    "france": ("France", "FR"), "monaco": ("Monaco", "MC"),
    "usa": ("United States", "US"), "united states": ("United States", "US"),
    "etats-unis": ("United States", "US"), "etats unis": ("United States", "US"),
    "united states of america": ("United States", "US"), "us": ("United States", "US"),
    "italy": ("Italy", "IT"), "italie": ("Italy", "IT"), "italia": ("Italy", "IT"),
    "modena": ("Italy", "IT"), "modene": ("Italy", "IT"),
    "germany": ("Germany", "DE"), "allemagne": ("Germany", "DE"), "deutschland": ("Germany", "DE"),
    "great britain": ("United Kingdom", "GB"), "grande-bretagne": ("United Kingdom", "GB"),
    "grande bretagne": ("United Kingdom", "GB"), "united kingdom": ("United Kingdom", "GB"),
    "uk": ("United Kingdom", "GB"), "england": ("United Kingdom", "GB"), "angleterre": ("United Kingdom", "GB"),
    "spain": ("Spain", "ES"), "espagne": ("Spain", "ES"), "espana": ("Spain", "ES"),
    "belgium": ("Belgium", "BE"), "belgique": ("Belgium", "BE"), "belgie": ("Belgium", "BE"),
    "switzerland": ("Switzerland", "CH"), "suisse": ("Switzerland", "CH"),
    "sweden": ("Sweden", "SE"), "suede": ("Sweden", "SE"),
    "austria": ("Austria", "AT"), "autriche": ("Austria", "AT"),
    "czech republic": ("Czechia", "CZ"), "republique tcheque": ("Czechia", "CZ"), "czechia": ("Czechia", "CZ"),
    "estonia": ("Estonia", "EE"), "estonie": ("Estonia", "EE"),
    "greece": ("Greece", "GR"), "grece": ("Greece", "GR"),
    "holland": ("Netherlands", "NL"), "netherlands": ("Netherlands", "NL"),
    "pays-bas": ("Netherlands", "NL"), "pays bas": ("Netherlands", "NL"), "nederland": ("Netherlands", "NL"),
    "malta": ("Malta", "MT"), "malte": ("Malta", "MT"),
    "morocco": ("Morocco", "MA"), "maroc": ("Morocco", "MA"),
    "portugal": ("Portugal", "PT"),
    "luxembourg": ("Luxembourg", "LU"),
    "denmark": ("Denmark", "DK"), "danemark": ("Denmark", "DK"),
    "norway": ("Norway", "NO"), "norvege": ("Norway", "NO"),
    "finland": ("Finland", "FI"), "finlande": ("Finland", "FI"),
    "poland": ("Poland", "PL"), "pologne": ("Poland", "PL"),
    "ireland": ("Ireland", "IE"), "irlande": ("Ireland", "IE"),
    "canada": ("Canada", "CA"),
    "japan": ("Japan", "JP"), "japon": ("Japan", "JP"),
    "australia": ("Australia", "AU"), "australie": ("Australia", "AU"),
    "south africa": ("South Africa", "ZA"), "afrique du sud": ("South Africa", "ZA"),
    "turkey": ("Turkiye", "TR"), "turquie": ("Turkiye", "TR"),
    "hungary": ("Hungary", "HU"), "hongrie": ("Hungary", "HU"),
    "slovenia": ("Slovenia", "SI"), "slovenie": ("Slovenia", "SI"),
    "croatia": ("Croatia", "HR"), "croatie": ("Croatia", "HR"),
    "romania": ("Romania", "RO"), "roumanie": ("Romania", "RO"),
}

CURRENCY_RE = re.compile(r"[€$£]|\beuros?\b|\bgratuit\b|\bfree\b|\badulte?s?\b|\badults?\b|\btarif", re.I)
DAY_RE = re.compile(
    r"lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday"
    r"|tous les jours|every ?day|daily|janvier|fevrier|mars|avril|juin|juillet|aout|septembre|octobre|novembre|decembre"
    r"|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\s*h|\d{1,2}:\d{2}",
    re.I,
)


def strip_accents(t):
    return "".join(c for c in unicodedata.normalize("NFD", t or "") if unicodedata.category(c) != "Mn")


def norm(t):
    return re.sub(r"\s+", " ", strip_accents(t)).strip().lower()


def clean(t):
    return re.sub(r"[\s ]+", " ", (t or "").replace("’", "'")).strip()


def full_size(url):
    return re.sub(r"-\d{2,4}x\d{2,4}(?=\.[a-zA-Z]{3,4}$)", "", url or "")


def heading_kind(text):
    n = norm(text)
    if "pratique" in n or "practical" in n:
        return "practical"
    if n.startswith("ouvert") or n.startswith("opening") or n.startswith("open") or "horaire" in n or "hours" in n:
        return "opening"
    if "tarif" in n or "rate" in n or "price" in n or "prix" in n or "admission" in n:
        return "rates"
    # "a cote des voitures" contiene "voiture": el chequeo de besides va primero
    if "a cote" in n or "besides" in n or "next to" in n or "en dehors" in n:
        return "besides"
    if "voiture" in n or n.startswith("cars") or "les autos" in n:
        return "cars"
    return "other"


def table_rows(table):
    rows = []
    for tr in table.find_all("tr"):
        cells = [clean(td.get_text(" ")) for td in tr.find_all(["td", "th"])]
        cells = [c for c in cells if c]
        if cells:
            rows.append(cells)
    return rows


def parse_page(page):
    html = (page.get("content") or {}).get("rendered") or ""
    if "jetpack-address" not in html:
        return None

    soup = BeautifulSoup(html, "html.parser")
    link = page.get("link") or ""
    lang = "en" if "/en/" in link else "fr"

    addr_el = soup.select_one(".wp-block-jetpack-address")

    def addr_part(sel):
        el = addr_el.select_one(sel) if addr_el else None
        return clean(el.get_text(" ")) if el else ""

    raw_country = addr_part(".jetpack-address__country")
    canon, iso2 = COUNTRY_MAP.get(norm(raw_country), ("", ""))
    address = {
        "line1": addr_part(".jetpack-address__address1"),
        "line2": addr_part(".jetpack-address__address2"),
        "city": addr_part(".jetpack-address__city"),
        "region": addr_part(".jetpack-address__region"),
        "postal": addr_part(".jetpack-address__postal"),
        "countryRaw": raw_country,
        "country": canon,
        "countryCode": iso2,
    }

    # El href tel: que genera el sitio concatena el "(0)" nacional y sale mal
    # ("+33 (0)6 07..." -> "+330607..."). Se normaliza desde el texto visible.
    phone = phone_display = ""
    tel = soup.select_one('a[href^="tel:"]')
    if tel:
        phone_display = clean(tel.get_text(" "))
        source = phone_display or tel.get("href", "")[4:]
        phone = re.sub(r"[^\d+]", "", re.sub(r"\(\s*0\s*\)", "", source))
        if phone and not phone.startswith("+"):
            phone = re.sub(r"[^\d+]", "", tel.get("href", "")[4:]) or phone

    website = ""
    candidates = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href.startswith("http") or SITE_HOST in href or "google.com/maps" in href:
            continue
        candidates.append((a, href))
    for a, href in candidates:
        parent = a.find_parent(["p", "div", "figure", "li"])
        ptext = norm(parent.get_text(" ")) if parent else ""
        if "site web" in ptext or "website" in ptext or "site internet" in ptext or "web site" in ptext:
            website = href
            break
    if not website and candidates:
        website = candidates[0][1]

    # recorrido en orden de documento: headings, parrafos y tablas
    intro, sections, opening_rows, rates_rows = [], [], [], []
    opening_note = rates_note = ""
    current = None
    stop = False
    for el in soup.find_all(["h1", "h2", "h3", "h4", "p", "table"]):
        if stop:
            break
        if el.name == "table":
            rows = table_rows(el)
            if not rows:
                continue
            flat = " | ".join(" ".join(r) for r in rows)
            kind = current["kind"] if current else "other"
            if CURRENCY_RE.search(flat) and kind != "opening":
                rates_rows.extend(rows)
            elif DAY_RE.search(flat) or kind == "opening":
                opening_rows.extend(rows)
            elif kind == "rates":
                rates_rows.extend(rows)
            else:
                opening_rows.extend(rows)
            continue

        text = clean(el.get_text(" "))
        if not text:
            continue
        n = norm(text)
        if any(m in n for m in NAV_MARKERS):
            stop = True
            continue
        if el.name in ("h1", "h2", "h3", "h4"):
            current = {"heading": text, "kind": heading_kind(text), "text": []}
            sections.append(current)
            if current["kind"] == "opening" and not opening_note:
                opening_note = text
            if current["kind"] == "rates" and not rates_note:
                rates_note = text
            continue
        if n.startswith("email") or n.startswith("tel :") or n.startswith("tel:") or n.startswith("phone"):
            continue
        if n.startswith("site web") or n.startswith("website") or n.startswith("site internet"):
            continue
        if current is None:
            intro.append(text)
        else:
            if current["kind"] == "opening" and not opening_note:
                opening_note = text
            elif current["kind"] == "rates" and not rates_note:
                rates_note = text
            elif current["kind"] == "practical" and (n.startswith("ouvert") or n.startswith("open")):
                opening_note = opening_note or text
            current["text"].append(text)

    for s in sections:
        s["text"] = " ".join(s["text"]).strip()
    text_sections = [
        {"heading": s["heading"], "kind": s["kind"], "text": s["text"]}
        for s in sections
        if s["text"] and s["kind"] in ("cars", "besides", "other")
    ]

    imgs = []
    for img in soup.find_all("img"):
        src = img.get("src") or ""
        if src.startswith("http") and src not in imgs:
            imgs.append(src)
    yoast = page.get("yoast_head_json") or {}
    og = [i.get("url") for i in (yoast.get("og_image") or []) if i.get("url")]
    logo = (og[0].replace("http://", "https://") if og else (imgs[0] if imgs else ""))
    photos = [full_size(u) for u in imgs if full_size(u) != full_size(logo)]

    return {
        "sourceId": page.get("id"),
        "sourceUrl": link,
        "slug": page.get("slug"),
        "lang": lang,
        "name": clean((page.get("title") or {}).get("rendered", "")),
        "summary": " ".join(intro).strip(),
        "sections": text_sections,
        "address": address,
        "phone": phone,
        "phoneDisplay": phone_display,
        "email": None,  # ofuscado por CleanTalk, no extraible
        "website": website,
        "opening": {"note": opening_note, "rows": opening_rows},
        "rates": {"note": rates_note, "rows": rates_rows},
        "logo": logo,
        "photos": photos,
        "modified": page.get("modified"),
    }


# ---------- emparejado FR/EN por union-find sobre varias claves ----------
def keys_for(rec):
    out = []
    site = re.sub(r"^https?://(www\.)?", "", (rec.get("website") or "").lower()).rstrip("/")
    site = site.split("?")[0]
    if site and len(site) > 4:
        out.append(("web", site.split("/")[0] + "/" + "/".join(site.split("/")[1:2])))
    digits = re.sub(r"\D", "", rec.get("phone") or "")
    if len(digits) >= 8:
        out.append(("tel", digits[-9:]))
    a = rec["address"]
    if a["postal"] and a["city"]:
        out.append(("addr", norm(a["postal"]), norm(a["city"])))
    elif a["city"] and a["line1"]:
        out.append(("addr2", norm(a["city"]), norm(a["line1"])))
    return out


class UF:
    def __init__(self):
        self.p = {}

    def find(self, x):
        self.p.setdefault(x, x)
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[rb] = ra


def merge(recs):
    en = next((r for r in recs if r["lang"] == "en"), None)
    fr = next((r for r in recs if r["lang"] == "fr"), None)
    primary = en or fr
    other = fr if en else None

    def pick(field):
        v = primary.get(field)
        if v:
            return v
        for r in recs:
            if r.get(field):
                return r[field]
        return v

    address = dict(primary["address"])
    for f in ("line1", "city", "postal", "country", "countryCode", "region"):
        if not address.get(f):
            for r in recs:
                if r["address"].get(f):
                    address[f] = r["address"][f]
                    break

    opening = primary["opening"] if primary["opening"]["rows"] else next(
        (r["opening"] for r in recs if r["opening"]["rows"]), primary["opening"])
    rates = primary["rates"] if primary["rates"]["rows"] else next(
        (r["rates"] for r in recs if r["rates"]["rows"]), primary["rates"])

    return {
        "name": (en or primary)["name"],
        "nameFr": fr["name"] if fr else "",
        "nameEn": en["name"] if en else "",
        "address": address,
        "phone": pick("phone"),
        "phoneDisplay": pick("phoneDisplay"),
        "website": pick("website"),
        "email": None,
        "logo": pick("logo"),
        "photos": pick("photos") or [],
        "opening": opening,
        "rates": rates,
        "summaryEn": en["summary"] if en else "",
        "summaryFr": fr["summary"] if fr else "",
        "sectionsEn": en["sections"] if en else [],
        "sectionsFr": fr["sections"] if fr else [],
        "sourceUrlEn": en["sourceUrl"] if en else "",
        "sourceUrlFr": fr["sourceUrl"] if fr else "",
        "slug": (en or primary)["slug"],
        "sourceIds": sorted(r["sourceId"] for r in recs),
        "modified": max((r["modified"] or "") for r in recs),
        "langs": sorted({r["lang"] for r in recs}),
        "_unused": bool(other),
    }


def main():
    raw = json.load(open(RAW, encoding="utf-8"))
    parsed = [p for p in (parse_page(pg) for pg in raw) if p]
    print(f"paginas totales: {len(raw)} | fichas de museo: {len(parsed)}")

    uf = UF()
    key_owner = {}
    for i, rec in enumerate(parsed):
        uf.find(i)
        for k in keys_for(rec):
            if k in key_owner:
                uf.union(key_owner[k], i)
            else:
                key_owner[k] = i

    groups = defaultdict(list)
    for i, rec in enumerate(parsed):
        groups[uf.find(i)].append(rec)

    museums = [merge(g) for g in groups.values()]
    for m in museums:
        m.pop("_unused", None)
    museums.sort(key=lambda m: (m["address"]["country"] or "zz", m["name"]))
    json.dump(museums, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(f"museos unicos tras emparejar FR/EN: {len(museums)}")
    sizes = Counter(len(g) for g in groups.values())
    print("tamano de grupo (fichas por museo):", dict(sorted(sizes.items())))

    print("\npor pais:")
    for country, n in Counter((m["address"]["country"] or f"?? {m['address']['countryRaw']}") for m in museums).most_common():
        print(f"  {n:3d}  {country}")

    unmapped = sorted({m["address"]["countryRaw"] for m in museums if not m["address"]["country"]})
    if unmapped:
        print("\nPAISES SIN MAPEAR:", unmapped)

    print("\ncobertura de campos:")
    total = len(museums)
    checks = [
        ("web", lambda m: bool(m["website"])),
        ("telefono", lambda m: bool(m["phone"])),
        ("logo", lambda m: bool(m["logo"])),
        ("fotos", lambda m: bool(m["photos"])),
        ("horarios", lambda m: bool(m["opening"]["rows"] or m["opening"]["note"])),
        ("tarifas", lambda m: bool(m["rates"]["rows"] or m["rates"]["note"])),
        ("desc EN", lambda m: bool(m["summaryEn"])),
        ("desc FR", lambda m: bool(m["summaryFr"])),
        ("calle", lambda m: bool(m["address"]["line1"])),
        ("ciudad", lambda m: bool(m["address"]["city"])),
        ("CP", lambda m: bool(m["address"]["postal"])),
        ("pais ISO2", lambda m: bool(m["address"]["countryCode"])),
        ("FR+EN", lambda m: len(m["langs"]) == 2),
    ]
    for label, test in checks:
        n = sum(1 for m in museums if test(m))
        print(f"  {label:12s} {n:3d}/{total}  ({round(100*n/total)}%)")
    print(f"-> {OUT}")


if __name__ == "__main__":
    main()

"""Pasada 2b: ultimo intento con Overpass para los que siguen a nivel ciudad.

Regla de alta precision en vez de fuzzy puro: se piden los tourism=museum en
20 km del centro de la ciudad y se acepta el candidato si (a) comparte dominio
web con la ficha, (b) el nombre encaja bien, o (c) es el UNICO museo del radio
cuyo nombre menciona automocion. En un pueblo pequeno esa unicidad es una
senal mas fiable que cualquier umbral de similitud.
"""
import difflib, json, os, re, time, unicodedata
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
IO = os.path.join(HERE, "museums_geo.json")
CACHE = os.path.join(HERE, "overpass_cache.json")
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
UA = "BeteranoMapBot/1.0 (contacto: neznosc@gmail.com)"
RADIUS_M = 20000

AUTO_RE = re.compile(r"auto|voitur|motor|car\b|cars\b|vehicul|veicol|wagen|bil\b|coche", re.I)

session = requests.Session()
session.headers.update({"User-Agent": UA})
cache = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}


def na(t):
    t = unicodedata.normalize("NFD", t or "")
    t = "".join(c for c in t if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9 ]+", " ", t)


def overpass(lat, lng):
    key = f"{round(lat,4)},{round(lng,4)}"
    if key in cache and cache[key]:
        return cache[key]
    q = (
        f"[out:json][timeout:60];"
        f'(node["tourism"="museum"](around:{RADIUS_M},{lat},{lng});'
        f'way["tourism"="museum"](around:{RADIUS_M},{lat},{lng});'
        f'relation["tourism"="museum"](around:{RADIUS_M},{lat},{lng}););'
        f"out center tags;"
    )
    out = []
    for endpoint in OVERPASS:
        for attempt in range(3):
            try:
                r = session.post(endpoint, data={"data": q}, timeout=120)
                if r.status_code == 200:
                    for el in r.json().get("elements", []):
                        tags = el.get("tags") or {}
                        name = tags.get("name") or tags.get("name:en") or tags.get("name:fr") or ""
                        lt = el.get("lat") or (el.get("center") or {}).get("lat")
                        ln = el.get("lon") or (el.get("center") or {}).get("lon")
                        if not name or lt is None or ln is None:
                            continue
                        out.append({
                            "name": name,
                            "altNames": [v for k, v in tags.items() if k.startswith("name:")],
                            "lat": lt, "lng": ln, "osmType": el.get("type"), "osmId": el.get("id"),
                            "website": tags.get("website") or tags.get("contact:website") or "",
                        })
                    cache[key] = out
                    time.sleep(2)
                    return out
                if r.status_code in (429, 504):
                    time.sleep(20)
                    continue
                break
            except Exception as exc:  # noqa: BLE001
                print(f"    overpass {endpoint.split('/')[2]}: {exc}", flush=True)
                time.sleep(10)
    cache[key] = out
    return out


def domain(url):
    return re.sub(r"^https?://(www\.)?", "", (url or "").lower()).split("/")[0]


STOPWORDS = {
    "musee", "museum", "museo", "muzej", "muuseum", "museet", "automobile", "auto", "car",
    "cars", "motor", "de", "du", "des", "la", "le", "les", "of", "the", "and", "et", "collection",
}


def distinctive(text):
    return {w for w in na(text).split() if len(w) > 3 and w not in STOPWORDS}


def name_score(m, cand):
    """Exige coincidencia en las palabras DISTINTIVAS, no solo parecido de cadena.

    Sin esto "Musee Automobile de Provence" puntua 0.62 contra "Musee Temoignage
    et Patrimoine" solo por compartir "musee": todos los museos se parecen entre
    si una vez quitas el ruido comun.
    """
    best = 0.0
    for a in (m.get("nameFr"), m.get("nameEn"), m.get("name")):
        if not a:
            continue
        ta = distinctive(a)
        for b in [cand["name"]] + cand.get("altNames", []):
            tb = distinctive(b)
            if not ta or not tb:
                continue
            overlap = len(ta & tb) / min(len(ta), len(tb))
            if overlap < 0.5:
                continue
            ratio = difflib.SequenceMatcher(None, na(a), na(b)).ratio()
            best = max(best, min(ratio, 0.4 + 0.6 * overlap))
    return best


def main():
    museums = json.load(open(IO, encoding="utf-8"))
    targets = [m for m in museums if not m.get("geo") or m["geo"].get("precision") != "point"]
    print(f"a reintentar con Overpass: {len(targets)}")

    fixed = 0
    for i, m in enumerate(targets, 1):
        geo = m.get("geo")
        if not geo:
            print(f"{i:3d}/{len(targets)} SKIP {m['name']}")
            continue
        cands = overpass(geo["lat"], geo["lng"])
        chosen = reason = None

        for c in cands:
            if domain(c.get("website")) and domain(c["website"]) == domain(m.get("website")):
                chosen, reason = c, "web"
                break
        if not chosen:
            scored = sorted(((name_score(m, c), c) for c in cands), key=lambda x: -x[0])
            if scored and scored[0][0] >= 0.62:
                chosen, reason = scored[0][1], f"nombre {scored[0][0]:.2f}"
        if not chosen:
            autos = [c for c in cands if AUTO_RE.search(c["name"])]
            if len(autos) == 1:
                chosen, reason = autos[0], "unico museo de motor del radio"

        if chosen:
            m["geo"] = {
                "lat": round(chosen["lat"], 6), "lng": round(chosen["lng"], 6),
                "precision": "point", "method": "overpass",
                "matched": chosen["name"], "rule": reason,
                "osmType": chosen["osmType"], "osmId": chosen["osmId"],
            }
            fixed += 1
            print(f"{i:3d}/{len(targets)} FIX  {m['name'][:36]:36s} -> {chosen['name'][:32]:32s} [{reason}]", flush=True)
        else:
            print(f"{i:3d}/{len(targets)} ---  {m['name'][:36]:36s} ({len(cands)} museos cerca)", flush=True)
        if i % 5 == 0:
            json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False)

    json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(museums, open(IO, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    n_pt = sum(1 for m in museums if m.get("geo") and m["geo"]["precision"] == "point")
    print(f"\nresueltos: {fixed} | exactos: {n_pt}/{len(museums)}")
    for m in museums:
        if not m.get("geo") or m["geo"]["precision"] != "point":
            a = m["address"]
            print(f"  PENDIENTE {m['name']} | {a['line1']} {a['postal']} {a['city']} {a['country']}")


if __name__ == "__main__":
    main()

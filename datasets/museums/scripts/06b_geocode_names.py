"""Pasada 2a: reintenta los museos a nivel ciudad buscando el NOMBRE en Nominatim.

La pasada 1 falla en museos rurales porque su direccion postal es una carretera
comarcal. OSM si suele tener el equipamiento, pero con su nombre en el idioma
local: por eso aqui se prueba primero el nombre frances y se acota el resultado
a 40 km del centro de la ciudad para descartar homonimos.
"""
import json, math, os, re, time, unicodedata
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
IO = os.path.join(HERE, "museums_geo.json")
CACHE = os.path.join(HERE, "geocache_names.json")
NOMINATIM = "https://nominatim.openstreetmap.org/search"
UA = "BeteranoMapBot/1.0 (contacto: neznosc@gmail.com)"
MAX_KM = 40

session = requests.Session()
session.headers.update({"User-Agent": UA, "Accept-Language": "en"})
cache = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}


def haversine(a, b, c, d):
    r = 6371.0
    p1, p2 = math.radians(a), math.radians(c)
    dp, dl = math.radians(c - a), math.radians(d - b)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def search(q, cc):
    key = f"{q}|{cc}"
    if key in cache:
        return cache[key]
    params = {"q": q, "format": "jsonv2", "limit": 5, "addressdetails": 1}
    if cc:
        params["countrycodes"] = cc.lower()
    out = []
    for attempt in range(3):
        try:
            r = session.get(NOMINATIM, params=params, timeout=45)
            if r.status_code == 200:
                out = r.json()
            break
        except Exception as exc:  # noqa: BLE001
            print(f"    retry {attempt+1}: {exc}", flush=True)
            time.sleep(3)
    cache[key] = out
    time.sleep(1.1)
    return out


def main():
    museums = json.load(open(IO, encoding="utf-8"))
    targets = [m for m in museums if not m.get("geo") or m["geo"].get("precision") != "point"]
    print(f"a reintentar: {len(targets)}")

    fixed = 0
    for i, m in enumerate(targets, 1):
        a = m["address"]
        cc = a["countryCode"]
        ref = m.get("geo")  # centro de la ciudad de la pasada 1, si lo hay
        queries = []
        for name in (m.get("nameFr"), m.get("nameEn"), m.get("name")):
            if not name:
                continue
            queries.append(f"{name}, {a['city']}" if a["city"] else name)
            queries.append(name)
        seen, ordered = set(), []
        for q in queries:
            if q not in seen:
                seen.add(q)
                ordered.append(q)

        hit = None
        for q in ordered:
            for cand in search(q, cc):
                lat, lng = float(cand["lat"]), float(cand["lon"])
                if ref and haversine(ref["lat"], ref["lng"], lat, lng) > MAX_KM:
                    continue
                cat = f"{cand.get('category')}/{cand.get('type')}"
                if cand.get("category") in ("tourism", "amenity", "building", "historic", "shop", "leisure") or not ref:
                    hit = (cand, lat, lng, q, cat)
                    break
            if hit:
                break

        if hit:
            cand, lat, lng, q, cat = hit
            m["geo"] = {
                "lat": round(lat, 6), "lng": round(lng, 6),
                "precision": "point", "method": "nominatim_name",
                "matched": cand.get("display_name", "")[:120], "query": q, "osmClass": cat,
                "osmType": cand.get("osm_type"), "osmId": cand.get("osm_id"),
            }
            fixed += 1
            print(f"{i:3d}/{len(targets)} FIX  {m['name'][:38]:38s} -> {cand.get('display_name','')[:50]}", flush=True)
        else:
            print(f"{i:3d}/{len(targets)} ---  {m['name'][:38]:38s}", flush=True)
        if i % 10 == 0:
            json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False)

    json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(museums, open(IO, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    n_pt = sum(1 for m in museums if m.get("geo") and m["geo"]["precision"] == "point")
    print(f"\nresueltos: {fixed} | exactos ahora: {n_pt}/{len(museums)}")
    rest = [m for m in museums if not m.get("geo") or m["geo"]["precision"] != "point"]
    print("\nsiguen sin punto exacto:")
    for m in rest:
        a = m["address"]
        print(f"  - {m['name']} | {a['line1']} {a['postal']} {a['city']} {a['country']}")


if __name__ == "__main__":
    main()

"""Geocodifica las direcciones de los museos con Nominatim (OSM).

Estrategia en cascada por museo:
  1. busqueda estructurada (street + city + postalcode + country)
  2. busqueda libre "nombre, calle, ciudad, pais"
  3. busqueda libre "nombre, ciudad, pais"
  4. fallback a centroide de ciudad (marcado con precision="city")
Cachea en geocache.json para poder reejecutar sin repegar a Nominatim.
"""
import json, os, re, sys, time
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
IN = os.path.join(HERE, "museums.json")
CACHE = os.path.join(HERE, "geocache.json")
OUT = os.path.join(HERE, "museums_geo.json")

NOMINATIM = "https://nominatim.openstreetmap.org/search"
UA = "BeteranoMapBot/1.0 (contacto: neznosc@gmail.com)"
DELAY = 1.1  # politica de uso de Nominatim: max 1 req/s

# correcciones manuales de datos de origen
COUNTRY_FIX = {
    "svedino-museum-of-automobile-and-aviation": ("Sweden", "SE"),
}

session = requests.Session()
session.headers.update({"User-Agent": UA, "Accept-Language": "en"})

cache = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}


def query(params, label):
    key = json.dumps([label, params], sort_keys=True, ensure_ascii=False)
    if key in cache:
        return cache[key]
    params = {**params, "format": "jsonv2", "limit": 1, "addressdetails": 1}
    result = None
    for attempt in range(3):
        try:
            r = session.get(NOMINATIM, params=params, timeout=45)
            if r.status_code == 200:
                data = r.json()
                result = data[0] if data else None
            break
        except Exception as exc:  # noqa: BLE001
            print(f"    retry {attempt+1}: {exc}", flush=True)
            time.sleep(3)
    cache[key] = result
    time.sleep(DELAY)
    return result


def geocode(m):
    a = m["address"]
    country = a["country"]
    cc = a["countryCode"]
    street = " ".join(x for x in [a["line1"], a["line2"]] if x).strip()
    city = a["city"]
    postal = a["postal"]

    attempts = []
    if street and city:
        attempts.append(("structured", {
            "street": street, "city": city,
            **({"postalcode": postal} if postal else {}),
            **({"countrycodes": cc.lower()} if cc else {}),
        }, "point"))
    if street and city:
        attempts.append(("free_full", {"q": ", ".join(x for x in [street, postal, city, country] if x)}, "point"))
    name_en = m.get("nameEn") or m.get("name")
    if name_en and city:
        attempts.append(("free_name", {"q": ", ".join(x for x in [name_en, city, country] if x)}, "point"))
    if city:
        attempts.append(("city", {
            "city": city, **({"countrycodes": cc.lower()} if cc else {}),
        }, "city"))

    for label, params, precision in attempts:
        hit = query(params, label)
        if not hit:
            continue
        lat, lng = float(hit["lat"]), float(hit["lon"])
        # sanity: si dio pais equivocado, descartar
        got_cc = ((hit.get("address") or {}).get("country_code") or "").upper()
        if cc and got_cc and got_cc != cc:
            continue
        return {
            "lat": round(lat, 6),
            "lng": round(lng, 6),
            "precision": precision,
            "method": label,
            "matched": hit.get("display_name", ""),
            "osmType": hit.get("osm_type"),
            "osmId": hit.get("osm_id"),
        }
    return None


def main():
    museums = json.load(open(IN, encoding="utf-8"))
    fails = []
    for i, m in enumerate(museums, 1):
        if m["id"] in COUNTRY_FIX:
            m["address"]["country"], m["address"]["countryCode"] = COUNTRY_FIX[m["id"]]
        geo = geocode(m)
        m["geo"] = geo
        flag = "OK " if geo and geo["precision"] == "point" else ("CITY" if geo else "FAIL")
        if not geo or geo["precision"] != "point":
            fails.append(m)
        print(f"{i:3d}/{len(museums)} {flag} {m['name'][:42]:42s} {m['address']['city'][:18]:18s} "
              f"{(geo or {}).get('method','-'):10s}", flush=True)
        if i % 10 == 0:
            json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False)

    json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(museums, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    n_pt = sum(1 for m in museums if m["geo"] and m["geo"]["precision"] == "point")
    n_city = sum(1 for m in museums if m["geo"] and m["geo"]["precision"] == "city")
    n_none = sum(1 for m in museums if not m["geo"])
    print(f"\nexacto: {n_pt} | solo ciudad: {n_city} | sin geo: {n_none} | total {len(museums)}")
    if fails:
        print("\nREVISAR A MANO:")
        for m in fails:
            a = m["address"]
            print(f"  - {m['name']} | {a['line1']} {a['postal']} {a['city']} {a['country']} | {m['website']}")
    print(f"-> {OUT}")


if __name__ == "__main__":
    main()

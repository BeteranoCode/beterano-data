"""Genera los dos artefactos finales:

  museums.dataset.json  -> dataset canonico para beterano-data (datasets/museums)
  map-places.seed.json  -> filas listas para MotorsMapPlace (tribe = "museos")
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(HERE, "museums.json")       # parseo fresco
GEO = os.path.join(HERE, "museums_geo.json")    # con coordenadas
OVERRIDES = os.path.join(HERE, "manual_overrides.json")
OUT_DATASET = os.path.join(HERE, "museums.dataset.json")
OUT_SEED = os.path.join(HERE, "map-places.seed.json")

SOURCE_NAME = "automobile-museums.com"
TRIBE = "museos"


def clip(value, max_len):
    """Recorta al limite del esquema del core-api; devuelve None si queda vacio."""
    text = str(value or "").strip()
    if not text:
        return None
    return text if len(text) <= max_len else text[: max_len - 1].rstrip() + "…"


def pick(*values):
    for v in values:
        if v:
            return v
    return ""


def richness(m):
    """Cuanto contenido trae una ficha, para quedarse con la mejor de un duplicado."""
    return (
        len(m.get("summaryEn") or "") + len(m.get("summaryFr") or "")
        + 200 * len(m.get("photos") or [])
        + 100 * len(m.get("opening", {}).get("rows") or [])
        + 100 * len(m.get("rates", {}).get("rows") or [])
        + 50 * len(m.get("langs") or [])
    )


def dedupe(museums):
    """El sitio de origen tiene fichas repetidas del mismo museo (paginas EN
    duplicadas con su propia traduccion), asi que el emparejado por hreflang las
    deja como museos distintos. Se colapsan por web oficial + ciudad."""
    by_key, order = {}, []
    for m in museums:
        site = re.sub(r"^https?://(www\.)?", "", (m.get("website") or "").lower()).rstrip("/")
        city = (m["address"].get("city") or "").strip().lower()
        key = ("web", site, city) if site else ("id", m["id"])
        if key not in by_key:
            by_key[key] = {"best": m, "ids": [m["id"]]}
            order.append(key)
            continue
        entry = by_key[key]
        entry["ids"].append(m["id"])
        if richness(m) > richness(entry["best"]):
            entry["best"] = m

    out = []
    for key in order:
        entry = by_key[key]
        best = entry["best"]
        # El id canonico es el del duplicado sin sufijo numerico: es el que
        # referencian los overrides manuales, y el que sobrevive no siempre lo es.
        best["id"] = sorted(entry["ids"], key=lambda i: (len(i), i))[0]
        out.append(best)

    dropped = len(museums) - len(out)
    if dropped:
        print(f"duplicados colapsados: {dropped}")
    return out


def main():
    base = dedupe(json.load(open(BASE, encoding="utf-8")))
    geo_by_key = {}
    if os.path.exists(GEO):
        for m in json.load(open(GEO, encoding="utf-8")):
            geo_by_key[m["groupKey"]] = m.get("geo")
    overrides = json.load(open(OVERRIDES, encoding="utf-8")) if os.path.exists(OVERRIDES) else {}

    dataset, seed, missing_geo, closed, dropped = [], [], [], [], []
    for m in base:
        geo = geo_by_key.get(m["groupKey"])
        ov = overrides.get(m["id"]) or {}
        # `drop` es para duplicados que el emparejado por hreflang no puede ver:
        # el mismo museo con dos fichas y dos webs distintas. Salen del dataset
        # entero, no solo del mapa (a diferencia de `closed`).
        if ov.get("drop"):
            dropped.append(m["id"])
            continue
        if ov.get("geo"):
            geo = ov["geo"]
        if ov.get("city"):
            m["address"]["city"] = ov["city"]
        a = m["address"]
        street = " ".join(x for x in [a["line1"], a["line2"]] if x).strip()
        summary = pick(m["summaryEn"], m["summaryFr"])
        sections_en = m["sectionsEn"]
        sections_fr = m["sectionsFr"]
        long_desc = "\n\n".join(
            f"{s['heading']}\n{s['text']}" for s in (sections_en or sections_fr)
        ).strip()

        record = {
            "id": m["id"],
            "name": {"en": m["nameEn"] or m["name"], "fr": m["nameFr"]},
            "address": {
                "street": street,
                "city": a["city"],
                "region": a["region"],
                "postalCode": a["postal"],
                "country": a["country"],
                "countryCode": a["countryCode"],
            },
            "location": geo and {"lat": geo["lat"], "lng": geo["lng"], "precision": geo["precision"]},
            "contact": {"phone": m["phone"], "website": m["website"], "email": None},
            "opening": m["opening"],
            "rates": m["rates"],
            "media": {"logo": m["logo"], "photos": m["photos"]},
            "summary": {"en": m["summaryEn"], "fr": m["summaryFr"]},
            "sections": {"en": sections_en, "fr": sections_fr},
            "source": {
                "name": SOURCE_NAME,
                "urlEn": m["sourceUrlEn"],
                "urlFr": m["sourceUrlFr"],
                "modified": m["modified"],
            },
            "geocoding": geo and {
                "method": geo["method"], "matched": geo.get("matched", ""),
                "precision": geo["precision"],
            },
            "closed": bool(ov.get("closed")),
        }
        dataset.append(record)

        if ov.get("closed"):
            closed.append(m["name"])
            continue
        if not geo:
            missing_geo.append(m["name"])
            continue

        # Los limites (12 imagenes, 400/4000 caracteres, enum de source, email
        # como string o ausente) son los del esquema Zod del core-api. Se aplican
        # aqui tambien para que este JSON sea una vista previa fiel de lo que
        # insertara el importador y no un artefacto que solo valida a medias.
        row = {
            "slug": f"museo-{m['id']}",
            "source": "SUPERADMIN_SEED",
            "name": m["nameEn"] or m["name"],
            "tribe": TRIBE,
            "countryCode": a["countryCode"] or None,
            "country": a["country"] or None,
            "city": a["city"] or None,
            "lat": geo["lat"],
            "lng": geo["lng"],
            "precision": geo["precision"],
            "bufferKm": 5 if geo["precision"] == "city" else None,
            "description": clip(summary, 4000),
            "website": m["website"] or None,
            "phone": m["phone"] or None,
            "published": True,
            "status": "PUBLISHED",
            "logoUrl": m["logo"] or None,
            "images": (m["photos"] or [])[:12],
            "region": a["region"] or None,
            "address": street or None,
            "postalCode": a["postal"] or None,
            "shortDescription": clip(summary, 400),
            "longDescription": clip(long_desc, 4000),
            "verified": False,
            "featured": False,
            "metadata": {
                "museum": {
                    "names": {"en": m["nameEn"], "fr": m["nameFr"]},
                    "summaries": {"en": m["summaryEn"], "fr": m["summaryFr"]},
                    "sections": {"en": sections_en, "fr": sections_fr},
                    "opening": m["opening"],
                    "rates": m["rates"],
                },
                "source": {
                    "name": SOURCE_NAME,
                    "urlEn": m["sourceUrlEn"],
                    "urlFr": m["sourceUrlFr"],
                    "modified": m["modified"],
                },
                "geocoding": {
                    "method": geo["method"],
                    "matched": geo.get("matched", ""),
                    "precision": geo["precision"],
                },
            },
        }
        # Varios campos son opcionales pero NO nullables (website, phone,
        # description, bufferKm): mandar `null` los rompe, omitirlos no.
        seed.append({k: v for k, v in row.items() if v is not None})

    json.dump(dataset, open(OUT_DATASET, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(seed, open(OUT_SEED, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    n_pt = sum(1 for r in seed if r["precision"] == "point")
    print(f"dataset: {len(dataset)} museos -> {OUT_DATASET}")
    print(f"seed:    {len(seed)} pines ({n_pt} exactos, {len(seed)-n_pt} a nivel ciudad) -> {OUT_SEED}")
    if dropped:
        print(f"duplicados descartados a mano ({len(dropped)}): {dropped}")
    if closed:
        print(f"cerrados, fuera del mapa ({len(closed)}): {closed}")

    # Colisiones: el backend rechaza crear un pin de la misma tribu a menos de
    # ~55 m de otro, asi que conviene verlas aqui y no en mitad del import.
    seen = []
    for r in seed:
        for other in seen:
            if abs(r["lat"] - other["lat"]) <= 0.0005 and abs(r["lng"] - other["lng"]) <= 0.0005:
                print(f"AVISO colision <55 m: {r['slug']} vs {other['slug']}")
        seen.append(r)
    if missing_geo:
        print(f"sin coordenadas ({len(missing_geo)}): {missing_geo}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Enrich the aggregated RO-ALERT CSV into JSON consumed by the static dashboard.

Reads `repository/arhiva-ro-alert/aggregated/csv/mesaje ro-alert gemini.csv`
(648 logical records; quoted message bodies span multiple lines) and writes:
  - data/alerts.json : one enriched object per record
  - data/meta.json   : facet value lists + counts, per-judet counts, totals, date range

Run from the project root:  python3 build_data.py
"""
import csv
import json
import os
import re
import collections
from datetime import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "repository", "arhiva-ro-alert", "aggregated", "csv",
                   "mesaje ro-alert gemini.csv")
OUT_DIR = os.path.join(ROOT, "data")

# --- ISU / initiator code -> county (judet) ----------------------------------
# County ISUs use the standard auto-plate abbreviations. National actors map to
# the synthetic "National" bucket and scope=national.
ISU_JUDET = {
    "ISUAB": "Alba", "ISUAR": "Arad", "ISUAG": "Argeș", "ISUBC": "Bacău",
    "ISUBH": "Bihor", "ISUBN": "Bistrița-Năsăud", "ISUBT": "Botoșani",
    "ISUBV": "Brașov", "ISUBR": "Brăila", "ISUBZ": "Buzău",
    "ISUCS": "Caraș-Severin", "ISUCL": "Călărași", "ISUCJ": "Cluj",
    "ISUCT": "Constanța", "ISUCV": "Covasna", "ISUDB": "Dâmbovița",
    "ISUDJ": "Dolj", "ISUGL": "Galați", "ISUGR": "Giurgiu", "ISUGJ": "Gorj",
    "ISUHR": "Harghita", "ISUHD": "Hunedoara", "ISUIL": "Ialomița",
    "ISUIS": "Iași", "ISUIF": "Ilfov", "ISUMM": "Maramureș",
    "ISUMH": "Mehedinți", "ISUMS": "Mureș", "ISUNT": "Neamț", "ISUOT": "Olt",
    "ISUPH": "Prahova", "ISUSM": "Satu Mare", "ISUSJ": "Sălaj",
    "ISUSB": "Sibiu", "ISUSV": "Suceava", "ISUTR": "Teleorman",
    "ISUTM": "Timiș", "ISUTL": "Tulcea", "ISUVS": "Vaslui", "ISUVL": "Vâlcea",
    "ISUVN": "Vrancea", "ISUB": "București", "ISUBIF": "București-Ilfov",
}
NATIONAL_CODES = {"IGSU", "ANM", "STS", "DSU", "MAI"}

# 2-letter auto-plate codes -> county, used to recover the county of meteo
# alerts issued by ANM that carry an "ISU XX" tag in the title.
PLATE_JUDET = {
    "AB": "Alba", "AR": "Arad", "AG": "Argeș", "BC": "Bacău", "BH": "Bihor",
    "BN": "Bistrița-Năsăud", "BT": "Botoșani", "BV": "Brașov", "BR": "Brăila",
    "BZ": "Buzău", "CS": "Caraș-Severin", "CL": "Călărași", "CJ": "Cluj",
    "CT": "Constanța", "CV": "Covasna", "DB": "Dâmbovița", "DJ": "Dolj",
    "GL": "Galați", "GR": "Giurgiu", "GJ": "Gorj", "HR": "Harghita",
    "HD": "Hunedoara", "IL": "Ialomița", "IS": "Iași", "IF": "Ilfov",
    "MM": "Maramureș", "MH": "Mehedinți", "MS": "Mureș", "NT": "Neamț",
    "OT": "Olt", "PH": "Prahova", "SM": "Satu Mare", "SJ": "Sălaj",
    "SB": "Sibiu", "SV": "Suceava", "TR": "Teleorman", "TM": "Timiș",
    "TL": "Tulcea", "VS": "Vaslui", "VL": "Vâlcea", "VN": "Vrancea",
    "B": "București",
}
TITLE_ISU_RE = re.compile(r"\bISU\s*([A-Z]{1,3})\b")


def judet_for(initiator, title=None):
    code = (initiator or "").strip().upper()
    if code in ISU_JUDET:
        return ISU_JUDET[code], "county"
    if code in NATIONAL_CODES:
        # meteo alerts (ANM) often tag the target county in the title
        m = TITLE_ISU_RE.search(title or "")
        if m and m.group(1) in PLATE_JUDET:
            return PLATE_JUDET[m.group(1)], "county"
        return "National", "national"
    return "Necunoscut", "unknown"


# --- coarse risk category (primary sidebar facet) ----------------------------
def risk_category(principal, asociat, msg):
    p = (principal or "").lower()
    a = (asociat or "").lower()
    text = f"{p} {a} {(msg or '').lower()}"
    if "animale" in a or "urs" in text or "bear" in text:
        return "Animale periculoase"
    if "copii disparuti" in a or "copil" in text or "child" in text:
        return "Copil dispărut"
    if "atac aerian" in a or "aerian" in text or "air" in a:
        return "Atac aerian / dronă"
    if "inundat" in text:
        return "Inundații"
    if "incendi" in p or "incendi" in a or "fire" in text:
        return "Incendiu"
    if "meteo" in p or any(w in a for w in ("furtun", "viscol", "vant", "zapada",
                                            "ninsoa", "ploi", "vijelii")):
        return "Meteo"
    if "tehnolog" in p or "polua" in p or "polua" in a:
        return "Tehnologic"
    if "securitati nationale" in p or "securitatii nationale" in p:
        return "Securitate națională"
    return "Altele"


METEO_COLOR_RE = re.compile(r"\b(galben|portocaliu|ro[șs]u|verde)\b", re.IGNORECASE)
_COLOR_NORM = {"galben": "Galben", "portocaliu": "Portocaliu", "rosu": "Roșu",
               "roșu": "Roșu", "verde": "Verde"}


def meteo_color(title, msg):
    for src in (title, msg):
        m = METEO_COLOR_RE.search(src or "")
        if m:
            return _COLOR_NORM.get(m.group(1).lower(), m.group(1).title())
    return None


# --- locality extraction ------------------------------------------------------
LOC_PATTERNS = [
    re.compile(r"localit[ăa][țt]\w*\s+([A-ZȘŢȚĂÎÂ][\wșşţțăîâ .\-]+?)\s*[,!\.;:]"),
    re.compile(r"comuna\s+([A-ZȘŢȚĂÎÂ][\wșşţțăîâ .\-]+?)\s*[,!\.;:]"),
    re.compile(r"ora[șs]ul\s+([A-ZȘŢȚĂÎÂ][\wșşţțăîâ .\-]+?)\s*[,!\.;:]"),
    re.compile(r"municipiul\s+([A-ZȘŢȚĂÎÂ][\wșşţțăîâ .\-]+?)\s*[,!\.;:]"),
]
GENERIC_POLY = {"cerc", "poligon", "polygon", "circle"}


def extract_localities(msg, poligoane):
    found = []
    seen = set()

    def add(name):
        n = re.sub(r"\s+", " ", (name or "").strip()).strip(" .,-")
        if not n:
            return
        key = n.lower()
        if key in seen or key in GENERIC_POLY:
            return
        seen.add(key)
        found.append(n)

    for pat in LOC_PATTERNS:
        for m in pat.findall(msg or ""):
            # patterns may capture lists like "X si Y" -> split
            for part in re.split(r"\s+[șs]i\s+|,", m):
                add(part)
    # polygon tokens: "1-PRAID", "2-IASI" -> PRAID, IASI
    for tok in (poligoane or "").split(","):
        tok = tok.strip()
        tok = re.sub(r"^\d+\s*-\s*", "", tok)
        if tok and tok.lower() not in GENERIC_POLY and not tok.isdigit():
            add(tok.title() if tok.isupper() else tok)
    return found


# --- bilingual message split --------------------------------------------------
EN_LEADINS = [
    "Weather alert", "The presence", "A child", "Air raid", "Air-raid",
    "Air alert", "Air ", "Avoid", "Attention", "Dangerous", "Heavy",
    "Flood", "Evacuate", "Stay", "Do not", "There is", "Missing",
    "An imminent", "Imminent", "Strong wind", "Wind ", "Snow", "Storm",
    "A bear", "Bears", "Wild ", "Be aware", "Warning", "Alert", "Due to",
]


def split_bilingual(msg):
    if not msg:
        return None, None
    text = msg.strip()
    best = None
    for lead in EN_LEADINS:
        idx = text.find(lead)
        # require the lead-in to start a clause (preceded by punctuation/space,
        # and not be the very first chars which would be a fully-EN message)
        if idx > 20:
            if best is None or idx < best:
                best = idx
    if best is not None:
        ro = text[:best].strip(" .,-")
        en = text[best:].strip()
        if ro and en:
            return ro, en
    return text, None


def parse_dt(s):
    s = (s or "").strip()
    if not s:
        return None
    for fmt in ("%Y/%m/%d %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%d.%m.%Y %H:%M:%S",
                "%Y/%m/%d %H:%M", "%d.%m.%Y %H:%M"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


WEEKDAYS = ["Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"]
MONTHS = {"26-02": "Februarie", "26-03": "Martie", "26-04": "Aprilie"}


def norm(v):
    v = (v or "").strip()
    return v if v else None


def main():
    with open(SRC, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    alerts = []
    for i, r in enumerate(rows):
        initiator = norm(r.get("Initiator alerta"))
        principal = norm(r.get("Risc principal"))
        asociat = norm(r.get("Risc asociat"))
        title = norm(r.get("Nume si data alerta"))
        msg = norm(r.get("Continut mesaj"))
        poligoane = norm(r.get("Lista poligoane"))
        status_trim = (r.get("Status trimitere") or "").strip().upper()
        tip_mesaj = (r.get("Tip mesaj") or "").strip().upper()

        judet, scope = judet_for(initiator, title)
        dt = parse_dt(r.get("Data trimitere"))
        ro, en = split_bilingual(msg)
        src_file = (r.get("Fisier sursa") or "").strip()
        month_key = src_file.replace(".csv", "")

        a = {
            "id": i,
            "source_file": src_file or None,
            "month": MONTHS.get(month_key, month_key or None),
            "title": title,
            "initiator": initiator,
            "judet": judet,
            "scope": scope,
            "risc_principal": principal,
            "risc_asociat": asociat,
            "risk_category": risk_category(principal, asociat, msg),
            "meteo_color": meteo_color(title, msg),
            "status_trimitere": status_trim or None,
            "status_ok": status_trim == "SENT" if status_trim else None,
            "tip_mesaj": tip_mesaj or None,
            "is_cancel": tip_mesaj == "CANCEL",
            "poligoane": poligoane,
            "localities": extract_localities(msg, poligoane),
            "msg": msg,
            "msg_ro": ro,
            "msg_en": en,
            # newer-format metadata (often null)
            "categorie": norm(r.get("Categorie")),
            "urgenta": norm(r.get("Urgenta")),
            "severitate": norm(r.get("Severitate")),
            "cod_eveniment": norm(r.get("Cod eveniment")),
            "tip_inregistrare": norm(r.get("Tip inregistrare")),
            "audienta": norm(r.get("Audienta")),
            "nr_repetitii": norm(r.get("Nr. repetitii")),
            "interval_repetitie": norm(r.get("Interval repetitie")),
            "data_creare": norm(r.get("Data creare")),
            "data_expirare": norm(r.get("Data expirare")),
            "id_alerta": norm(r.get("ID alerta")),
            "identificator_unic": norm(r.get("Identificator unic")),
            "tip_alerta": norm(r.get("Tip alerta")),
            # parsed time
            "sent_at": dt.isoformat() if dt else None,
            "date": dt.strftime("%Y-%m-%d") if dt else None,
            "hour": dt.hour if dt else None,
            "weekday": WEEKDAYS[dt.weekday()] if dt else None,
        }
        alerts.append(a)

    # ----- meta / facets -----
    def facet(field):
        c = collections.Counter(a[field] for a in alerts if a.get(field))
        return [{"value": k, "count": v} for k, v in c.most_common()]

    judet_counts = collections.Counter(a["judet"] for a in alerts
                                       if a["scope"] == "county")
    # localities grouped by judet for the Local-view picker
    loc_by_judet = collections.defaultdict(collections.Counter)
    for a in alerts:
        if a["scope"] == "county":
            for loc in a["localities"]:
                loc_by_judet[a["judet"]][loc] += 1

    dates = [a["sent_at"] for a in alerts if a["sent_at"]]
    meta = {
        "total": len(alerts),
        "sent": sum(1 for a in alerts if a["status_ok"] is True),
        "error": sum(1 for a in alerts if a["status_ok"] is False),
        "cancel": sum(1 for a in alerts if a["is_cancel"]),
        "date_min": min(dates) if dates else None,
        "date_max": max(dates) if dates else None,
        "facets": {
            "risk_category": facet("risk_category"),
            "risc_principal": facet("risc_principal"),
            "risc_asociat": facet("risc_asociat"),
            "judet": facet("judet"),
            "initiator": facet("initiator"),
            "severitate": facet("severitate"),
            "urgenta": facet("urgenta"),
            "tip_mesaj": facet("tip_mesaj"),
            "cod_eveniment": facet("cod_eveniment"),
            "status_trimitere": facet("status_trimitere"),
            "meteo_color": facet("meteo_color"),
            "tip_inregistrare": facet("tip_inregistrare"),
            "month": facet("month"),
            "scope": facet("scope"),
        },
        "judet_counts": dict(judet_counts),
        "localities_by_judet": {
            j: [loc for loc, _ in cnt.most_common()]
            for j, cnt in sorted(loc_by_judet.items())
        },
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "alerts.json"), "w", encoding="utf-8") as f:
        json.dump(alerts, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT_DIR, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    # Also emit JS-wrapped bundles into web/data so the app works straight from
    # the filesystem (file://) with no server and no fetch()/CORS issues.
    web_data = os.path.join(ROOT, "web", "data")
    os.makedirs(web_data, exist_ok=True)

    def write_js(fname, varname, obj):
        with open(os.path.join(web_data, fname), "w", encoding="utf-8") as fh:
            fh.write(f"window.{varname}=")
            json.dump(obj, fh, ensure_ascii=False, separators=(",", ":"))
            fh.write(";\n")

    write_js("alerts.js", "ALERTS", alerts)
    write_js("meta.js", "META", meta)

    geo_path = os.path.join(OUT_DIR, "romania-counties.geojson")
    if os.path.exists(geo_path):
        with open(geo_path, encoding="utf-8") as gf:
            geo = json.load(gf)
        write_js("geo.js", "GEO", geo)
    else:
        print("  WARNING: data/romania-counties.geojson missing -> web/data/geo.js not written")

    print(f"Wrote {len(alerts)} alerts -> data/alerts.json + web/data/*.js")
    print(f"  sent={meta['sent']} error={meta['error']} cancel={meta['cancel']}")
    print(f"  date range {meta['date_min']} .. {meta['date_max']}")
    print(f"  counties with alerts: {len(judet_counts)}")


if __name__ == "__main__":
    main()

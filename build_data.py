#!/usr/bin/env python3
"""Enrich the aggregated RO-ALERT CSV into JSON consumed by the static dashboard.

Reads every `sources/YYYY-MM.csv` (written by `ingest.py`) in month order and writes:
  - data/alerts.json : one enriched object per record
  - data/meta.json   : facet value lists + counts, per-judet counts, totals, date range

Run from the project root:  python3 build_data.py
"""
import csv
import glob
import hashlib
import json
import os
import re
import unicodedata
import collections
from datetime import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(ROOT, "sources")
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


# --- location extraction ------------------------------------------------------
# A layered, deterministic (no-LLM) extractor. Each cue-anchored regex captures a
# generous tail, then clean_place() trims it to a clean name. Output is a typed
# list; `localities` (locality-typed) is kept for backward compatibility.
#
# Resolution/geocoding (SIRUTA lookup, Nominatim) is intentionally *not* done
# here: this build stays offline and reproducible. See README backlog.

def _ascii(s):
    return "".join(c for c in unicodedata.normalize("NFD", s or "")
                    if unicodedata.category(c) != "Mn").lower()


# Tokens that terminate a place phrase: connectives, boilerplate verbs, the start
# of the English half, and admin/road cue words (so a locality capture stops
# before "pe strada ..."). Compared accent-insensitively, lower-cased.
PLACE_BOUNDARY = {
    "pe", "si", "sau", "nu", "spre", "catre", "intre", "langa", "cu", "este",
    "sunt", "unde", "care", "ce", "din", "in", "la", "jud", "judet", "judetul",
    "zona", "zonei", "strada", "str", "soseaua", "sos", "calea", "aleea",
    "bulevardul", "bd", "sat", "satul", "comuna", "oras", "orasul", "municipiul",
    "nr", "prezenta", "locuinte", "locuintele", "animal", "animalul", "va", "se",
    "evitati", "evitand", "ramaneti", "pastrati", "respectati", "ocoliti",
    "parasiti", "izolati", "luati", "conduceti", "mutati", "apelati",
    "indreptati", "valabil", "perioada", "incepand", "avoid", "stay", "please",
    "the", "isu", "dsu", "igsu", "anm", "sts", "mai", "a", "au",
}
# Adjectives that make a "zona X" phrase generic rather than a real placemark.
GENERIC_PLACE = {
    "inundabila", "inundabil", "inundabile", "afectata", "afectat", "afectate",
    "respectiva", "respectiv", "indicata", "mentionata", "periculoasa",
    "periculos", "limitrofe", "vizata", "vizate", "ingusta", "joasa",
}
# Place-type noun stems that signal a point-of-interest placemark.
POI_NOUNS = (
    "pensiun", "hotel", "motel", "gar", "uzin", "fabric", "gradin", "lac",
    "schit", "aren", "stadion", "biseric", "manastir", "primari", "scoal",
    "liceu", "spital", "pod", "baraj", "centrala", "hidrocentral", "cimitir",
    "parc", "complex", "depozit", "rafinari", "combinat", "viaduct", "tunel",
    "pasaj", "terminal", "sens", "intersect", "vulcanizare", "zoo",
)
# Admin-noun stems: if a "zona X" phrase starts with one, it's really a locality
# reference ("zona localitatii Scoreiu"), not a distinct POI.
ADMIN_STEMS = ("localit", "comun", "oras", "municip", "sat", "judet", "raza")
GENERIC_POLY = {"cerc", "poligon", "polygon", "circle"}


def clean_place(raw, *, allow_lead_lower=False):
    """Trim a raw captured span to a clean place name: drop leading junk, stop at
    the first boundary token, cap length at 5 tokens, normalise ALL-CAPS."""
    toks = re.split(r"\s+", re.sub(r"[‐-―]", "-", raw or "").strip())
    out = []
    for t in toks:
        bare = t.strip(" .,!;:-")
        if not bare:
            continue
        key = _ascii(bare)
        if not out:
            if key in PLACE_BOUNDARY:
                continue
            if not allow_lead_lower and not (bare[0].isupper() or bare[0].isdigit()):
                continue
        elif key in PLACE_BOUNDARY:
            break
        out.append(bare)
        if len(out) >= 5:
            break
    name = " ".join(out).strip(" .,!;:-")
    if len(name) < 2:
        return None
    return name.title() if name.isupper() else name


ADMIN_RE = re.compile(
    r"\b(?:localit[ăa][țt]\w*|comun[ae]i?|ora[șs]ul?|municipiul?|sat(?:ul)?|loc\.)\s+"
    r"([A-ZȘŢȚĂÎÂ][^,!\.;:\n]{1,60})", re.IGNORECASE)
STREET_RE = re.compile(
    r"\b(?:strada|str\.?|bulevardul|bd\.?|b-dul|calea|aleea|[șs]oseaua|[șs]os\.?|"
    r"pia[țt]a|intersec[țt]ia|drumul)\s+([A-ZȘŢȚĂÎÂ0-9][^,!\.;:\n]{1,50})",
    re.IGNORECASE)
ROAD_RE = re.compile(r"\b((?:DN|DJ|DC|E|A)\s?0*\d{1,3}[A-Z]?)\b")
KM_RE = re.compile(r"\bkm\.?\s?(\d{1,3}(?:[+,.]\d{1,3})?)\b", re.IGNORECASE)
RIVER_RE = re.compile(
    r"\b(?:r[âa]ul|p[âa]r[âa]ul|valea)\s+([A-ZȘŢȚĂÎÂ][^,!\.;:\n]{1,40})",
    re.IGNORECASE)
POI_RE = re.compile(
    r"\b(?:[iî]n\s+zona|zona|zonei|[iî]n\s+dreptul|l[âa]ng[ăa]|"
    r"[iî]n\s+apropierea?(?:\s+de)?)\s+([^,!\.;:\n]{2,55})", re.IGNORECASE)


def extract_locations(msg, poligoane=""):
    """Return a typed list of place candidates found in the message + polygons:
    [{"type": "locality|street|road|km|river|poi", "name": str}, ...]."""
    text = msg or ""
    out = []
    seen = set()

    def add(kind, name):
        if not name:
            return
        key = (kind, name.lower())
        if key in seen:
            return
        seen.add(key)
        out.append({"type": kind, "name": name})

    for m in ADMIN_RE.findall(text):
        add("locality", clean_place(m))
    for m in STREET_RE.findall(text):
        add("street", clean_place(m))
    for m in ROAD_RE.findall(text):
        add("road", m.upper().replace(" ", ""))
    for m in KM_RE.findall(text):
        add("km", "km " + m)
    for m in RIVER_RE.findall(text):
        add("river", clean_place(m))
    for m in POI_RE.findall(text):
        name = clean_place(m, allow_lead_lower=True)
        if not name:
            continue
        words = name.split()
        a0 = _ascii(words[0])
        if a0.startswith(ADMIN_STEMS):        # "zona localitatii X" -> not a POI
            continue
        if all(_ascii(w) in GENERIC_PLACE for w in words):
            continue
        a = _ascii(name)
        has_poi = any(n in a for n in POI_NOUNS)
        has_proper = any(w[0].isupper() for w in words)
        if has_poi or has_proper:
            add("poi", name)

    # polygon tokens: "1-PRAID", "2-IASI" -> Praid, Iasi (official targets)
    for tok in (poligoane or "").split(","):
        tok = re.sub(r"^\s*\d+\s*-\s*", "", tok.strip())
        if tok and tok.lower() not in GENERIC_POLY and not tok.isdigit():
            add("locality", tok.title() if tok.isupper() else tok)
    return out


def extract_localities(msg, poligoane):
    """Backward-compatible: just the locality-typed names."""
    return [l["name"] for l in extract_locations(msg, poligoane)
            if l["type"] == "locality"]


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
MONTH_NAMES = ["Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie", "Iulie",
               "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"]


def month_label(ym):
    """'2026-05' -> 'Mai 2026'."""
    y, m = ym.split("-")
    return "%s %s" % (MONTH_NAMES[int(m) - 1], y)


def alert_id(r, title, msg):
    """Stable string id of a row that is one alert: 'Identificator unic' when present,
    else a hash of the row key (title, text, time, record type, message type, status, audience).
    """
    uid = (r.get("Identificator unic") or "").strip()
    if uid:
        return uid
    parts = [title or "", msg or ""] + [
        (r.get(c) or "").strip()
        for c in ("Data trimitere", "Tip inregistrare", "Tip mesaj", "Status trimitere", "Audienta")
    ]
    key = "|".join(parts)
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:12]


def group_id(title, data_creare, tip_mesaj):
    """Stable id of an alert that spans several delivery rows."""
    key = "|".join([title or "", data_creare or "", tip_mesaj or ""])
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:12]


def group_rows(rows):
    """Group CSV rows into alerts. Returns a list of (row_list, group_key_or_None).

    A month with a `Data creare` column has one row per delivery (channel, retry). One alert
    is then one group of rows with the same title, `Data creare` and `Tip mesaj`. ALERT and
    CANCEL stay apart. A row without `Data creare` is one alert.
    """
    groups = collections.OrderedDict()
    out = []
    for r in rows:
        title = (r.get("Nume si data alerta") or "").strip()
        dc = (r.get("Data creare") or "").strip()
        if not dc:
            out.append(([r], None))
            continue
        tm = (r.get("Tip mesaj") or "").strip().upper()
        key = (r.get("Fisier sursa"), title, dc, tm)
        if key not in groups:
            groups[key] = []
            out.append((groups[key], (title, dc, tm)))
        groups[key].append(r)
    return out


def norm(v):
    v = (v or "").strip()
    return v if v else None


def main():
    files = sorted(glob.glob(os.path.join(SRC_DIR, "*.csv")))
    if not files:
        raise SystemExit("no sources/*.csv found; run ingest.py first")
    rows = []
    for fp in files:
        base = os.path.basename(fp)
        with open(fp, encoding="utf-8", newline="") as f:
            for r in csv.DictReader(f):
                r["Fisier sursa"] = base
                rows.append(r)

    alerts = []
    seen_ids = set()
    duplicates = 0
    for grp, gkey in group_rows(rows):
        deliveries = []
        for g in grp:
            gdt = parse_dt(g.get("Data trimitere"))
            deliveries.append({
                "channel": norm(g.get("Tip inregistrare")),
                "status": (g.get("Status trimitere") or "").strip().upper() or None,
                "sent_at": gdt.isoformat() if gdt else None,
                "audienta": norm(g.get("Audienta")),
            })
        # representative row: the first SENT delivery, else the first row
        rep = next((g for g, d in zip(grp, deliveries) if d["status"] == "SENT"), grp[0])
        r = rep
        initiator = norm(r.get("Initiator alerta"))
        principal = norm(r.get("Risc principal"))
        asociat = norm(r.get("Risc asociat"))
        title = norm(r.get("Nume si data alerta"))
        msg = norm(r.get("Continut mesaj"))
        poligoane = norm(r.get("Lista poligoane"))
        status_trim = (r.get("Status trimitere") or "").strip().upper()
        tip_mesaj = (r.get("Tip mesaj") or "").strip().upper()
        if any(d["status"] == "SENT" for d in deliveries):
            status_ok = True
        elif any(d["status"] for d in deliveries):
            status_ok = False
        else:
            status_ok = None

        judet, scope = judet_for(initiator, title)
        dt = parse_dt(r.get("Data trimitere"))
        ro, en = split_bilingual(msg)
        # extract from the Romanian half only (avoids duplicate English hits)
        locations = extract_locations(ro or msg, poligoane)
        src_file = (r.get("Fisier sursa") or "").strip()
        month_key = src_file.replace(".csv", "")
        if gkey:
            aid = group_id(gkey[0], gkey[1], gkey[2])
        else:
            aid = alert_id(r, title, msg)
        if aid in seen_ids:
            duplicates += 1
            continue
        seen_ids.add(aid)

        a = {
            "id": aid,
            "source_file": src_file or None,
            "month": month_label(month_key),
            "title": title,
            "initiator": initiator,
            "judet": judet,
            "scope": scope,
            "risc_principal": principal,
            "risc_asociat": asociat,
            "risk_category": risk_category(principal, asociat, msg),
            "meteo_color": meteo_color(title, msg),
            "status_trimitere": status_trim or None,
            "status_ok": status_ok,
            "tip_mesaj": tip_mesaj or None,
            "is_cancel": tip_mesaj == "CANCEL",
            "poligoane": poligoane,
            "locations": locations,
            "localities": [l["name"] for l in locations if l["type"] == "locality"],
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
            # one entry per CSV row of the alert: channel, status, time, audience
            "deliveries": deliveries,
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

    # per-month figures; `reports_errors` comes from the ingest manifest
    reports = {}
    try:
        with open(os.path.join(SRC_DIR, "manifest.json"), encoding="utf-8") as mf:
            reports = {m["month"]: bool(m.get("reports_errors")) for m in json.load(mf)}
    except (OSError, ValueError, KeyError):
        pass
    months = []
    for fp in files:
        key = os.path.basename(fp).replace(".csv", "")
        label = month_label(key)
        ma = [a for a in alerts if a["month"] == label]
        derr = sum(1 for a in ma for d in a["deliveries"] if d["status"] == "ERROR")
        months.append({
            "key": key, "label": label,
            "alerts": len(ma),
            "deliveries": sum(len(a["deliveries"]) for a in ma),
            "delivery_errors": derr,
            "reports_errors": reports.get(key, derr > 0),
        })

    dates = [a["sent_at"] for a in alerts if a["sent_at"]]
    meta = {
        "total": len(alerts),
        "deliveries": sum(len(a["deliveries"]) for a in alerts),
        "delivery_error": sum(1 for a in alerts for d in a["deliveries"] if d["status"] == "ERROR"),
        "months": months,
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

    # Also emit JS-wrapped bundles alongside the JSON in data/ so the app works
    # straight from the filesystem (file://) with no server and no fetch()/CORS
    # issues. The .js bundles are git-tracked (see .gitignore exceptions); the
    # large source JSON/GeoJSON stays ignored.
    def write_js(fname, varname, obj):
        with open(os.path.join(OUT_DIR, fname), "w", encoding="utf-8") as fh:
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
        print("  WARNING: data/romania-counties.geojson missing -> data/geo.js not written")

    print(f"  duplicates removed: {duplicates}")
    print(f"Wrote {len(alerts)} alerts -> data/alerts.json + data/*.js")
    print(f"  deliveries={meta['deliveries']} delivery_error={meta['delivery_error']}")
    print(f"  sent={meta['sent']} error={meta['error']} cancel={meta['cancel']}")
    print(f"  date range {meta['date_min']} .. {meta['date_max']}")
    print(f"  counties with alerts: {len(judet_counts)}")


if __name__ == "__main__":
    main()

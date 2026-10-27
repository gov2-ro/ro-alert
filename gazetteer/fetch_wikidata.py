#!/usr/bin/env python3
"""Fetch Romanian localities with a SIRUTA code (P843) from Wikidata into localities.csv.

Standard library only. Run once; commit the CSV. The build (build_data.py) reads the CSV
offline. Wikidata data is CC0.

Columns: siruta, name, key, county, lat, lon, type, qid
  - name: Romanian label
  - key:  upper case, no diacritics, no punctuation, single spaces (same as build_data.name_key)
  - county: Romanian label of the county (instance of Q1776764), found by walking P131 parents
  - type: Romanian label of the P31 classes, joined with "|"
Items without coordinates or without a county are kept, with empty fields, so that the
coverage can be measured.

Usage:  python3 gazetteer/fetch_wikidata.py
"""
import collections
import csv
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

ENDPOINT = "https://query.wikidata.org/sparql"
UA = "ro-alert-gazetteer/0.1 (https://github.com/gov2-ro/ro-alert; one-off gazetteer fetch)"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "localities.csv")

# Simple queries, joined in Python: the P131+ path query times out on the endpoint.
Q_ITEMS = """
SELECT ?item ?siruta ?label ?coord WHERE {
  ?item wdt:P843 ?siruta .
  OPTIONAL { ?item wdt:P625 ?coord . }
  OPTIONAL { ?item rdfs:label ?label . FILTER(LANG(?label) = "ro") }
}
"""
Q_TYPES = """
SELECT ?item ?typeLabel WHERE {
  ?item wdt:P843 ?siruta ; wdt:P31 ?type .
  ?type rdfs:label ?typeLabel . FILTER(LANG(?typeLabel) = "ro")
}
"""
Q_PARENTS = """
SELECT ?item ?parent WHERE { ?item wdt:P843 ?siruta ; wdt:P131 ?parent . }
"""
Q_COUNTIES = """
SELECT ?c ?label WHERE {
  ?c wdt:P31 wd:Q1776764 ; rdfs:label ?label . FILTER(LANG(?label) = "ro")
}
"""


def name_key(s):
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^A-Za-z0-9]+", " ", s)
    return s.upper().strip()


def run(query):
    url = ENDPOINT + "?" + urllib.parse.urlencode({"query": query, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.load(r)["results"]["bindings"]
        except Exception as e:  # noqa: BLE001
            print("  retry", attempt, e, file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    raise SystemExit("Wikidata query failed")


def qid(b, k):
    return b[k]["value"].rsplit("/", 1)[-1] if k in b else ""


def main():
    items = {}
    for b in run(Q_ITEMS):
        q = qid(b, "item")
        it = items.setdefault(q, {"siruta": b["siruta"]["value"], "name": "", "lat": "", "lon": "",
                                  "county": "", "type": set()})
        if "label" in b:
            it["name"] = b["label"]["value"]
        m = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", b["coord"]["value"]) if "coord" in b else None
        if m and not it["lat"]:
            it["lon"], it["lat"] = m.group(1), m.group(2)
    print("items", len(items))
    for b in run(Q_TYPES):
        if qid(b, "item") in items:
            items[qid(b, "item")]["type"].add(b["typeLabel"]["value"])
    parents = collections.defaultdict(set)
    for b in run(Q_PARENTS):
        parents[qid(b, "item")].add(qid(b, "parent"))
    counties = {qid(b, "c"): b["label"]["value"] for b in run(Q_COUNTIES)}
    print("counties", len(counties))
    for q, it in items.items():
        seen, todo = set(), [q]
        found = set()
        while todo:
            x = todo.pop()
            if x in seen:
                continue
            seen.add(x)
            if x in counties:
                found.add(counties[x])
                continue
            todo.extend(parents.get(x, ()))
        it["county"] = "|".join(sorted(found))
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["siruta", "name", "key", "county", "lat", "lon", "type", "qid"])
        for q, it in sorted(items.items(), key=lambda kv: (kv[1]["siruta"], kv[0])):
            w.writerow([it["siruta"], it["name"], name_key(it["name"]), it["county"],
                        it["lat"], it["lon"], "|".join(sorted(it["type"])), q])
    print("wrote", len(items), "items ->", OUT)


if __name__ == "__main__":
    main()

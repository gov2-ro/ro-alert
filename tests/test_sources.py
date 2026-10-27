"""Offline validation gates of the build (audit 02, checks P08 and P11).

Each test builds a small snapshot in a temporary folder, from the committed workbook
fixtures or from hand-made CSV rows, and runs `build_data.build()` on it.
"""
import csv
import io
import json
import os
import unittest

from support import FIXTURES, IngestCase, book_bytes
import build_data
import ingest
import wbfactory as w


class BuildCase(IngestCase):
    def ingest_fixtures(self, *names):
        code, _, err = self.run_ingest("--offline", *[os.path.join(FIXTURES, n) for n in names])
        self.assertEqual(code, 0, err)

    def build(self):
        saved = build_data.SRC_DIR
        build_data.SRC_DIR = self.sources
        try:
            return build_data.build()
        finally:
            build_data.SRC_DIR = saved

    def write_month(self, month, rows, shape="R", columns=None, **entry):
        """Write sources/<month>.csv and a manifest entry for it."""
        columns = columns or list(rows[0].keys())
        with open(os.path.join(self.sources, month + ".csv"), "wb") as f:
            f.write(ingest.csv_bytes(columns, rows))
        m = self.manifest() if os.path.exists(ingest.MANIFEST) else []
        m = [e for e in m if e["month"] != month]
        m.append({"month": month, "shape": shape, "rows": len(rows), "grand_total": None,
                  "warnings": [], "columns": columns, **entry})
        with open(ingest.MANIFEST, "w", encoding="utf-8") as f:
            json.dump(m, f)

    def row(self, i=1, **over):
        r = {"Nume si data alerta": "ISU TEST - alerta %d" % i, "Initiator alerta": "ISUAB",
             "Risc principal": "Altele", "Risc asociat": "Alte riscuri",
             "Data trimitere": "2030/04/%02d 09:00:00" % i, "Status trimitere": "SENT",
             "Lista poligoane": "", "Continut mesaj": "Mesaj de test %d." % i}
        r.update(over)
        return r

    def assertBuildFails(self, *needles):
        with self.assertRaises(build_data.SourceError) as cm:
            self.build()
        for n in needles:
            self.assertIn(n, str(cm.exception))


class Conservation(BuildCase):
    def test_p08_rows_are_conserved_as_deliveries_including_retries_and_cancel(self):
        self.ingest_fixtures("detail-2030-03.xls", "report-2030-04.xlsx", "summary-2030-01.xls",
                             "summary-2030-02-zero.xlsx")
        b = self.build()
        self.assertEqual(len(b["alerts"]), 3 + 3)
        self.assertEqual(sum(len(a["deliveries"]) for a in b["alerts"]), 4 + 3)
        self.assertEqual(sum(1 for a in b["alerts"] if a["is_cancel"]), 1)
        a = next(a for a in b["alerts"] if a["title"] == "ISU TEST - alerta A")
        self.assertEqual([d["status"] for d in a["deliveries"]], ["SENT", "ERROR"])
        self.assertTrue(a["status_ok"])

    def test_p08_zero_summary_is_an_official_zero_not_a_missing_month(self):
        self.ingest_fixtures("summary-2030-02-zero.xlsx", "report-2030-04.xlsx")
        months = {m["key"]: m for m in self.build()["meta"]["months"]}
        self.assertEqual(months["2030-02"]["alerts"], 0)
        self.assertTrue(months["2030-02"]["official"])

    def test_p08_reordered_columns_build_the_same_alerts(self):
        self.ingest_fixtures("detail-2030-03.xls")
        a = self.build()["alerts"]
        os.remove(os.path.join(self.sources, "2030-03.csv"))
        os.remove(ingest.MANIFEST)
        self.ingest_fixtures("detail-2030-03-reordered.xlsx")
        b = self.build()["alerts"]
        strip = lambda alerts: [{k: v for k, v in x.items() if k != "id"} for x in alerts]
        self.assertEqual(strip(a), strip(b))


class RowChecks(BuildCase):
    def test_p08_invalid_date_fails_with_file_and_line(self):
        self.write_month("2030-04", [self.row(1), self.row(2, **{"Data trimitere": "31/13/2030"})])
        self.assertBuildFails("2030-04.csv line 3", "Data trimitere", "31/13/2030")

    def test_p08_invalid_creation_and_expiry_dates_fail_too(self):
        r = self.row(1, **{"Data creare": "nope", "Data expirare": ""})
        self.write_month("2030-04", [r])
        self.assertBuildFails("Data creare")

    def test_p08_unsupported_status_fails_and_unknown_or_empty_pass(self):
        self.write_month("2030-04", [self.row(1, **{"Status trimitere": "CANCEL"})])
        self.assertBuildFails("unsupported Status trimitere", "line 2")
        self.write_month("2030-04", [self.row(1, **{"Status trimitere": "UNKNOWN"}),
                                     self.row(2, **{"Status trimitere": ""}),
                                     self.row(3, **{"Status trimitere": "error"})])
        b = self.build()
        self.assertEqual([a["status_ok"] for a in b["alerts"]], [None, None, False])

    def test_p08_conflicting_duplicate_ids_are_fatal_with_both_references(self):
        cols = list(self.row().keys()) + ["Identificator unic"]
        self.write_month("2030-04", [self.row(1, **{"Identificator unic": "X1"}),
                                     self.row(2, **{"Identificator unic": "X1"})], columns=cols)
        self.assertBuildFails("conflicting duplicate alert id X1", "2030-04.csv:2", "2030-04.csv:3")

    def test_p08_identical_duplicates_are_reported_and_conserved(self):
        cols = list(self.row().keys()) + ["Identificator unic"]
        r = self.row(1, **{"Identificator unic": "X1"})
        self.write_month("2030-04", [r, dict(r), self.row(2, **{"Identificator unic": "X2"})], columns=cols)
        b = self.build()
        self.assertEqual(len(b["alerts"]), 2)
        self.assertEqual(len(b["duplicates"]), 1)
        self.assertIn("2030-04.csv:3 repeats 2030-04.csv:2", b["duplicates"][0])


class ManifestChecks(BuildCase):
    def test_malformed_or_missing_manifest_is_fatal(self):
        self.write_month("2030-04", [self.row(1)])
        with open(ingest.MANIFEST, "w") as f:
            f.write("{not json")
        self.assertBuildFails("not valid JSON")
        os.remove(ingest.MANIFEST)
        self.assertBuildFails("cannot be read")
        with open(ingest.MANIFEST, "w") as f:
            json.dump({"month": "2030-04"}, f)
        self.assertBuildFails("must be a list")

    def test_month_keys_must_be_unique_and_valid(self):
        self.write_month("2030-04", [self.row(1)])
        m = self.manifest()
        with open(ingest.MANIFEST, "w") as f:
            json.dump(m + m, f)
        self.assertBuildFails("two entries for month 2030-04")
        m[0]["month"] = "2030-4"
        with open(ingest.MANIFEST, "w") as f:
            json.dump(m, f)
        self.assertBuildFails("no valid month")

    def test_summary_only_month_has_no_detail_records(self):
        self.write_month("2030-04", [self.row(1)], shape="S")
        self.assertBuildFails("summary-only", "stale CSV")

    def test_csv_and_manifest_must_agree(self):
        self.write_month("2030-04", [self.row(1), self.row(2)])
        m = self.manifest()
        m[0]["rows"] = 5
        with open(ingest.MANIFEST, "w") as f:
            json.dump(m, f)
        self.assertBuildFails("has 2 rows, the manifest says 5")
        self.write_month("2030-05", [self.row(1)])
        m = self.manifest()
        m[0]["rows"] = 2
        with open(ingest.MANIFEST, "w") as f:
            json.dump(m, f)
        os.remove(os.path.join(self.sources, "2030-04.csv"))
        self.assertBuildFails("no sources/2030-04.csv")

    def test_grand_total_mismatch_needs_its_warning(self):
        self.write_month("2030-08", [self.row(1), self.row(2)], grand_total=1)
        self.assertBuildFails("Grand Total 1 differs from 2 rows")
        self.write_month("2030-08", [self.row(1), self.row(2)], grand_total=1,
                         warnings=["Grand Total 1 differs from row count 2"])
        b = self.build()
        self.assertEqual(b["meta"]["sources"][0]["warnings"], ["Grand Total 1 differs from row count 2"])

    def test_unfinished_transaction_blocks_the_build(self):
        self.write_month("2030-04", [self.row(1)])
        os.makedirs(os.path.join(self.sources, ".ingest-txn"))
        self.assertBuildFails("unfinished ingest transaction")


class Provenance(BuildCase):
    def test_p11_two_builds_have_equal_hashes_and_meta(self):
        self.ingest_fixtures("report-2030-04.xlsx", "summary-2030-01.xlsx")
        a, b = self.build(), self.build()
        self.assertEqual(json.dumps(a["meta"], sort_keys=True), json.dumps(b["meta"], sort_keys=True))
        meta = a["meta"]
        self.assertEqual(meta["schema_version"], 1)
        inputs = meta["inputs"]
        self.assertEqual(list(inputs), sorted(inputs))
        self.assertEqual(sorted(inputs["sources"]), ["sources/2030-04.csv"])
        self.assertEqual(list(inputs["builder"]), ["build_data.py"])
        self.assertEqual(list(inputs["geometry"]), ["geometry/romania-counties.geojson"])
        self.assertTrue(all(k.startswith("gazetteer/") for k in inputs["gazetteer"]))
        self.assertNotIn("checked_at", json.dumps(meta))

    def test_p11_a_changed_source_changes_only_its_hash(self):
        self.ingest_fixtures("report-2030-04.xlsx")
        h1 = self.build()["meta"]["inputs"]
        self.assertEqual(self.build()["meta"]["inputs"], h1)
        self.write_month("2030-04", [self.row(1)])
        h2 = self.build()["meta"]["inputs"]
        self.assertNotEqual(h1["sources"], h2["sources"])
        self.assertEqual(h1["builder"], h2["builder"])
        self.assertEqual(h1["geometry"], h2["geometry"])

    def test_fetch_time_shows_in_meta_sources_and_never_in_alerts(self):
        self.ingest_fixtures("report-2030-04.xlsx")
        b1 = self.build()
        m = self.manifest()
        m[0]["fetched_at"] = "2031-01-01T00:00:00Z"
        with open(ingest.MANIFEST, "w") as f:
            json.dump(m, f)
        b2 = self.build()
        self.assertEqual(b1["slim"], b2["slim"])
        self.assertNotEqual(b1["meta"]["sources"][0]["fetched_at"], b2["meta"]["sources"][0]["fetched_at"])


if __name__ == "__main__":
    unittest.main()

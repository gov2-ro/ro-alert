"""Ingest reliability (audit 02, checks P01 and P03-P08, ingest part).

Every test runs in a temporary workspace with a fake CKAN service. No network, no live corpus.
Run: python3 -m unittest discover -s tests -p 'test_*.py'
"""
import csv
import io
import json
import os
import shutil
import sys
import unittest

from support import (ROOT, FIXTURES, IngestCase, book_bytes, fixture_bytes, tree)
import ingest
import wbfactory as w

TITLE = "Mesaje RO-ALERT luna %s 2030"


def detail_book(month_no, title_month="iunie", **kw):
    return w.detail_book("2030/%02d" % month_no, **kw)


class Seeded(IngestCase):
    """A workspace with one report month (2030-04) ingested through the fake CKAN."""

    def setUp(self):
        super().setUp()
        self.ckan.add("aaaaaaaa-0000-0000-0000-000000000001", TITLE % "aprilie",
                      fixture_bytes("report-2030-04.xlsx"))
        code, _, _ = self.run_ingest()
        self.assertEqual(code, 0)


class NoChange(Seeded):
    def test_p01_no_change_exits_zero_and_changes_no_tracked_file(self):
        before = self.snapshot()
        code, res, out, err = self.result()
        self.assertEqual(code, 0)
        self.assertEqual(res["status"], "no_change")
        self.assertEqual(res["changed_months"], [])
        self.assertIn("no new data", out)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual([n for n in os.listdir(self.sources) if n.startswith(".")], [])

    def test_p07_refresh_with_equal_bytes_changes_no_tracked_file(self):
        before = self.snapshot()
        code, res, out, _ = self.result(["--refresh"])
        self.assertEqual(code, 0)
        self.assertEqual(res["status"], "no_change")
        self.assertEqual([o["outcome"] for o in res["outcomes"]], ["unchanged"])
        self.assertEqual(self.snapshot(), before)

    def test_p07_refresh_detects_changed_bytes_with_unchanged_metadata(self):
        rid = "aaaaaaaa-0000-0000-0000-000000000001"
        self.ckan.add(rid, TITLE % "aprilie", book_bytes(w.report_book(
            "Mesaje RO-ALERT - luna aprilie 2030", "2030/04", n=4)))  # same last_modified
        before = self.snapshot()
        code, res, _, _ = self.result()
        self.assertEqual((code, res["status"]), (0, "no_change"), "metadata unchanged: no download")
        self.assertEqual(self.snapshot(), before)
        code, res, _, _ = self.result(["--refresh"])
        self.assertEqual((code, res["status"], res["changed_months"]), (0, "changed", ["2030-04"]))
        entry = self.manifest()[0]
        self.assertEqual(entry["rows"], 4)
        self.assertTrue(entry["fetched_at"])

    def test_checked_at_is_written_to_the_ignored_status_file_only(self):
        with open(ingest.STATUS_FILE, encoding="utf-8") as f:
            status = json.load(f)
        self.assertIn("checked_at", status)
        self.assertNotIn("checked_at", json.dumps(self.manifest()))

    def test_fetched_at_is_set_for_new_content_only(self):
        e = self.manifest()[0]
        self.assertTrue(e["fetched_at"].endswith("Z"))
        for k in ("resource_id", "url", "last_modified", "sha256"):
            self.assertTrue(e[k], k)
        before = self.snapshot()
        self.run_ingest("--refresh")
        self.assertEqual(self.snapshot(), before)


class AllOrNothing(IngestCase):
    def test_p03_valid_job_plus_invalid_job_commits_neither(self):
        # seed with the real corpus snapshot, so the earlier snapshot can be rebuilt afterwards
        shutil.rmtree(self.sources)
        shutil.copytree(os.path.join(ROOT, "sources"), self.sources)
        before = self.snapshot()
        bad = w.report_book("Mesaje RO-ALERT - luna mai 2031", "2031/05")
        bad["Raport"][2][6] = "not a date"
        self.ckan.add("bbbbbbbb-0000-0000-0000-000000000001", TITLE % "aprilie",
                      fixture_bytes("report-2030-04.xlsx"))
        self.ckan.add("cccccccc-0000-0000-0000-000000000001", TITLE % "mai", book_bytes(bad))
        code, res, _, err = self.result()
        self.assertEqual(code, 1)
        self.assertIn("cccccccc-0000-0000-0000-000000000001", err)
        self.assertIn("invalid Data trimitere", err)
        self.assertIn("example.invalid", err, "the diagnostic names the URL")
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(res["status"], "failed")
        # the earlier snapshot still rebuilds
        import build_data
        saved = build_data.SRC_DIR
        build_data.SRC_DIR = self.sources
        try:
            built = build_data.build()
        finally:
            build_data.SRC_DIR = saved
        self.assertEqual(len(built["alerts"]), 3385)

    def test_rejects_unknown_shape_and_missing_required_header_with_resource_context(self):
        cases = {
            "shape": {"Other": [["x"]]},
            "no-content-header": {"Message_Details": [[], ["Nume si data alerta", "Data trimitere"]]},
            "no-date-header": {"Message_Details": [[], ["Nume si data alerta", "Continut mesaj"]]},
        }
        for name, book in cases.items():
            with self.subTest(name):
                self.ckan.resources = []
                self.ckan.add("dddddddd-0000-0000-0000-000000000001", TITLE % "iunie", book_bytes(book))
                before = self.snapshot()
                code, _, err = self.run_ingest()
                self.assertEqual(code, 1)
                self.assertIn("dddddddd-0000-0000-0000-000000000001", err)
                self.assertIn("https://example.invalid", err)
                self.assertEqual(self.snapshot(), before)

    def test_ckan_failure_and_download_failure_exit_one(self):
        self.ckan.add("eeeeeeee-0000-0000-0000-000000000001", TITLE % "iunie", b"x")
        self.ckan.success = False
        code, _, err = self.run_ingest()
        self.assertEqual(code, 1)
        self.assertIn("CKAN reported failure", err)
        self.ckan.success = True
        self.ckan.resources[0]["url"] += "-gone"  # listed URL no longer served
        orig = self.ckan.http_get

        def flaky(url):
            if url.endswith("-gone"):
                raise IOError("connection reset")
            return orig(url)
        ingest.http_get = flaky
        code, _, err = self.run_ingest()
        self.assertEqual(code, 1)
        self.assertIn("connection reset", err)

    def test_discovery_follows_pages(self):
        ingest.PAGE_ROWS = 2
        for i in range(5):
            self.ckan.add("f%07d-0000-0000-0000-000000000001" % i, TITLE % "aprilie", b"x",
                          dataset="ds%d" % i)
        found = ingest.list_resources()
        self.assertEqual(len(found), 5)
        self.assertGreater(len(self.ckan.requests), 2)


class Transactions(Seeded):
    def revise_two_months(self):
        """Resource 1 changes content (revised); resource 2 is a new month."""
        self.ckan.add("aaaaaaaa-0000-0000-0000-000000000001", TITLE % "aprilie",
                      book_bytes(w.report_book("Mesaje RO-ALERT - luna aprilie 2030", "2030/04", n=4)),
                      last_modified="2030-02-01T00:00:00")
        self.ckan.add("aaaaaaaa-0000-0000-0000-000000000002", TITLE % "martie",
                      fixture_bytes("detail-2030-03.xls"))

    def test_p04_replacement_failure_restores_the_snapshot(self):
        self.revise_two_months()
        before = self.snapshot()

        def boom(i):
            if i == 1:
                raise RuntimeError("disk full")
        ingest._FAULT = boom
        code, res, _, err = self.result()
        self.assertEqual(code, 1)
        self.assertIn("disk full", err)
        self.assertEqual(self.snapshot(), before)
        self.assertFalse(os.path.exists(ingest.txn_dir()))

    def test_p04_interrupted_transaction_is_recovered_on_the_next_run(self):
        self.revise_two_months()
        before = self.snapshot()

        class Killed(BaseException):
            pass

        def kill(i):
            if i == 1:
                raise Killed()
        ingest._FAULT = kill
        with self.assertRaises(Killed):
            self.run_ingest()
        ingest._FAULT = None
        self.assertTrue(os.path.exists(ingest.txn_dir()), "the journal stays after a kill")
        self.assertNotEqual(self.snapshot_without_txn(), before, "files are half-written")
        # the builder refuses to read a half-written snapshot
        import build_data
        saved = build_data.SRC_DIR
        build_data.SRC_DIR = self.sources
        try:
            with self.assertRaises(build_data.SourceError) as cm:
                build_data.build()
        finally:
            build_data.SRC_DIR = saved
        self.assertIn("unfinished ingest transaction", str(cm.exception))
        # the next ingest run restores the snapshot, then continues with the same job
        code, _, err = self.run_ingest()
        self.assertEqual(code, 0)
        self.assertIn("restored the earlier snapshot", err)
        self.assertFalse(os.path.exists(ingest.txn_dir()))

    def snapshot_without_txn(self):
        return {k: v for k, v in self.snapshot().items() if not k.startswith(".")}

    def test_p04_recover_alone_restores_the_exact_snapshot(self):
        self.revise_two_months()
        before = self.snapshot()

        class Killed(BaseException):
            pass

        def kill(i):
            raise Killed()
        ingest._FAULT = kill
        with self.assertRaises(Killed):
            self.run_ingest()
        ingest._FAULT = None
        self.assertIn("restored", ingest.recover())
        self.assertEqual(self.snapshot(), before)

    def test_p04_unreadable_journal_is_refused(self):
        os.makedirs(os.path.join(ingest.txn_dir(), "backup"))
        with open(os.path.join(ingest.txn_dir(), "journal.json"), "w") as f:
            f.write("{broken")
        before = self.snapshot()
        with self.assertRaises(ingest.IngestError):
            ingest.recover()
        code, _, err = self.run_ingest()
        self.assertEqual(code, 1)
        self.assertIn("unreadable", err)
        self.assertEqual(self.snapshot(), before)

    def test_p04_incomplete_backup_without_journal_is_discarded(self):
        os.makedirs(os.path.join(ingest.txn_dir(), "backup"))
        before = {k: v for k, v in self.snapshot().items()}
        self.assertIn("incomplete", ingest.recover())
        self.assertEqual(self.snapshot(), before)


class Revisions(IngestCase):
    RID = "99999999-0000-0000-0000-000000000001"

    def serve(self, book, lm):
        self.ckan.add(self.RID, TITLE % "iunie", book_bytes(book), last_modified=lm)

    def csv_rows(self):
        p = os.path.join(self.sources, "2030-06.csv")
        if not os.path.exists(p):
            return None
        with open(p, encoding="utf-8", newline="") as f:
            return list(csv.DictReader(f))

    def test_p05_detail_to_summary_removes_stale_rows_and_summary_to_detail_adds_once(self):
        self.serve(w.detail_book("2030/06"), "2030-06-01")
        code, res, _, _ = self.result()
        self.assertEqual((code, res["changed_months"]), (0, ["2030-06"]))
        self.assertEqual(len(self.csv_rows()), 4)

        self.serve(w.summary_book("Mesaje RO-ALERT - luna iunie 2030", [("Altele", "Alte riscuri", 4)], 4),
                   "2030-06-02")
        code, res, _, _ = self.result()
        self.assertEqual(code, 0)
        self.assertEqual(res["changed_months"], ["2030-06"])
        self.assertEqual(res["outcomes"][0]["kind"], "detail_to_summary")
        self.assertIsNone(self.csv_rows(), "the stale detail CSV is gone")
        self.assertEqual([e["shape"] for e in self.manifest()], ["S"])

        self.serve(w.detail_book("2030/06"), "2030-06-03")
        code, res, _, _ = self.result()
        self.assertEqual(res["outcomes"][0]["kind"], "summary_to_detail")
        self.assertEqual(len(self.csv_rows()), 4, "the expected records, once")
        self.assertEqual(len(self.manifest()), 1)
        import build_data
        build_data.check_sources({"2030-06": 4}, self.manifest())

    def test_summary_change_is_reported_as_a_changed_month(self):
        self.serve(w.summary_book("Mesaje RO-ALERT - luna iunie 2030", [("Altele", "Alte riscuri", 4)], 4), "1")
        self.result()
        self.serve(w.summary_book("Mesaje RO-ALERT - luna iunie 2030", [("Altele", "Alte riscuri", 5)], 5), "2")
        code, res, _, _ = self.result()
        self.assertEqual((code, res["changed_months"], res["outcomes"][0]["kind"]),
                         (0, ["2030-06"], "summary_changed"))

    def test_metadata_only_change_updates_last_modified_not_the_csv(self):
        self.serve(w.detail_book("2030/06"), "1")
        self.run_ingest()
        csv_before = tree(self.sources)["2030-06.csv"]
        self.ckan.resources[0]["last_modified"] = "2"
        code, res, _, _ = self.result()
        self.assertEqual(res["outcomes"][0]["outcome"], "metadata")
        self.assertEqual(tree(self.sources)["2030-06.csv"], csv_before)
        self.assertEqual(self.manifest()[0]["last_modified"], "2")

    def test_accepted_august_warning_is_marked_and_a_new_warning_is_not(self):
        self.ckan.add("77777777-0000-0000-0000-000000000001", TITLE % "mai",
                      fixture_bytes("report-2030-05-mismatch.xlsx"))
        code, res, _, err = self.result()
        self.assertEqual(code, 0)
        self.assertEqual([x["accepted"] for x in res["warnings"]], [False])
        self.assertNotIn("[accepted]", err)
        self.assertIn(("2026-08", "Grand Total 556 differs from row count 557"), ingest.ACCEPTED_WARNINGS)


class DuplicateResources(IngestCase):
    A = "aaaaaaaa-1111-0000-0000-000000000001"
    B = "bbbbbbbb-1111-0000-0000-000000000001"

    def test_p06_identical_resources_collapse_and_order_does_not_matter(self):
        data = fixture_bytes("report-2030-04.xlsx")
        results = []
        for order in ((self.A, self.B), (self.B, self.A)):
            shutil.rmtree(self.sources)
            os.makedirs(self.sources)
            self.ckan.resources = []
            for rid in order:
                self.ckan.add(rid, TITLE % "aprilie", data, dataset="ds-" + rid[:4])
            code, _, err = self.run_ingest()
            self.assertEqual(code, 0, err)
            m = self.manifest()
            self.assertEqual(len(m), 1)
            self.assertEqual(m[0]["resource_id"], self.A, "the lowest resource id wins")
            self.assertEqual(m[0]["duplicate_resource_ids"], [self.B])
            m[0].pop("fetched_at")
            results.append((m, tree(self.sources)["2030-04.csv"]))
        self.assertEqual(results[0], results[1])
        before = self.snapshot()
        code, _, _ = self.run_ingest()
        self.assertEqual((code, self.snapshot()), (0, before), "the next run changes nothing")

    def conflicting(self, order):
        self.ckan.resources = []
        datas = {self.A: fixture_bytes("report-2030-04.xlsx"),
                 self.B: book_bytes(w.report_book("Mesaje RO-ALERT - luna aprilie 2030", "2030/04", n=4))}
        for rid in order:
            self.ckan.add(rid, TITLE % "aprilie", datas[rid], dataset="ds-" + rid[:4])

    def test_p06_conflicting_resources_give_an_actionable_error(self):
        for order in ((self.A, self.B), (self.B, self.A)):
            self.conflicting(order)
            before = self.snapshot()
            code, _, err = self.run_ingest()
            self.assertEqual(code, 1)
            for needle in (self.A, self.B, "example.invalid", "resource_choices.json", "2030-04"):
                self.assertIn(needle, err)
            self.assertEqual(self.snapshot(), before)

    def test_p06_a_local_choice_resolves_the_conflict_in_either_order(self):
        outcomes = []
        for order in ((self.A, self.B), (self.B, self.A)):
            shutil.rmtree(self.sources)
            os.makedirs(self.sources)
            with open(ingest.CHOICES, "w") as f:
                json.dump({"2030-04": self.B}, f)
            self.conflicting(order)
            code, _, err = self.run_ingest()
            self.assertEqual(code, 0, err)
            m = self.manifest()
            self.assertEqual([e["resource_id"] for e in m], [self.B])
            outcomes.append(tree(self.sources)["2030-04.csv"])
        self.assertEqual(outcomes[0], outcomes[1])
        with open(os.path.join(self.sources, "2030-04.csv"), encoding="utf-8") as f:
            self.assertEqual(len(list(csv.DictReader(f))), 4)


class OfflineAndShapes(IngestCase):
    """P08: all three shapes with both readers, and changing column order."""

    def load(self, name):
        entry, rows = ingest.parse_file(os.path.join(FIXTURES, name))
        return entry, rows

    def test_p08_every_shape_and_reader(self):
        want = {"detail-2030-03.xls": ("D", "2030-03", 4), "report-2030-04.xls": ("R", "2030-04", 3),
                "report-2030-04.xlsx": ("R", "2030-04", 3), "summary-2030-01.xls": ("S", "2030-01", 0),
                "summary-2030-01.xlsx": ("S", "2030-01", 0), "detail-2030-03-reordered.xlsx": ("D", "2030-03", 4)}
        for name, (shape, month, rows) in want.items():
            with self.subTest(name):
                e, r = self.load(name)
                self.assertEqual((e["shape"], e["month"], len(r)), (shape, month, rows))

    def test_p08_summary_totals_including_zero(self):
        e, _ = self.load("summary-2030-01.xlsx")
        self.assertEqual((e["grand_total"], sum(i[2] for i in e["summary"])), (7, 7))
        z, _ = self.load("summary-2030-02-zero.xlsx")
        self.assertEqual((z["grand_total"], z["summary"], z["warnings"]), (0, [], []))

    def test_p08_reordered_columns_give_the_same_rows(self):
        _, a = self.load("detail-2030-03.xls")
        e, b = self.load("detail-2030-03-reordered.xlsx")
        self.assertEqual(a, b)
        self.assertNotEqual(e["columns"], self.load("detail-2030-03.xls")[0]["columns"])

    def test_p08_missing_required_header_is_rejected_by_name(self):
        for missing in ("Data trimitere", "Nume si data alerta", "Continut mesaj"):
            with self.subTest(missing):
                header = [h for h in w.DETAIL_HEADER if h != missing]
                rows = [[c for h, c in zip(w.DETAIL_HEADER, r) if h != missing] for r in w.detail_rows("2030/03")]
                data = book_bytes(w.detail_book(header=header, rows=rows))
                p = os.path.join(self.tmp, "x.xlsx")
                with open(p, "wb") as f:
                    f.write(data)
                with self.assertRaises(ingest.IngestError) as cm:
                    ingest.parse_file(p, TITLE % "martie")
                self.assertIn(missing, str(cm.exception))

    def test_offline_mode_ingests_fixtures_and_a_second_run_changes_nothing(self):
        paths = [os.path.join(FIXTURES, n) for n in
                 ("detail-2030-03.xls", "report-2030-04.xls", "summary-2030-01.xls")]
        code, _, err = self.run_ingest("--offline", *paths)
        self.assertEqual(code, 0, err)
        self.assertEqual(sorted(e["month"] for e in self.manifest()), ["2030-01", "2030-03", "2030-04"])
        self.assertEqual(sorted(n for n in os.listdir(self.sources) if n.endswith(".csv")),
                         ["2030-03.csv", "2030-04.csv"])
        before = self.snapshot()
        code, out, _ = self.run_ingest("--offline", *paths)
        self.assertEqual((code, self.snapshot()), (0, before))
        self.assertIn("no new data", out)


if __name__ == "__main__":
    unittest.main()

"""Risk classification (audit 01, checks A01, A02, A03, A04).

Run: python3 -m unittest discover -s tests -p 'test_*.py'
"""
import json
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import build_data  # noqa: E402
from build_data import classify_risk, has_bear_word, risk_category  # noqa: E402

NAT = "Riscuri Naturale - Fenomene meteorologice periculoase"
ANIMAL_ADVICE = "Pastrati distanta fata de animal. Protejati animalele din gospodarie. Keep away from the bear."


def load_bundle(name, var):
    with open(os.path.join(ROOT, "data", name), encoding="utf-8") as f:
        text = f.read()
    prefix = "window.%s=" % var
    assert text.startswith(prefix)
    return json.loads(text[len(prefix):].rstrip().rstrip(";"))


class StructuredRisk(unittest.TestCase):
    """A01: a recognized structured risk wins over the free text."""

    def test_storm_with_animal_advice_stays_meteo(self):
        self.assertEqual(classify_risk(NAT, "Furtuni", ANIMAL_ADVICE), ("Meteo", "asociat:meteo"))

    def test_flood_with_animal_advice_stays_flood(self):
        self.assertEqual(risk_category(NAT, "Inundatii", ANIMAL_ADVICE), "Inundații")

    def test_blizzard_and_heavy_snow_are_meteo(self):
        self.assertEqual(risk_category(NAT, "Viscol", "urs"), "Meteo")
        self.assertEqual(risk_category(NAT, "Caderi masive de zapada", "urs"), "Meteo")

    def test_missing_child(self):
        self.assertEqual(risk_category("Altele", "Copii disparuti", ANIMAL_ADVICE), "Copil dispărut")

    def test_air_warning(self):
        p = "Riscuri si amenintari la adresa securitatii nationale"
        self.assertEqual(risk_category(p, "Atac aerian", "x"), "Atac aerian / dronă")

    def test_pollution_with_bear_text_is_technological(self):
        p = "Riscuri Tehnologice - Poluari ape"
        self.assertEqual(classify_risk(p, "Care pun in pericol viata oamenilor", ANIMAL_ADVICE),
                         ("Tehnologic", "principal:tehnologic"))

    def test_technology_principal_with_non_breaking_spaces(self):
        p = "Riscuri Tehnologice - Accidente,\xa0\xa0avarii si\xa0\xa0explozii in activitati"
        self.assertEqual(risk_category(p, "De transport\xa0si depozitare produse periculoase", "x"), "Tehnologic")

    def test_fire_principal(self):
        self.assertEqual(risk_category("Incendii", "Vegetatie", "x"), "Incendiu")

    def test_specific_associated_risk_beats_fire_principal(self):
        self.assertEqual(risk_category("Incendii", "Inundatii", "x"), "Inundații")

    def test_animal_risk(self):
        self.assertEqual(risk_category("Altele", "Animale periculoase", "x"), "Animale periculoase")

    def test_case_and_accents_are_ignored(self):
        self.assertEqual(risk_category("ALTELE", "COPII DISPĂRUȚI".replace("Ț", "T"), "x"), "Copil dispărut")
        self.assertEqual(risk_category(NAT, "  furtuni ", "x"), "Meteo")

    def test_unknown_stays_other(self):
        self.assertEqual(classify_risk("Altele", "Alte riscuri", "Test de sistem"), ("Altele", "none"))
        self.assertEqual(risk_category(None, None, None), "Altele")


class BearWords(unittest.TestCase):
    """A02: `urs` matches only as a whole bear word."""

    FALSE = ["sursele", "hours", "downpours", "detours", "watercourses"]
    GENUINE = ["Un urs a fost vazut", "ursul", "ursului", "URSII", "ursilor", "ursoaica cu pui",
               "Ursoaicele", "A bear was seen", "Two bears were seen", "urșii"]

    def test_false_substrings_do_not_match(self):
        for w in self.FALSE:
            with self.subTest(word=w):
                self.assertFalse(has_bear_word("In %s of the area" % w))
                self.assertEqual(risk_category("Altele", "Alte riscuri", "In %s of the area" % w), "Altele")

    def test_genuine_bear_words_match(self):
        for w in self.GENUINE:
            with self.subTest(word=w):
                self.assertTrue(has_bear_word(w))
                self.assertEqual(risk_category("Altele", "Alte riscuri", w), "Animale periculoase")

    def test_drone_text_fallback(self):
        self.assertEqual(risk_category("Altele", "Alte riscuri", "Fragmente de drona cazute"), "Atac aerian / dronă")


class Corpus(unittest.TestCase):
    """A03, A04 on the tracked bundles."""

    @classmethod
    def setUpClass(cls):
        cls.alerts = load_bundle("alerts.js", "ALERTS")
        cls.meta = load_bundle("meta.js", "META")

    def test_counts_are_unchanged(self):
        a, m = self.alerts, self.meta
        self.assertEqual(len(a), 3385)
        self.assertEqual(sum(len(x["deliveries"]) for x in a), 3618)
        self.assertEqual(sum(1 for x in a for d in x["deliveries"] if d["status"] == "ERROR"), 196)
        self.assertEqual(sum(1 for x in a if x["status_ok"] is False), 1)
        self.assertEqual(sum(1 for x in a if x["is_cancel"]), 21)
        self.assertEqual((m["total"], m["deliveries"], m["delivery_error"], m["error"], m["cancel"]),
                         (3385, 3618, 196, 1, 21))

    def test_august_warning_is_kept(self):
        aug = [s for s in self.meta["sources"] if s["month"] == "2026-08"][0]
        self.assertTrue(aug["warnings"])

    def test_no_structured_risk_is_overridden_by_text(self):
        expected = {"Furtuni": "Meteo", "Viscol": "Meteo", "Caderi masive de zapada": "Meteo",
                    "Inundatii": "Inundații", "Animale periculoase": "Animale periculoase",
                    "Copii disparuti": "Copil dispărut", "Atac aerian": "Atac aerian / dronă"}
        seen = 0
        for x in self.alerts:
            cat = expected.get(x.get("risc_asociat"))
            if cat:
                seen += 1
                self.assertEqual(x["risk_category"], cat, x["id"])
        self.assertGreater(seen, 3000)

    def test_categories_are_known_facet_values(self):
        known = {"Animale periculoase", "Copil dispărut", "Atac aerian / dronă", "Meteo", "Inundații",
                 "Incendiu", "Tehnologic", "Securitate națională", "Altele"}
        self.assertLessEqual({x["risk_category"] for x in self.alerts}, known)


class ErrorReporting(unittest.TestCase):
    """Part C: `meta.months[].error_reporting`."""

    def test_values(self):
        months = {m["key"]: m for m in load_bundle("meta.js", "META")["months"]}
        for key, m in months.items():
            if m.get("official"):
                self.assertEqual(m["error_reporting"], "not_applicable", key)
            elif m["delivery_errors"] > 0:
                self.assertEqual(m["error_reporting"], "observed", key)
            else:
                self.assertEqual(m["error_reporting"], "unknown", key)
        self.assertEqual(months["2026-04"]["error_reporting"], "observed")
        self.assertEqual(months["2026-05"]["error_reporting"], "unknown")
        self.assertEqual(months["2025-09"]["error_reporting"], "not_applicable")
        self.assertIn("reports_errors", months["2026-04"])


if __name__ == "__main__":
    unittest.main()

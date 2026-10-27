"""Message language and place fields (audit 03, checks S05 data part, S09, S10).

Run: python3 -m unittest discover -s tests -p 'test_*.py'
"""
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import build_data  # noqa: E402

RO = "Pericol de inundatii. Daca sunteti intr-o zona inundabila, indreptati-va spre locurile de refugiu. Respectati masurile dispuse de autoritati."
EN = "Danger of flood. If you are in an area prone to flooding, go to the nearest safety place. Follow the measures provided by the authorities."


class SplitLanguages(unittest.TestCase):
    def test_romanian_only(self):
        lang, ro, en = build_data.split_languages(RO)
        self.assertEqual((lang, ro, en), ("ro", RO, None))

    def test_english_only_is_not_labelled_romanian(self):
        msg = ("On 09.02.2026, the presence of Clostridium Perfringens was detected in the water "
               "distributed through the SC Aquaterm AG 98 SA network. The use of the water for human "
               "consumption is PROHIBITED. Please use only water from sources provided by the authorities.")
        lang, ro, en = build_data.split_languages(msg)
        self.assertEqual(lang, "en")
        self.assertIsNone(ro)
        self.assertEqual(en, msg)

    def test_mixed_splits_and_rebuilds_the_original_exactly(self):
        for sep in (" ", "\n\n", "  \n"):
            msg = RO + sep + EN
            lang, ro, en = build_data.split_languages(msg)
            self.assertEqual(lang, "mixed")
            self.assertEqual(ro, RO)
            self.assertEqual(en, EN)
            self.assertEqual(msg, ro + sep + en)

    def test_english_heading_without_function_words_stays_with_its_text(self):
        msg = (RO + " ISU IASI\nWeather alert - HEAVY RAIN. Period of manifestation 27.08.2026. "
               "Avoid travel, follow the measures provided by the authorities.")
        lang, ro, en = build_data.split_languages(msg)
        self.assertEqual(lang, "mixed")
        self.assertTrue(ro.endswith("ISU IASI"))
        self.assertTrue(en.startswith("Weather alert"))

    def test_short_or_unclear_text_is_unknown_and_not_lost(self):
        for msg in ("Test 112", "ISU GORJ", "x"):
            lang, ro, en = build_data.split_languages(msg)
            self.assertEqual((lang, ro, en), ("unknown", None, None))
        self.assertEqual(build_data.split_languages(""), ("unknown", None, None))
        self.assertEqual(build_data.split_languages(None), ("unknown", None, None))

    def test_third_language_text_is_not_forced_into_a_split(self):
        msg = "Maradjon tavol az allattol. Ovja a haztartasaban levo allatokat, de ne tegye ki veszelynek magat."
        lang, ro, en = build_data.split_languages(msg)
        self.assertEqual(lang, "unknown")


class CompactionKeepsTheOriginal(unittest.TestCase):
    def alert(self, lang, msg, ro, en):
        return {"id": "x", "msg": msg, "msg_ro": ro, "msg_en": en, "message_language": lang,
                "places": [], "sent_at": None}

    def test_every_language_class_round_trips_through_msg_parts(self):
        cases = [
            self.alert("ro", RO, RO, None),
            self.alert("en", EN, None, EN),
            self.alert("mixed", RO + " " + EN, RO, EN),
            self.alert("mixed", RO + "\n\n" + EN, RO, EN),
            self.alert("unknown", "Test 112", None, None),
        ]
        slim, omitted, kept = build_data.compact_alerts(cases)
        # the original is dropped when it can be rebuilt, and kept otherwise
        self.assertNotIn("msg", slim[0])
        self.assertNotIn("msg", slim[1])
        self.assertNotIn("msg", slim[2])
        self.assertEqual(slim[3]["msg_sep"], "\n\n")
        self.assertEqual(slim[4]["msg"], "Test 112")
        self.assertEqual(kept, 1)


class Corpus(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.b = build_data.build()
        cls.alerts = cls.b["alerts"]

    def test_s09_original_text_is_preserved_in_every_record(self):
        for a in self.alerts:
            lang, ro, en = a["message_language"], a["msg_ro"], a["msg_en"]
            self.assertIn(lang, ("ro", "en", "mixed", "unknown"), a["id"])
            self.assertTrue(a["msg"], a["id"])
            if lang == "ro":
                self.assertEqual((ro, en), (a["msg"], None), a["id"])
            elif lang == "en":
                self.assertEqual((ro, en), (None, a["msg"]), a["id"])
            elif ro and en:
                self.assertTrue(a["msg"].startswith(ro) and a["msg"].endswith(en), a["id"])
                self.assertTrue(a["msg"][len(ro):len(a["msg"]) - len(en)].strip() == "", a["id"])
            else:
                self.assertEqual((ro, en), (None, None), a["id"])

    def test_s09_the_english_only_example(self):
        a = next(x for x in self.alerts if x["id"] == "60e0361757e4")
        self.assertTrue(a["msg"].startswith("On 09.02.2026"))
        self.assertEqual(a["message_language"], "en")
        self.assertIsNone(a["msg_ro"])
        self.assertEqual(a["msg_en"], a["msg"])

    def test_s10_language_counts_in_meta(self):
        counts = self.b["meta"]["message_languages"]
        self.assertEqual(sum(counts.values()), 3385)
        self.assertEqual(counts["en"], 4)

    def test_s10_every_resolved_place_has_a_county_and_keeps_the_old_fields(self):
        n = 0
        for a in self.alerts:
            for p in a["places"]:
                n += 1
                self.assertEqual(list(p)[:4], ["name", "siruta", "lat", "lon"])
                self.assertTrue(p["county"], p)
        self.assertGreater(n, 1000)

    def test_s05_toplita_in_harghita_has_a_canonical_county_and_23_alerts(self):
        hits = [a for a in self.alerts if any(p["siruta"] == 83641 for p in a["places"])]
        self.assertEqual(len(hits), 23)
        names = {(p["name"], p["county"]) for a in hits for p in a["places"] if p["siruta"] == 83641}
        self.assertEqual(names, {("Toplița", "Harghita")})

    def test_locations_do_not_depend_on_the_language_fix(self):
        # the extraction input is the earlier splitter's Romanian half; see build()
        a = next(x for x in self.alerts if x["id"] == "9483912b17c5")
        self.assertTrue(any(l["type"] == "street" for l in a["locations"]))


if __name__ == "__main__":
    unittest.main()

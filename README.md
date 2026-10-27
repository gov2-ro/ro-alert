# RO-ALERT Dashboard



&rarr; [lab.gov2.ro/ro-alert](https://lab.gov2.ro/ro-alert/) – _POC (Proof of Concept)_

---

Sursă date: [data.gov.ro / IGSU](https://data.gov.ro/ro/dataset?q=mesaje+ro-alert&organization=inspectoratul-general-pentru-situatii-de-urgenta)

![Ro-Alert dashboard](repository/lab.gov2.ro_ro-alert.png)

Vezi și: [RO-ALERT, februarie–iulie 2026](https://mariuscomper.uk/ro-alert/) — analiza lui Marius Comper pe aceleași date IGSU.

## Tests

The tests need no network. Run them from the repository root.

- Python (standard library only): `python3 -m unittest discover -s tests -p 'test_*.py'`
- JavaScript without a browser (Node 20 or later): `node --test tests/js/*.test.cjs`
- Time zone check: `TZ=UTC node --test tests/js/*.test.cjs`, then the same command with
  `TZ=Europe/Bucharest` and `TZ=America/New_York`.
- Browser smoke test from `file://` (development only): run `npm install` once. It installs
  `playwright-core` and downloads no browser. Then run `node tests/browser/smoke.cjs`. The test
  uses the installed Google Chrome. Set `CHROME_PATH` when Chrome is in another place. Set
  `SHOTS=/some/folder` to save screenshots.

`python3 tools/risk_change_report.py OLD_ALERTS_JSON` compares two builds by alert ID and writes
`data/risk_changes.csv` (ignored by Git).

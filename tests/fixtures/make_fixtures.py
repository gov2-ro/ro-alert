"""Regenerate the committed workbook fixtures in tests/fixtures/workbooks/.

Development only. Needs openpyxl and xlwt (`pip install xlwt`). CI does not run it: the
tests read the committed files. Run from the repository root:
  python3 tests/fixtures/make_fixtures.py
Each fixture holds synthetic text only.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import wbfactory as w  # noqa: E402

OUT = os.path.join(HERE, "workbooks")
os.makedirs(OUT, exist_ok=True)

SUM_ITEMS = [("Altele", "Alte riscuri", 3), ("Altele", "Animale periculoase", 4)]
ORDER = [11, 9, 8, 7, 6, 5, 4, 3, 2, 1, 10, 0]  # a different column order, same names

books = {
    # shape D, XLS reader: one row per delivery, with a retry and a CANCEL
    "detail-2030-03.xls": ("xls", w.detail_book("2030/03")),
    # shape D, XLSX reader, columns reordered
    "detail-2030-03-reordered.xlsx": ("xlsx", w.detail_book(
        "2030/03", *w.reorder(w.DETAIL_HEADER, w.detail_rows("2030/03"), ORDER)[:1],
        rows=w.reorder(w.DETAIL_HEADER, w.detail_rows("2030/03"), ORDER)[1])),
    # shape R, both readers
    "report-2030-04.xls": ("xls", w.report_book("Mesaje RO-ALERT - luna aprilie 2030", "2030/04")),
    "report-2030-04.xlsx": ("xlsx", w.report_book("Mesaje RO-ALERT - luna aprilie 2030", "2030/04")),
    # shape R, Grand Total differs from the row count (warning)
    "report-2030-05-mismatch.xlsx": ("xlsx", w.report_book(
        "Mesaje RO-ALERT - luna mai 2030", "2030/05", n=3, total=2)),
    # shape S, both readers; and a valid zero summary
    "summary-2030-01.xls": ("xls", w.summary_book("Mesaje RO-ALERT - luna ianuarie 2030", SUM_ITEMS, 7)),
    "summary-2030-01.xlsx": ("xlsx", w.summary_book("Mesaje RO-ALERT - luna ianuarie 2030", SUM_ITEMS, 7)),
    "summary-2030-02-zero.xlsx": ("xlsx", w.summary_book("Mesaje RO-ALERT - luna februarie 2030", [], 0)),
}
for name, (kind, book) in books.items():
    (w.write_xls if kind == "xls" else w.write_xlsx)(os.path.join(OUT, name), book)
    print("wrote", name)

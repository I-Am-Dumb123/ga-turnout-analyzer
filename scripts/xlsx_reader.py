"""Tiny standard-library .xlsx reader (no pandas/openpyxl needed)."""
import re
import zipfile
import xml.etree.ElementTree as ET

_NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def _col_index(ref):
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n - 1


def read_xlsx(fileobj):
    """Return {sheet_path: [[cell text, ...], ...]} with whitespace-trimmed strings."""
    z = zipfile.ZipFile(fileobj)
    names = z.namelist()
    strings = []
    if "xl/sharedStrings.xml" in names:
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.findall("m:si", _NS):
            strings.append("".join(t.text or "" for t in si.iter(f"{{{_NS['m']}}}t")))
    sheets = {}
    for name in sorted(n for n in names if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", n)):
        root = ET.fromstring(z.read(name))
        rows = []
        for row in root.iter(f"{{{_NS['m']}}}row"):
            cells = {}
            for c in row.findall("m:c", _NS):
                v = c.find("m:v", _NS)
                if c.get("t") == "s" and v is not None:
                    val = strings[int(v.text)]
                elif c.get("t") == "inlineStr":
                    val = "".join(t.text or "" for t in c.iter(f"{{{_NS['m']}}}t"))
                else:
                    val = v.text if v is not None else ""
                cells[_col_index(c.get("r"))] = " ".join((val or "").split())
            width = max(cells) + 1 if cells else 0
            rows.append([cells.get(i, "") for i in range(width)])
        sheets[name] = rows
    return sheets

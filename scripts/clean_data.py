#!/usr/bin/env python3
"""Build public/data/turnout.csv from the Georgia SoS raw files in data/raw/.

Output columns: county, year, age_group, registered, ballots_cast

Inputs (see README "Adding new election data"):
  data/raw/<year>/*Gender_Age.zip            SoS "Voter Turnout by Demographics" age report
                                             (one .xlsx per county; 2018 and earlier)
  data/raw/<year>/*_county_age.csv           output of scripts/fetch_2022_qlik.mjs
                                             (SoS Data Hub; 2022 and later)

If data/raw has no usable files, a clearly labeled SAMPLE dataset is written instead.
Standard library only: run with `python3 scripts/clean_data.py` (add --sample to force sample data).
"""
import csv
import glob
import io
import json
import os
import random
import sys
import zipfile
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from xlsx_reader import read_xlsx  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
OUT_DIR = os.path.join(ROOT, "public", "data")
OUT_CSV = os.path.join(OUT_DIR, "turnout.csv")
OUT_META = os.path.join(OUT_DIR, "meta.json")
COUNTIES_JSON = os.path.join(ROOT, "scripts", "ga_counties.json")

AGE_GROUPS = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"]

# Source age bracket -> standard bracket. Both SoS sources use 5-year brackets that
# nest cleanly inside the standard 10-year groups, so no splitting is needed.
AGE_MAP = {
    "18-24": "18-24",
    "25-29": "25-34", "30-34": "25-34",
    "35-39": "35-44", "40-44": "35-44", "35-40": "35-44", "40-45": "35-44",
    "45-49": "45-54", "50-54": "45-54", "45-50": "45-54", "50-55": "45-54",
    "55-59": "55-64", "60-64": "55-64", "55-60": "55-64", "60-65": "55-64",
    "65-OVER": "65+", "65-70": "65+", "70-75": "65+", "75-80": "65+", "80-85": "65+",
    "85-90": "65+", "90-95": "65+", "95-100": "65+", "100+": "65+",
}

# Certified statewide ballots cast (SoS certified results), used for the totals check.
CERTIFIED_BALLOTS = {2018: 3_949_905, 2022: 3_964_926}
TOLERANCE = 0.005  # 0.5%

problems = []


def warn(msg):
    problems.append(msg)
    print(f"  ! {msg}")


def load_counties():
    with open(COUNTIES_JSON) as f:
        return json.load(f)  # [{"code": "001", "fips": "13001", "name": "Appling"}, ...]


def parse_sos_age_zip(path, year, code_to_name):
    """SoS age report: zip of per-county xlsx; rows = age break, last 3 cols = TOTAL Reg #/Voted/%."""
    out = {}
    source_totals = {"registered": 0, "ballots_cast": 0}
    z = zipfile.ZipFile(path)
    for name in z.namelist():
        if not name.lower().endswith(".xlsx"):
            continue
        rows = next(iter(read_xlsx(io.BytesIO(z.read(name))).values()))
        header = next((r for r in rows if r and r[0] == "AGE BREAK"), None)
        if header is None or "TOTAL VOTERS" not in header:
            warn(f"{year} {name}: unexpected layout (no AGE BREAK / TOTAL VOTERS header)")
            continue
        reg_col = header.index("TOTAL VOTERS")
        for r in rows[rows.index(header) + 1:]:
            if len(r) <= reg_col + 1 or r[0] == "":
                continue
            src_age, code = r[0], r[1].zfill(3)
            if src_age not in AGE_MAP:
                warn(f"{year} {name}: unknown age bracket '{src_age}'")
                continue
            if code not in code_to_name:
                warn(f"{year} {name}: unknown county code '{code}'")
                continue
            reg, voted = int(float(r[reg_col] or 0)), int(float(r[reg_col + 1] or 0))
            key = (code_to_name[code], AGE_MAP[src_age])
            acc = out.setdefault(key, [0, 0])
            acc[0] += reg
            acc[1] += voted
            source_totals["registered"] += reg
            source_totals["ballots_cast"] += voted
    return out, source_totals


def parse_qlik_csv(path, year, code_to_name):
    """CSV written by fetch_2022_qlik.mjs. Uses all_registered (active + inactive) to match 2018."""
    out = {}
    source_totals = None
    unmatched_ballots = 0
    with open(path, newline="") as f:
        lines = f.readlines()
    for line in lines:
        if line.startswith("# STATEWIDE_TOTALS"):
            active, allreg, ballots = (int(x) for x in line.split("=")[1].strip().split("|"))
            source_totals = {"registered": allreg, "ballots_cast": ballots}
    for r in csv.DictReader(l for l in lines if not l.startswith("#")):
        code = r["county_code"].zfill(3)
        if r["age_group"] in ("-", ""):
            unmatched_ballots += int(r["ballots_cast"])
            continue
        if r["age_group"] not in AGE_MAP:
            warn(f"{year}: unknown age bracket '{r['age_group']}'")
            continue
        if code not in code_to_name:
            warn(f"{year}: unknown county code '{code}'")
            continue
        key = (code_to_name[code], AGE_MAP[r["age_group"]])
        acc = out.setdefault(key, [0, 0])
        acc[0] += int(r["all_registered"])
        acc[1] += int(r["ballots_cast"])
    if unmatched_ballots:
        print(f"  note: {year}: {unmatched_ballots:,} ballots had no matching registration/age record "
              "in the SoS snapshot and are excluded from age-group counts")
    return out, source_totals


def make_sample(counties):
    """Deterministic fake data so the app works before real files exist. Labeled SAMPLE in the UI."""
    rng = random.Random(42)
    base = {"18-24": 0.30, "25-34": 0.38, "35-44": 0.50, "45-54": 0.60, "55-64": 0.68, "65+": 0.74}
    share = {"18-24": 0.11, "25-34": 0.17, "35-44": 0.16, "45-54": 0.16, "55-64": 0.16, "65+": 0.24}
    data = {}
    for c in counties:
        size = int(rng.lognormvariate(9.8, 1.1))
        bump = rng.uniform(-0.08, 0.08)
        for year in (2018, 2022):
            ydrift = rng.uniform(-0.04, 0.03) if year == 2022 else 0
            yd = data.setdefault(year, {})
            for ag in AGE_GROUPS:
                reg = max(30, int(size * share[ag] * rng.uniform(0.85, 1.15)))
                rate = min(0.95, max(0.08, base[ag] + bump + ydrift + rng.uniform(-0.05, 0.05)))
                yd[(c["name"], ag)] = [reg, int(reg * rate)]
    return data


def validate(data, counties, source_totals, is_sample):
    names = {c["name"] for c in counties}
    for year, rows in sorted(data.items()):
        present = {k[0] for k in rows}
        missing = names - present
        if missing:
            warn(f"{year}: {len(missing)} counties missing: {', '.join(sorted(missing)[:10])}")
        for (county, ag), (reg, bal) in rows.items():
            if reg <= 0:
                warn(f"{year} {county} {ag}: registered is {reg}")
                continue
            rate = bal / reg
            if not 0 <= rate <= 1:
                warn(f"{year} {county} {ag}: turnout rate {rate:.3f} outside 0-1 "
                     f"({bal} ballots / {reg} registered)")
        for c in counties:
            got = {k[1] for k in rows if k[0] == c["name"]}
            if c["name"] in present and got != set(AGE_GROUPS):
                warn(f"{year} {c['name']}: missing age groups {sorted(set(AGE_GROUPS) - got)}")
        if is_sample:
            continue
        tot_reg = sum(v[0] for v in rows.values())
        tot_bal = sum(v[1] for v in rows.values())
        st = source_totals.get(year)
        if st:
            for label, ours, theirs in (("registered", tot_reg, st["registered"]),
                                        ("ballots_cast", tot_bal, st["ballots_cast"])):
                diff = (ours - theirs) / theirs
                status = "ok" if abs(diff) <= TOLERANCE else "MISMATCH"
                print(f"  {year} {label}: {ours:,} vs source statewide {theirs:,} ({diff:+.2%}) {status}")
                if status != "ok":
                    warn(f"{year} {label} differs from source statewide total by {diff:+.2%}")
        if year in CERTIFIED_BALLOTS:
            cert = CERTIFIED_BALLOTS[year]
            diff = (tot_bal - cert) / cert
            status = "ok" if abs(diff) <= TOLERANCE else "MISMATCH"
            print(f"  {year} ballots_cast: {tot_bal:,} vs certified {cert:,} ({diff:+.2%}) {status}")
            if status != "ok":
                warn(f"{year} ballots_cast differs from certified total by {diff:+.2%}")


def main():
    counties = load_counties()
    code_to_name = {c["code"]: c["name"] for c in counties}
    data, source_totals, sources = {}, {}, []

    force_sample = "--sample" in sys.argv
    year_dirs = [] if force_sample else sorted(glob.glob(os.path.join(RAW, "[12][0-9][0-9][0-9]")))
    for year_dir in year_dirs:
        year = int(os.path.basename(year_dir))
        age_zips = glob.glob(os.path.join(year_dir, "*Gender_Age.zip"))
        qlik_csvs = glob.glob(os.path.join(year_dir, "*_county_age.csv"))
        if age_zips:
            print(f"{year}: reading {os.path.basename(age_zips[0])}")
            rows, tot = parse_sos_age_zip(age_zips[0], year, code_to_name)
            sources.append({"year": year, "file": os.path.basename(age_zips[0]),
                            "publisher": "Georgia Secretary of State – Voter Turnout by Demographics",
                            "registered_definition": "active + inactive"})
        elif qlik_csvs:
            print(f"{year}: reading {os.path.basename(qlik_csvs[0])}")
            rows, tot = parse_qlik_csv(qlik_csvs[0], year, code_to_name)
            sources.append({"year": year, "file": os.path.basename(qlik_csvs[0]),
                            "publisher": "Georgia Secretary of State – Election Data Hub (Turnout & Demographics)",
                            "registered_definition": "active + inactive"})
        else:
            print(f"{year}: no recognized files in {year_dir}, skipping")
            continue
        data[year] = rows
        if tot:
            source_totals[year] = tot

    is_sample = not data
    if is_sample:
        print("No raw files found in data/raw – writing SAMPLE DATA (fake numbers, for demo only).")
        data = make_sample(counties)

    print("Checks:")
    validate(data, counties, source_totals, is_sample)

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT_CSV, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["county", "year", "age_group", "registered", "ballots_cast"])
        for year in sorted(data):
            for c in counties:
                for ag in AGE_GROUPS:
                    if (c["name"], ag) in data[year]:
                        reg, bal = data[year][(c["name"], ag)]
                        w.writerow([c["name"], year, ag, reg, bal])

    meta = {
        "is_sample": is_sample,
        "generated": date.today().isoformat(),
        "years": sorted(data),
        "sources": sources,
        "problems": problems,
    }
    with open(OUT_META, "w") as f:
        json.dump(meta, f, indent=2)

    print(f"Wrote {OUT_CSV}")
    print(f"{len(problems)} problem(s) found." if problems else "All checks passed.")


if __name__ == "__main__":
    main()

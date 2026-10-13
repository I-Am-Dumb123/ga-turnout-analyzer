# Georgia County Turnout Analyzer

**Live site: https://amogh-nootigattu.github.io/ga-turnout-analyzer/**

A nonpartisan static web app showing how likely each age group is to vote in each of
Georgia's 159 counties in governor-year (midterm) general elections, 2018 and 2022.

It uses **aggregate, public data only**: counts of registered voters and ballots cast
by county and age group. No individual voter records are stored or shipped.

Features:
- County map (choropleth) of turnout rate, filtered by age group and election
- Click a county to compare its turnout by age group with the statewide average
- Sortable, searchable table of every county: rate, 2018→2022 change, and gap vs. statewide
- "Biggest opportunities": top 15 county + age-group pairs below the statewide rate,
  ranked by registered × (1 − rate)
- One-click 2-page PDF report ([example](docs/example-report.pdf))

## Quick start

You need [Node.js](https://nodejs.org) 18+ and Python 3 (already on macOS). No Python packages are required.

```bash
npm install          # once
npm run dev          # open the URL it prints (http://localhost:5173)
```

The cleaned data (`public/data/turnout.csv`) is already committed, so the app works right away.

## Data

| Election | Source | Raw file in `data/raw/` |
|---|---|---|
| Nov 6, 2018 general | Georgia SoS [Voter Turnout by Demographics](https://sos.ga.gov/page/georgia-election-results) bulk zip → `2010-2019/General Election 2018/November 2018 Active, Inactive Voters by Race, Gender_Age.zip` | `2018/…Gender_Age.zip` (159 county `.xlsx` sheets) |
| Nov 8, 2022 general | Georgia SoS [Data Hub – Nov 8, 2022 General Election](https://sos.ga.gov/data-hub-november-8-2022-general-election) (Turnout & Demographics dashboard) | `2022/ga_2022_general_county_age.csv` |

**Why two different sources?** The SoS bulk "Voter Turnout by Demographics" zip stops at
the January 2021 runoff, so it has no 2022 file. The 2022 numbers come from the SoS's own
public Data Hub dashboard. `scripts/fetch_2022_qlik.mjs` asks that dashboard for
**grouped totals only** (county × age group: registered voters and ballots accepted),
using the dashboard's own measure definitions. It never downloads individual rows.
The result is saved in `data/raw/2022/`, so the app keeps working even if the SoS changes or
removes that dashboard later. You only need the script again to refresh or add an election.

### Definitions and choices

- **Registered = active + inactive voters.** This is what the 2018 SoS report counts, so 2022
  uses the same definition to keep the years comparable. (The SoS dashboard's headline
  "% turnout" divides by *active* voters only, which gives about 56.9% for 2022 statewide.
  This app shows about 50.6%. The fetch script saves both counts if you ever want the active-only version.)
- **Age groups.** Both sources use 5-year brackets that fit exactly inside the app's groups.
  No proportional splitting is needed:

  | App group | 2018 SoS brackets | 2022 Data Hub brackets |
  |---|---|---|
  | 18-24 | 18-24 | 18-24 |
  | 25-34 | 25-29, 30-34 | 25-29, 30-34 |
  | 35-44 | 35-39, 40-44 | 35-40, 40-45 (labels as published; they mean 35-39, 40-44) |
  | 45-54 | 45-49, 50-54 | 45-50, 50-55 |
  | 55-64 | 55-59, 60-64 | 55-60, 60-65 |
  | 65+ | 65-OVER | 65-70 … 95-100, 100+ |

- **2022 voter snapshot.** The Data Hub's voter list is as of the Oct 11, 2022 registration
  deadline. 6,115 ballots (0.15%) had no matching age record and are left out of the
  age-group figures.
- **2026 estimate** = simple average of the 2018 and 2022 rates. It is not a prediction model.

### Checks (printed every time `clean_data.py` runs)

- Every turnout rate is between 0 and 1
- All 159 counties and all 6 age groups are present for each year
- Statewide totals match the source's own statewide totals and the certified ballot counts within 0.5%

Current results:

```
2018 registered:   7,006,952 vs source 7,006,952  (+0.00%) ok
2018 ballots_cast: 3,948,948 vs certified 3,949,905 (-0.02%) ok
2022 registered:   7,813,860 vs source 7,819,975  (-0.08%) ok
2022 ballots_cast: 3,955,915 vs certified 3,964,926 (-0.23%) ok
```

## Adding new election data (e.g., 2026)

1. Make a folder `data/raw/<year>/`.
2. Put the data in it, using **either** format:
   - **SoS age report zip** (same layout as 2018): a zip whose name ends in `Gender_Age.zip`,
     containing one `.xlsx` per county with an `AGE BREAK` column and a `TOTAL VOTERS`
     (`Reg #`, `Voted`, `%`) block. Download it from the SoS Election Results page in a normal browser.
   - **Data Hub CSV**: copy `scripts/fetch_2022_qlik.mjs`, change the `APP` id to the new
     election's dashboard app, and change `OUT` to the new year folder. The app id is in
     the dashboard page's `js/main.js` under `Turnout.appId`. Then run it with `node`.
3. If the new file uses an age bracket the script hasn't seen, add it to `AGE_MAP` in
   `scripts/clean_data.py`. Add the certified ballot total to `CERTIFIED_BALLOTS`.
4. Run `npm run data` (same as `python3 scripts/clean_data.py`) and read the checks it prints.
5. The app picks up every year in the CSV automatically. "Change" always compares the
   first and last years present.

To preview the app with fake numbers, run `python3 scripts/clean_data.py --sample`. The app
then shows a **SAMPLE DATA** banner. Run it again without `--sample` to go back to the real data.

## Project layout

```
data/raw/                 raw source files (2018 SoS zips, 2022 Data Hub CSV)
scripts/clean_data.py     raw → public/data/turnout.csv + meta.json, runs the checks
scripts/xlsx_reader.py    tiny standard-library .xlsx reader
scripts/fetch_2022_qlik.mjs  pulls 2022 county × age totals from the SoS Data Hub
scripts/build_geo.mjs     builds county GeoJSON from Census cartographic boundaries (us-atlas)
public/data/              files the website loads at runtime
src/                      app code (D3 map, Chart.js bars, table, PDF report)
```

## Deploy

`npm run build` creates a static site in `dist/`. It uses relative paths, so it works under any URL.

**GitHub Pages:** push this repo to GitHub. Then go to *Settings → Pages → Source* and
choose **GitHub Actions**. The included workflow (`.github/workflows/deploy.yml`) builds
and publishes on every push to `main`.

**Netlify:** "Add new site → Import from Git" and pick the repo. `netlify.toml` already sets
the build command (`npm run build`) and publish folder (`dist`). You can also drag the `dist/` folder onto app.netlify.com/drop.

## Nonpartisan statement

This tool shows turnout only. It does not use party registration, vote choice, or any
individual-level data. Its colors are neutral (teal and amber, never red or blue).

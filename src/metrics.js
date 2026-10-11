// Pure metric helpers. Rows: { county, year, age_group, registered, ballots_cast }.

export const AGE_GROUPS = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
export const ALL_AGES = 'All ages';
export const ESTIMATE = 'est2026';

/** Index rows as idx[county][year][age_group] = { registered, ballots }. Adds ALL_AGES totals. */
export function buildIndex(rows) {
  const idx = {};
  const state = {};
  for (const r of rows) {
    const c = (idx[r.county] ??= {});
    const y = (c[r.year] ??= {});
    y[r.age_group] = { registered: r.registered, ballots: r.ballots_cast };
    const all = (y[ALL_AGES] ??= { registered: 0, ballots: 0 });
    all.registered += r.registered;
    all.ballots += r.ballots_cast;
    for (const g of [r.age_group, ALL_AGES]) {
      const s = ((state[r.year] ??= {})[g] ??= { registered: 0, ballots: 0 });
      s.registered += r.registered;
      s.ballots += r.ballots_cast;
    }
  }
  return { idx, state, counties: Object.keys(idx).sort(), years: Object.keys(state).map(Number).sort() };
}

const rateOf = (cell) => (cell && cell.registered > 0 ? cell.ballots / cell.registered : null);

/** Model wraps the index with the metrics the UI needs. `year` may be a number or ESTIMATE. */
export function createModel(rows) {
  const data = buildIndex(rows);
  const [y0, y1] = [data.years[0], data.years[data.years.length - 1]];

  const avg = (a, b) => (a == null || b == null ? null : (a + b) / 2);

  const rate = (county, year, group) => {
    if (year === ESTIMATE) return avg(rate(county, y0, group), rate(county, y1, group));
    return rateOf(data.idx[county]?.[year]?.[group]);
  };
  const stateRate = (year, group) => {
    if (year === ESTIMATE) return avg(stateRate(y0, group), stateRate(y1, group));
    return rateOf(data.state[year]?.[group]);
  };
  // Registered for the estimate uses the most recent election's rolls.
  const registered = (county, year, group) => data.idx[county]?.[year === ESTIMATE ? y1 : year]?.[group]?.registered ?? null;
  const stateRegistered = (year, group) => data.state[year === ESTIMATE ? y1 : year]?.[group]?.registered ?? null;
  const ballots = (county, year, group) => (year === ESTIMATE ? null : data.idx[county]?.[year]?.[group]?.ballots ?? null);

  const change = (county, group) => {
    const a = rate(county, y0, group), b = rate(county, y1, group);
    return a == null || b == null ? null : b - a;
  };
  const stateChange = (group) => stateRate(y1, group) - stateRate(y0, group);
  const gap = (county, year, group) => {
    const r = rate(county, year, group);
    return r == null ? null : r - stateRate(year, group);
  };

  /** Top-N county x age-group pairs below the statewide rate, by registered x (1 - rate). */
  const opportunities = (year, groupFilter = ALL_AGES, n = 15) => {
    const groups = groupFilter === ALL_AGES ? AGE_GROUPS : [groupFilter];
    const out = [];
    for (const county of data.counties) {
      for (const g of groups) {
        const r = rate(county, year, g);
        const reg = registered(county, year, g);
        if (r == null || reg == null) continue;
        const sr = stateRate(year, g);
        if (r >= sr) continue;
        out.push({ county, group: g, rate: r, stateRate: sr, registered: reg, nonVoters: Math.round(reg * (1 - r)) });
      }
    }
    return out.sort((a, b) => b.nonVoters - a.nonVoters).slice(0, n);
  };

  return { ...data, firstYear: y0, lastYear: y1, rate, stateRate, registered, stateRegistered, ballots, change, stateChange, gap, opportunities };
}

export const fmtPct = (v, d = 1) => (v == null ? '—' : `${(v * 100).toFixed(d)}%`);
export const fmtPts = (v, d = 1) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(d)} pts`);
export const fmtInt = (v) => (v == null ? '—' : Math.round(v).toLocaleString('en-US'));
export const yearLabel = (y) => (y === ESTIMATE ? '2026 estimate' : `${y} general`);

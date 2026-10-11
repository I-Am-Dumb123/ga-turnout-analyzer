import { fmtInt, fmtPct, fmtPts, ESTIMATE } from './metrics.js';

const COLS = [
  { key: 'county', label: 'County', fmt: (v) => v, type: 'text' },
  { key: 'registered', label: 'Registered', fmt: fmtInt },
  { key: 'rate', label: 'Turnout', fmt: (v) => fmtPct(v) },
  { key: 'change', label: 'Change 2018→22', fmt: (v) => fmtPts(v) },
  { key: 'gap', label: 'Gap vs state', fmt: (v) => fmtPts(v) },
  { key: 'est', label: '2026 est.', fmt: (v) => fmtPct(v) },
];

let sort = { key: 'rate', dir: -1 };

export function renderTable(table, { model, year, group, selected, filter, onSelect }) {
  const rows = model.counties.map((county) => ({
    county,
    registered: model.registered(county, year, group),
    rate: model.rate(county, year, group),
    change: model.change(county, group),
    gap: model.gap(county, year, group),
    est: model.rate(county, ESTIMATE, group),
  })).filter((r) => !filter || r.county.toLowerCase().includes(filter.toLowerCase()));

  rows.sort((a, b) => {
    const x = a[sort.key], y = b[sort.key];
    if (x == null) return 1;
    if (y == null) return -1;
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sort.dir;
  });

  const thead = table.tHead;
  thead.innerHTML = `<tr>${COLS.map((c) => {
    const s = sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none';
    return `<th scope="col" aria-sort="${s}"><button type="button" data-key="${c.key}" aria-sort="${s}">${c.label}</button></th>`;
  }).join('')}</tr>`;
  thead.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => {
    const key = btn.dataset.key;
    sort = sort.key === key ? { key, dir: -sort.dir } : { key, dir: key === 'county' ? 1 : -1 };
    renderTable(table, { model, year, group, selected, filter, onSelect });
  }));

  const tbody = table.tBodies[0];
  tbody.innerHTML = rows.map((r) => `<tr data-county="${r.county}" class="${r.county === selected ? 'selected' : ''}">${COLS.map((c) => {
    const v = r[c.key];
    const cls = (c.key === 'change' || c.key === 'gap') && v < 0 ? ' class="neg"' : '';
    return c.key === 'county' ? `<td>${v}</td>` : `<td${cls}>${c.fmt(v)}</td>`;
  }).join('')}</tr>`).join('');
  tbody.onclick = (e) => {
    const tr = e.target.closest('tr');
    if (tr) onSelect(tr.dataset.county);
  };
}

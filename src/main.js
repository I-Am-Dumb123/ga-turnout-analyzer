import * as d3 from 'd3';
import { AGE_GROUPS, ALL_AGES, ESTIMATE, createModel, fmtInt, fmtPct, fmtPts, yearLabel } from './metrics.js';
import { colorScale, drawMap, renderLegend } from './map.js';
import { renderCountyChart } from './countyChart.js';
import { renderTable } from './table.js';
import { renderOpportunities } from './opportunities.js';

const BASE = import.meta.env.BASE_URL;
const $ = (id) => document.getElementById(id);

const state = { group: ALL_AGES, year: null, county: null, filter: '' };
let model, geo, meta, svgNode;

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const theme = () => (matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light') || document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

async function init() {
  const [rows, g, m] = await Promise.all([
    d3.csv(`${BASE}data/turnout.csv`, (r) => ({ county: r.county, year: +r.year, age_group: r.age_group, registered: +r.registered, ballots_cast: +r.ballots_cast })),
    d3.json(`${BASE}data/ga_counties.geojson`),
    d3.json(`${BASE}data/meta.json`).catch(() => ({ is_sample: true, generated: '' })),
  ]);
  model = createModel(rows);
  geo = g;
  meta = m;
  state.year = model.lastYear;

  $('sample-banner').hidden = !meta.is_sample;
  $('footer-updated').textContent = meta.generated
    ? new Date(meta.generated + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';
  if (meta.is_sample) $('footer-sources').textContent = 'SAMPLE DATA (fake numbers for demonstration). Real sources: Georgia Secretary of State turnout-by-demographics data; U.S. Census Bureau county boundaries.';

  $('age-select').innerHTML = [ALL_AGES, ...AGE_GROUPS].map((a) => `<option value="${a}">${a === ALL_AGES ? a : `Age ${a}`}</option>`).join('');
  $('year-select').innerHTML = [...model.years, ESTIMATE].map((y) => `<option value="${y}">${yearLabel(y)}</option>`).join('');
  $('year-select').value = String(state.year);

  $('age-select').addEventListener('change', (e) => { state.group = e.target.value; render(); });
  $('year-select').addEventListener('change', (e) => { state.year = e.target.value === ESTIMATE ? ESTIMATE : +e.target.value; render(); });
  $('table-search').addEventListener('input', (e) => { state.filter = e.target.value; renderTableView(); });
  $('export-btn').addEventListener('click', onExport);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);

  svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgNode.setAttribute('role', 'img');
  svgNode.setAttribute('aria-label', 'Map of Georgia counties colored by turnout rate');
  $('map').appendChild(svgNode);

  render();
}

function select(county) {
  state.county = state.county === county ? null : county;
  render();
  if (state.county && matchMedia('(max-width: 860px)').matches) $('county-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function render() {
  renderKpis();
  renderMapView();
  renderCountyView();
  renderOpportunities($('opportunities'), model.opportunities(state.year, state.group), select);
  $('opp-title').textContent = `Biggest opportunities — ${state.group === ALL_AGES ? 'all age groups' : `age ${state.group}`}, ${yearLabel(state.year)}`;
  renderTableView();
}

function renderKpis() {
  const { year, group } = state;
  const r = model.stateRate(year, group);
  const reg = model.stateRegistered(year, group);
  const ch = model.stateChange(group);
  const tiles = [
    { label: `Statewide turnout · ${group}`, value: fmtPct(r), sub: yearLabel(year) },
    { label: 'Registered voters', value: fmtInt(reg), sub: year === ESTIMATE ? `${model.lastYear} rolls` : `${year} rolls` },
    { label: `Change ${model.firstYear}→${model.lastYear}`, value: fmtPts(ch), sub: `${fmtPct(model.stateRate(model.firstYear, group))} → ${fmtPct(model.stateRate(model.lastYear, group))}` },
    { label: '2026 estimate', value: fmtPct(model.stateRate(ESTIMATE, group)), sub: 'Average of 2018 & 2022 · not a forecast' },
  ];
  $('kpis').innerHTML = tiles.map((t) => `<div class="kpi"><div class="label">${t.label}</div><div class="value">${t.value}</div><div class="sub">${t.sub}</div></div>`).join('');
}

function renderMapView() {
  const { year, group } = state;
  const value = (c) => model.rate(c, year, group);
  const scale = colorScale(model.counties.map(value), theme());
  $('map-title').textContent = `Turnout rate by county — ${group === ALL_AGES ? 'all ages' : `age ${group}`}, ${yearLabel(year)}`;
  const tip = $('tooltip');
  drawMap(svgNode, geo, {
    value, color: scale, stroke: css('--map-stroke'), selected: state.county, onSelect: select, nullFill: theme() === 'dark' ? '#3a3a36' : '#d8d7d2',
    onHover: (e, c) => {
      const gap = model.gap(c, year, group);
      tip.innerHTML = `<div class="t">${c} County</div>
        <div class="r">Turnout <b>${fmtPct(value(c))}</b></div>
        <div class="r">Statewide <b>${fmtPct(model.stateRate(year, group))}</b></div>
        <div class="r">Gap <b>${fmtPts(gap)}</b></div>
        <div class="r">Registered <b>${fmtInt(model.registered(c, year, group))}</b></div>`;
      tip.hidden = false;
      const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8);
      const y = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8);
      tip.style.left = `${x}px`; tip.style.top = `${y}px`;
    },
    onLeave: () => { tip.hidden = true; },
  });
  renderLegend($('map-legend'), scale, 'Turnout', (v) => fmtPct(v, 0));
}

function renderCountyView() {
  const { year, county } = state;
  const colors = { county: css('--accent'), state: css('--compare'), ink: css('--ink'), ink2: css('--ink-2'), ink3: css('--ink-3'), grid: css('--grid'), surface: css('--surface'), border: css('--border') };
  $('county-title').textContent = county ? `${county} County` : 'Statewide';
  $('county-sub').textContent = county
    ? `Turnout by age group, ${yearLabel(year)}. ${fmtInt(model.registered(county, year, ALL_AGES))} registered · ${fmtPct(model.rate(county, year, ALL_AGES))} overall (statewide ${fmtPct(model.stateRate(year, ALL_AGES))}).`
    : `Turnout by age group, ${yearLabel(year)}. Select a county on the map or in the table to compare.`;
  renderCountyChart($('county-chart'), {
    countyLabel: county ? `${county}` : null,
    countyRates: AGE_GROUPS.map((g) => (county ? model.rate(county, year, g) : null)),
    stateRates: AGE_GROUPS.map((g) => model.stateRate(year, g)),
    colors,
  });
  $('county-legend').innerHTML = (county ? `<span><i class="sw" style="background:${colors.county}"></i>${county}</span>` : '') + `<span><i class="sw" style="background:${colors.state}"></i>Statewide average</span>`;
  $('estimate-note').hidden = year !== ESTIMATE;
}

function renderTableView() {
  $('table-title').textContent = `All counties — ${state.group === ALL_AGES ? 'all ages' : `age ${state.group}`}, ${yearLabel(state.year)}`;
  renderTable($('county-table'), { model, year: state.year, group: state.group, selected: state.county, filter: state.filter, onSelect: select });
}

async function onExport() {
  const btn = $('export-btn');
  btn.disabled = true;
  btn.textContent = 'Building PDF…';
  try {
    const { exportReport } = await import('./report.js');
    await exportReport({ model, geo, meta, year: state.year, group: state.group });
  } catch (err) {
    console.error(err);
    alert('Sorry, the PDF could not be created. See the browser console for details.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Export report (PDF)';
  }
}

init().catch((err) => {
  console.error(err);
  document.querySelector('main').insertAdjacentHTML('afterbegin', `<p class="card">Could not load data: ${err.message}. Run <code>npm run data</code> first.</p>`);
});

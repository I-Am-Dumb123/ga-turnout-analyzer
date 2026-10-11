import { fmtInt, fmtPct } from './metrics.js';

export function renderOpportunities(el, items, onSelect) {
  if (!items.length) {
    el.innerHTML = '<li style="grid-template-columns:1fr">No county is below the statewide rate for this selection.</li>';
    return;
  }
  el.innerHTML = items.map((o) => `
    <li data-county="${o.county}" tabindex="0" role="button" aria-label="${o.county} County, age ${o.group}">
      <div><div class="who">${o.county}, ${o.group}</div>
      <div class="detail">${fmtPct(o.rate)} turnout vs ${fmtPct(o.stateRate)} statewide · ${fmtInt(o.registered)} registered</div></div>
      <div class="num">${fmtInt(o.nonVoters)}<small>did not vote</small></div>
    </li>`).join('');
  el.onclick = (e) => { const li = e.target.closest('li[data-county]'); if (li) onSelect(li.dataset.county); };
  el.onkeydown = (e) => {
    const li = e.target.closest('li[data-county]');
    if (li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(li.dataset.county); }
  };
}

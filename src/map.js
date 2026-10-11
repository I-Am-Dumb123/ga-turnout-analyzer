import * as d3 from 'd3';

const W = 600, H = 680;

/** Single-hue teal ramp; low values recede toward the surface in each theme. */
export function rampFor(theme) {
  return theme === 'dark'
    ? d3.interpolateLab('#1d3b35', '#8fe6d3')
    : d3.interpolateLab('#e2f4ef', '#04463b');
}

export function colorScale(values, theme) {
  const [lo, hi] = d3.extent(values.filter((v) => v != null));
  const step = 0.05;
  const domain = lo == null ? [0, 1] : [Math.floor(lo / step) * step, Math.ceil(hi / step) * step || step];
  return d3.scaleSequential(rampFor(theme)).domain(domain).clamp(true);
}

/**
 * Draw the county choropleth into `svgNode` (an <svg>). Fill colors are written as
 * attributes so the same SVG can be handed to svg2pdf for the report.
 */
export function drawMap(svgNode, geo, { value, color, stroke = '#fcfcfb', selected, onSelect, onHover, onLeave, nullFill = '#d8d7d2' }) {
  const svg = d3.select(svgNode).attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'xMidYMid meet');
  const projection = d3.geoMercator().fitExtent([[8, 8], [W - 8, H - 8]], geo);
  const path = d3.geoPath(projection);

  svg.selectAll('path.county')
    .data(geo.features, (f) => f.id)
    .join('path')
    .attr('class', (f) => `county${f.properties.name === selected ? ' selected' : ''}`)
    .attr('d', path)
    .attr('fill', (f) => {
      const v = value(f.properties.name);
      return v == null ? nullFill : color(v);
    })
    .attr('stroke', stroke)
    .attr('stroke-width', 0.6)
    .attr('tabindex', onSelect ? 0 : null)
    .attr('role', onSelect ? 'button' : null)
    .attr('aria-label', (f) => f.properties.name + ' County')
    .on('click', (e, f) => onSelect?.(f.properties.name))
    .on('keydown', (e, f) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(f.properties.name); } })
    .on('pointermove', (e, f) => onHover?.(e, f.properties.name))
    .on('pointerleave', () => onLeave?.());

  // Keep the selected outline on top.
  svg.selectAll('path.county.selected').raise();
  return svg;
}

/** HTML legend: gradient bar + end labels. */
export function renderLegend(el, scale, label, fmt) {
  const [a, b] = scale.domain();
  const stops = d3.range(0, 1.0001, 0.1).map((t) => `${scale(a + (b - a) * t)} ${t * 100}%`).join(',');
  el.innerHTML = `<span>${label}</span><span>${fmt(a)}</span><span class="ramp" style="background:linear-gradient(90deg,${stops})"></span><span>${fmt(b)}</span><span class="nodata"><span class="sw" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#d8d7d2;vertical-align:-1px"></span> no data</span>`;
}

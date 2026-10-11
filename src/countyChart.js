import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';
import { AGE_GROUPS, fmtPct } from './metrics.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

let chart;

/** Grouped bars: county rate vs statewide rate for each age group. */
export function renderCountyChart(canvas, { countyLabel, countyRates, stateRates, colors }) {
  const datasets = [];
  if (countyLabel) {
    datasets.push({ label: countyLabel, data: countyRates.map((v) => (v == null ? null : v * 100)), backgroundColor: colors.county });
  }
  datasets.push({ label: 'Statewide', data: stateRates.map((v) => v * 100), backgroundColor: colors.state });

  const config = {
    type: 'bar',
    data: { labels: AGE_GROUPS, datasets: datasets.map((d) => ({ ...d, borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'bottom', maxBarThickness: 28, categoryPercentage: 0.7, barPercentage: 0.9 })) },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 200 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: colors.surface, titleColor: colors.ink, bodyColor: colors.ink2, borderColor: colors.border, borderWidth: 1,
          callbacks: { title: (items) => `Age ${items[0].label}`, label: (c) => ` ${c.dataset.label}: ${fmtPct(c.raw / 100)}` },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: colors.ink2 }, border: { color: colors.grid } },
        y: {
          min: 0, max: 100,
          ticks: { color: colors.ink3, callback: (v) => `${v}%`, stepSize: 25 },
          grid: { color: colors.grid }, border: { display: false },
          title: { display: true, text: 'Turnout rate', color: colors.ink3 },
        },
      },
    },
  };
  if (chart) chart.destroy();
  chart = new Chart(canvas, config);
  return chart;
}

// Builds public/data/ga_counties.geojson and scripts/ga_counties.json from the
// us-atlas package (U.S. Census Bureau cartographic boundary files, 1:10m).
// Run once: npm run geo
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve('us-atlas/counties-10m.json'), 'utf8'));
const all = feature(topo, topo.objects.counties);
const ga = all.features.filter((f) => String(f.id).startsWith('13')).sort((a, b) => a.properties.name.localeCompare(b.properties.name));

// SoS county codes are 001-159 in alphabetical order.
const counties = ga.map((f, i) => ({ code: String(i + 1).padStart(3, '0'), fips: String(f.id), name: f.properties.name }));
const round = (c) => (typeof c[0] === 'number' ? c.map((v) => Math.round(v * 1e4) / 1e4) : c.map(round));
const geo = {
  type: 'FeatureCollection',
  features: ga.map((f, i) => ({ type: 'Feature', id: f.id, properties: { name: f.properties.name, code: counties[i].code },
    geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) } })),
};
writeFileSync('public/data/ga_counties.geojson', JSON.stringify(geo));
writeFileSync('scripts/ga_counties.json', JSON.stringify(counties, null, 1));
console.log(`${ga.length} Georgia counties written`);

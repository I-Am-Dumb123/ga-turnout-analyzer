// Fetch AGGREGATE 2022 general-election turnout by county x age group from the
// Georgia SoS public "Turnout & Demographics" data hub (Qlik Cloud), because the
// SoS bulk "Voter Turnout by Demographics" zip does not include 2022.
//
// Only grouped counts are requested (no individual voter rows are ever read).
// Measures mirror the dashboard's own master measures:
//   Active Voters = Count({<VOTER_STATUS={'A'}>} REGISTRATION_NUMBER)
//   Turnout       = Sum(Ballots_Accepted_Counter)
//
// Usage: node scripts/fetch_2022_qlik.mjs  -> data/raw/2022/ga_2022_general_county_age.csv
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TENANT = 'sos-ga-gov.us.qlikcloudgov.com';
const APP = '9ac69279-6bd6-4836-b143-a56e39c47ee4'; // Nov 8, 2022 General – Turnout
const TOKEN_URL = 'https://fn4akbihvavvcmki6ih67rmuky0ezils.lambda-url.us-east-1.on.aws/';
const ORIGIN = 'https://gasos-elections-mashups-mashup-bucket.s3.amazonaws.com';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'raw', '2022', 'ga_2022_general_county_age.csv');

const { access_token } = await (await fetch(TOKEN_URL, { headers: { Origin: ORIGIN } })).json();
const ws = new WebSocket(`wss://${TENANT}/app/${APP}`, { headers: { Authorization: `Bearer ${access_token}`, Origin: ORIGIN } });
let nextId = 1;
const pending = {};
const call = (handle, method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending[id] = (m) => (m.error ? reject(new Error(`${method}: ${JSON.stringify(m.error)}`)) : resolve(m.result));
  ws.send(JSON.stringify({ jsonrpc: '2.0', id, handle, method, params }));
});
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } };
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('websocket failed')); });

const doc = (await call(-1, 'OpenDoc', { qDocName: APP })).qReturn.qHandle;
const measures = [
  "Count({<[Vote Type]=, VOTER_STATUS={'A'}>} REGISTRATION_NUMBER)", // active registered
  "Count({<[Vote Type]=>} REGISTRATION_NUMBER)",                    // active + inactive
  'Sum(Ballots_Accepted_Counter)',                                   // ballots accepted
];
const cube = (await call(doc, 'CreateSessionObject', [{
  qInfo: { qType: 'agg' },
  qHyperCubeDef: {
    qDimensions: [{ qDef: { qFieldDefs: ['COUNTY_CODE'] }, qNullSuppression: false },
                  { qDef: { qFieldDefs: ['County Name'] }, qNullSuppression: false },
                  { qDef: { qFieldDefs: ['Age Group'] }, qNullSuppression: false }],
    qMeasures: measures.map((m) => ({ qDef: { qDef: m } })),
    qSuppressZero: false, qSuppressMissing: true,
    qInitialDataFetch: [],
  },
}])).qReturn.qHandle;

const rows = [];
for (let top = 0; ; top += 1500) {
  const page = (await call(cube, 'GetHyperCubeData', ['/qHyperCubeDef', [{ qTop: top, qLeft: 0, qWidth: 6, qHeight: 1500 }]])).qDataPages[0];
  if (!page.qMatrix.length) break;
  for (const r of page.qMatrix) rows.push([r[0].qText, r[1].qText, r[2].qText, r[3].qNum, r[4].qNum, r[5].qNum]);
  if (page.qMatrix.length < 1500) break;
}
// Statewide totals straight from the app, used by clean_data.py as the check target.
const totals = (await call(doc, 'Evaluate', { qExpression: measures.map((m) => `Num(${m},'0')`).join(" & '|' & ") })).qReturn;
ws.close();

const num = (v) => (Number.isFinite(v) ? v : 0);
const csv = ['county_code,county_name,age_group,active_registered,all_registered,ballots_cast',
  ...rows.map(([c, n, a, act, all, b]) => [c, `"${n}"`, a, num(act), num(all), num(b)].join(','))];
csv.push(`# STATEWIDE_TOTALS active_registered|all_registered|ballots_cast = ${totals}`);
csv.push(`# source: Georgia SoS Data Hub – November 8, 2022 General Election (Qlik app ${APP}); fetched ${new Date().toISOString()}`);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, csv.join('\n') + '\n');
console.log(`wrote ${rows.length} rows to ${OUT}\nstatewide totals: ${totals}`);

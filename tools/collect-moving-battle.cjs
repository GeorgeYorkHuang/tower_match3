// Separate whole campaigns from controlled mid/late-stage windows; preserve every failure/time cap.
const fs = require('fs'),
  path = require('path'),
  crypto = require('crypto');
const api = require('./moving-battle-fixture.cjs');
const root = path.resolve(__dirname, '..');
const started = process.hrtime.bigint();
const seconds = () => Number(process.hrtime.bigint() - started) / 1e9;
const mode = process.argv[2] || 'campaign';
function hashes() {
  const out = [];
  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, e.name);
      if (e.isDirectory()) walk(file);
      else if (e.name.endsWith('.js'))
        out.push({
          file: path.relative(root, file).replaceAll('\\', '/'),
          sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
        });
    }
  }
  walk(root + '/js');
  return out;
}
const snapshot = hashes(),
  runs = [];
const scenarios =
  mode === 'campaign'
    ? [
        { name: 'campaign2s', cadence: 2, startWave: 1, startLevel: 1, maxSeconds: 2400 },
        { name: 'campaign4s', cadence: 4, startWave: 1, startLevel: 1, maxSeconds: 2400 },
      ]
    : [
        {
          name: 'mid31-39',
          cadence: 2,
          startWave: 31,
          startLevel: 7,
          windowEnd: 39,
          fixedLevel: true,
          maxSeconds: 600,
        },
        {
          name: 'boss40',
          cadence: 2,
          startWave: 40,
          startLevel: 13,
          windowEnd: 40,
          fixedLevel: true,
          maxSeconds: 600,
        },
        {
          name: 'boss60',
          cadence: 2,
          startWave: 60,
          startLevel: 13,
          windowEnd: 60,
          fixedLevel: true,
          maxSeconds: 600,
        },
      ];
try {
  for (const scenario of scenarios)
    for (const field of ['ancient', 'lava', 'frost'])
      for (const profile of Object.keys(api.profiles))
        for (const seed of scenario.cadence === 4 ? [41] : [41, 123]) {
          const run = api.collect({ field, profile, seed, ...scenario });
          run.scenario = scenario.name;
          runs.push(run);
          console.log(
            JSON.stringify({
              mode,
              scenario: scenario.name,
              field,
              profile,
              seed,
              end: run.terminal,
              wave: run.wave,
              hp: Math.round(run.wallHp),
              t: +run.seconds.toFixed(1),
              elapsed: +seconds().toFixed(1),
            }),
          );
          fs.writeFileSync(
            root + '/docs/moving-' + mode + '-checkpoint.json',
            JSON.stringify({ date: '2026-11-10', runs, sourceHashes: snapshot }),
          );
        }
  if (JSON.stringify(snapshot) !== JSON.stringify(hashes()))
    throw Error(
      'Game source changed during collection; keep checkpoint as mixed-source and rerun affected cases.',
    );
  fs.writeFileSync(
    root + '/docs/moving-' + mode + '-data.json',
    JSON.stringify(
      {
        date: '2026-11-10',
        mode,
        routes: api.routes,
        profiles: api.profiles,
        sourceHashes: snapshot,
        elapsedSeconds: seconds(),
        runs,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ complete: true, mode, runs: runs.length, elapsed: seconds() }));
} finally {
  api.restore();
}

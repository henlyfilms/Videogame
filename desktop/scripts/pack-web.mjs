// Zip ./web into release/marion-hq-web.zip and write release/manifest.json.
// These two files are what the in-app updater downloads from GitHub Releases.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(desktop, 'web');
const out = join(desktop, 'release');
const zip = join(out, 'marion-hq-web.zip');
const bundle = JSON.parse(readFileSync(join(web, 'bundle.json'), 'utf8'));

mkdirSync(out, { recursive: true });
rmSync(zip, { force: true });
// Files sit at the zip root (index.html, assets/, bundle.json).
execFileSync('zip', ['-q', '-r', '-X', zip, '.'], { cwd: web });

const sha256 = createHash('sha256').update(readFileSync(zip)).digest('hex');
const manifest = { ...bundle, sha256 };
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Packed build ${bundle.build} → release/marion-hq-web.zip (${sha256.slice(0, 12)}…)`);

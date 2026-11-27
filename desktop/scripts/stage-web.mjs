// Copy the Vite build (../dist) into ./web and stamp it with bundle.json.
// Run from desktop/:  node scripts/stage-web.mjs
// MARION_BUILD / MARION_COMMIT come from CI (GitHub run number / commit SHA).
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktop = join(here, '..');
const dist = join(desktop, '..', 'dist');
const web = join(desktop, 'web');
const pkg = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8'));

if (!existsSync(join(dist, 'index.html'))) {
  console.error('No ../dist/index.html — run `npm run build` in the repo root first.');
  process.exit(1);
}

let commit = process.env.MARION_COMMIT || '';
if (!commit) {
  try {
    commit = execSync('git rev-parse HEAD', { cwd: desktop }).toString().trim();
  } catch {}
}
const build = Number(process.env.MARION_BUILD || 0);
const bundle = {
  build,
  tag: build ? `build-${build}` : 'local',
  commit,
  builtAt: new Date().toISOString(),
  shellVersion: pkg.version,
};

rmSync(web, { recursive: true, force: true });
cpSync(dist, web, { recursive: true });
writeFileSync(join(web, 'bundle.json'), JSON.stringify(bundle, null, 2) + '\n');
console.log(`Staged web bundle build ${build} (${commit.slice(0, 7) || 'no commit'}) → desktop/web`);

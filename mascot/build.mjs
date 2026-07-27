// Bundles the shared mascot module into its two consumers.
//
// Deliberately two entry points rather than one universal bundle: that's what lets
// OrbitControls and the whole audio module tree-shake out of the pet build entirely.
// The pet bundle containing no audio code at all is what makes "the desktop pet can
// never make a sound" a structural guarantee rather than a promise.
//
// Note this adds a build step to DEVELOPMENT only. The Vercel deploy still runs no
// Node -- it serves the committed bundle in static/vendor/mascot/.
import * as esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = {
  web: {
    entry: 'mascot/entries/web.js',
    out: 'static/vendor/mascot/mascot.web.js',
  },
  pet: {
    entry: 'mascot/entries/pet.js',
    out: 'desktop/src/renderer/mascot.pet.js',
  },
};

// Hash every source file so the bundle can carry a fingerprint of what produced it.
// Guards against the failure mode where someone edits mascot/src, deploys, and the
// site silently keeps serving a stale ram (R6 in the plan).
function sourceHash() {
  const files = [];
  (function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|mjs)$/.test(name)) files.push(p);
    }
  })(join(ROOT, 'mascot'));

  const h = createHash('sha256');
  for (const f of files) {
    if (f.endsWith('build.mjs')) continue;
    h.update(f.slice(ROOT.length));
    h.update(readFileSync(f));
  }
  return h.digest('hex').slice(0, 12);
}

const watch = process.argv.includes('--watch');
const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (names.length === 0) names.push('web');

const hash = sourceHash();

for (const name of names) {
  const t = TARGETS[name];
  if (!t) {
    console.error(`unknown target "${name}" (expected: ${Object.keys(TARGETS).join(', ')})`);
    process.exit(1);
  }

  const options = {
    entryPoints: [join(ROOT, t.entry)],
    outfile: join(ROOT, t.out),
    bundle: true,
    format: 'esm',
    minify: !watch,
    sourcemap: watch ? 'inline' : false,
    // Safari 17 is the floor for the school's Macs; Chrome 120 covers Electron.
    target: ['safari17', 'chrome120'],
    legalComments: 'none',
    banner: {
      js: `// GENERATED -- do not edit. Source: mascot/${name} @ ${hash} built ${new Date().toISOString()}\n`
        + `// Rebuild with: npm run build:${name}`,
    },
    logLevel: 'info',
  };

  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log(`[build] watching ${name} -> ${t.out}`);
  } else {
    await esbuild.build(options);
    console.log(`[build] ${name} -> ${t.out}  (src ${hash})`);
  }
}

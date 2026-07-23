// Build the public festival app and the volunteer app into ONE folder that a
// single Azure Static Web App can serve:
//
//   out/                <- this app, statically exported
//   out/volunteer/      <- the volunteer app (built separately, base "/volunteer/")
//   out/staticwebapp.config.json
//
// This is the "both apps on one origin" shape. It needs no proxy: /volunteer is
// simply a folder. The rewrite in next.config.mjs is for the other deployment
// shape, where this app stays on Vercel and proxies through to Azure.
//
// Usage:
//   npm run build:combined
//   VOLUNTEER_DIST=path/to/web/dist/volunteer npm run build:combined
//
// The volunteer app must be built first (`npm run build --workspace web` in the
// jesus-festival repo).
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(repoRoot, 'out');

// Default assumes the two repos sit side by side, which is how they're cloned.
const volunteerDist = resolve(
  repoRoot,
  process.env.VOLUNTEER_DIST ?? '../jesus-festival/web/dist/volunteer'
);

if (!existsSync(resolve(volunteerDist, 'index.html'))) {
  console.error(
    `\nCan't find a built volunteer app at:\n  ${volunteerDist}\n\n` +
      `Build it first:\n  cd ../jesus-festival && npm run build --workspace web\n` +
      `or point VOLUNTEER_DIST at web/dist/volunteer somewhere else.\n`
  );
  process.exit(1);
}

console.log('1/3  next build (static export)');
execFileSync('npx', ['next', 'build'], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: { ...process.env, STATIC_EXPORT: '1' },
  shell: true,
});

console.log(`2/3  copying volunteer app from ${volunteerDist}`);
mkdirSync(resolve(out, 'volunteer'), { recursive: true });
cpSync(volunteerDist, resolve(out, 'volunteer'), { recursive: true });

console.log('3/3  writing staticwebapp.config.json');
writeFileSync(
  resolve(out, 'staticwebapp.config.json'),
  JSON.stringify(
    {
      // Unknown paths fall back to this app's shell. /volunteer is excluded: it
      // has no client-side router (its screens are component state, not URLs), so
      // an unknown path under it really is a 404 and shouldn't render the SPA.
      navigationFallback: {
        rewrite: '/index.html',
        exclude: ['/volunteer/*', '/_next/*', '/brand/*', '/icons/*', '/photos/*'],
      },
      mimeTypes: { '.webmanifest': 'application/manifest+json' },
      // This is a PREVIEW of a merge, not the canonical site. It must not get
      // indexed and start competing with the real jesusfestival.app, whose
      // canonical tags and sitemap this build carries verbatim.
      // DELETE THIS if the preview ever becomes the live site.
      globalHeaders: { 'X-Robots-Tag': 'noindex, nofollow' },
      routes: [
        // The volunteer PWA's manifest and service worker are both scoped
        // "/volunteer/" — the trailing slash is load-bearing.
        { route: '/volunteer', redirect: '/volunteer/', statusCode: 301 },
        { route: '/sw.js', headers: { 'Cache-Control': 'no-cache' } },
        { route: '/volunteer/sw.js', headers: { 'Cache-Control': 'no-cache' } },
        { route: '/volunteer/push-sw.js', headers: { 'Cache-Control': 'no-cache' } },
      ],
    },
    null,
    2
  ) + '\n'
);

console.log(`\nDone. Deploy with:\n  swa deploy out --deployment-token <token> --env production\n`);

/**
 * esbuild bundler for the DevChat extension.
 *  - dist/extension.js  → extension host (node platform, vscode external)
 *  - dist/webview.js    → sidebar chat UI (Preact, fully bundled IIFE)
 *  - dist/codicon.css + codicon.ttf → VS Code Codicon font for the webview
 */
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const extensionOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions} */
const webviewOptions = {
  entryPoints: ['src/views/webview/main.tsx'],
  bundle: true,
  outfile: 'dist/webview.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  sourcemap: !production,
  minify: production,
  define: { 'process.env.NODE_ENV': production ? '"production"' : '"development"' },
  logLevel: 'info',
};

/** Copy the @vscode/codicons CSS and font into dist/ so the webview can load them. */
function copyCodiconAssets() {
  const distDir = path.join(__dirname, 'dist');
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

  // Resolve through bun's node_modules layout
  let codiconDir;
  try {
    codiconDir = path.dirname(require.resolve('@vscode/codicons/dist/codicon.css'));
  } catch {
    console.warn('[esbuild] @vscode/codicons not found — skipping codicon copy');
    return;
  }

  for (const file of ['codicon.css', 'codicon.ttf']) {
    const src = path.join(codiconDir, file);
    const dest = path.join(distDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  }
  console.log('[esbuild] codicon assets copied to dist/');
}

async function main() {
  copyCodiconAssets();

  if (watch) {
    const extCtx = await esbuild.context(extensionOptions);
    const webCtx = await esbuild.context(webviewOptions);
    await Promise.all([extCtx.watch(), webCtx.watch()]);
    console.log('[esbuild] watching extension + webview...');
  } else {
    await esbuild.build(extensionOptions);
    await esbuild.build(webviewOptions);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

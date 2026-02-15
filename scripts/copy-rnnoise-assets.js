/**
 * Copies Rnnoise worklet and WASM from node_modules to public for Next.js to serve.
 * Run after npm install (e.g. postinstall).
 */
const fs = require('fs');
const path = require('path');

const PKG = path.join(__dirname, '..', 'node_modules', '@sapphi-red', 'web-noise-suppressor', 'dist');
const OUT = path.join(__dirname, '..', 'public', 'audio-worklets');

const files = [
  ['rnnoise', 'workletProcessor.js', 'rnnoise-worklet.js'],
  ['rnnoise.wasm', 'rnnoise.wasm'],
  ['rnnoise_simd.wasm', 'rnnoise_simd.wasm'],
];

if (!fs.existsSync(PKG)) {
  console.warn('copy-rnnoise-assets: Package not found, skipping.');
  process.exit(0);
}

if (!fs.existsSync(OUT)) {
  fs.mkdirSync(OUT, { recursive: true });
}

for (const entry of files) {
  const src = entry.length === 3 ? path.join(PKG, entry[0], entry[1]) : path.join(PKG, entry[0]);
  const dest = path.join(OUT, entry[entry.length - 1]);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log('Copied', entry[entry.length - 1]);
  } else {
    console.warn('Missing:', src);
  }
}

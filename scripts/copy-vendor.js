#!/usr/bin/env node

/**
 * Copies pdfjs-dist build files to src/vendor/ for use in the Electron renderer.
 */

const fs = require('fs');
const path = require('path');

const vendorDir = path.join(__dirname, '..', 'src', 'vendor');
const pdfjsBuild = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build');

fs.mkdirSync(vendorDir, { recursive: true });

const files = ['pdf.min.mjs', 'pdf.worker.min.mjs'];

for (const file of files) {
  const src = path.join(pdfjsBuild, file);
  const dest = path.join(vendorDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${file} to src/vendor/`);
  } else {
    console.warn(`Warning: ${src} not found`);
  }
}

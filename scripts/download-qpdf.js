#!/usr/bin/env node

/**
 * Downloads the qpdf Windows x64 binary from GitHub releases.
 * Run with: node scripts/download-qpdf.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const QPDF_VERSION = '11.9.1';
const DOWNLOAD_URL = `https://github.com/qpdf/qpdf/releases/download/v${QPDF_VERSION}/qpdf-${QPDF_VERSION}-msvc64.zip`;
const OUTPUT_DIR = path.join(__dirname, '..', 'resources', 'qpdf', 'win');
const ZIP_PATH = path.join(OUTPUT_DIR, 'qpdf.zip');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (url) => {
      https.get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          follow(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', reject);
    };
    follow(url);
  });
}

async function main() {
  // Check if already downloaded
  const qpdfExe = path.join(OUTPUT_DIR, 'qpdf.exe');
  if (fs.existsSync(qpdfExe)) {
    console.log('qpdf.exe already exists in resources/qpdf/win/');
    return;
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`Downloading qpdf v${QPDF_VERSION} for Windows x64...`);
  console.log(`URL: ${DOWNLOAD_URL}`);
  await download(DOWNLOAD_URL, ZIP_PATH);
  console.log('Download complete. Extracting...');

  // Extract using unzip (available on Mac and most Linux)
  try {
    execSync(`unzip -o "${ZIP_PATH}" -d "${OUTPUT_DIR}"`, { stdio: 'pipe' });
  } catch (e) {
    // Try 7z as fallback
    execSync(`7z x "${ZIP_PATH}" -o"${OUTPUT_DIR}" -y`, { stdio: 'pipe' });
  }

  // Move files from nested directory to OUTPUT_DIR
  const extractedDir = path.join(OUTPUT_DIR, `qpdf-${QPDF_VERSION}-msvc64`);
  if (fs.existsSync(extractedDir)) {
    const binDir = path.join(extractedDir, 'bin');
    if (fs.existsSync(binDir)) {
      const files = fs.readdirSync(binDir);
      for (const file of files) {
        fs.copyFileSync(path.join(binDir, file), path.join(OUTPUT_DIR, file));
      }
    }
    // Clean up extracted directory
    fs.rmSync(extractedDir, { recursive: true, force: true });
  }

  // Clean up zip
  fs.unlinkSync(ZIP_PATH);

  if (fs.existsSync(qpdfExe)) {
    console.log(`Successfully extracted qpdf.exe to ${OUTPUT_DIR}`);
  } else {
    console.error('Warning: qpdf.exe not found after extraction. Check the ZIP structure.');
    console.log('Files in output dir:', fs.readdirSync(OUTPUT_DIR));
  }
}

main().catch(err => {
  console.error('Failed to download qpdf:', err.message);
  process.exit(1);
});

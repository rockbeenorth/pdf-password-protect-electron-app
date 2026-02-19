const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Get the path to the qpdf binary.
 * - In development: uses system qpdf from PATH (brew install qpdf on Mac)
 * - In production: uses the bundled Windows binary
 */
function getQpdfPath() {
  // Check if running as a packaged Electron app
  const isPackaged = typeof process !== 'undefined' &&
    process.resourcesPath &&
    !process.resourcesPath.includes('node_modules');

  if (isPackaged) {
    // Windows: bundled qpdf.exe
    const winPath = path.join(process.resourcesPath, 'qpdf', 'win', 'qpdf.exe');
    if (fs.existsSync(winPath)) return winPath;

    // Mac: bundled qpdf binary
    const macPath = path.join(process.resourcesPath, 'qpdf', 'mac', 'qpdf');
    if (fs.existsSync(macPath)) return macPath;
  }

  // Development: use system qpdf
  return 'qpdf';
}

/**
 * Encrypt a PDF with a user password using qpdf.
 * Uses AES-256 encryption, allows printing, prevents modifications.
 *
 * @param {string} inputPath - Path to the source PDF
 * @param {string} outputPath - Path for the encrypted output PDF
 * @param {string} userPassword - Password the user needs to open the PDF
 * @returns {Promise<string>} The output path on success
 */
function encryptPDF(inputPath, outputPath, userPassword) {
  const qpdfPath = getQpdfPath();

  return new Promise((resolve, reject) => {
    const args = [
      '--encrypt', userPassword, userPassword, '256',
      '--modify=none',
      '--extract=n',
      '--print=full',
      '--',
      inputPath,
      outputPath,
    ];

    execFile(qpdfPath, args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`qpdf encryption failed: ${stderr || error.message}`));
      } else {
        resolve(outputPath);
      }
    });
  });
}

module.exports = { encryptPDF, getQpdfPath };

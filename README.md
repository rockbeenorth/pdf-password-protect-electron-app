# PDF Password Protector

Desktop app that auto-extracts Date of Birth from patient PDF lab reports and generates password-protected copies. Passwords are derived from the patient's DOB formatted as `ddmmyyyy`.

Works completely offline — no internet connection required, no data sent anywhere.

## Concept

VisitHealth admins receive patient lab report PDFs from multiple labs (ClinILabs, TDL, etc.). Before sending reports to patients, each PDF must be password-protected using the patient's date of birth. This app automates that workflow:

- **Input**: Unprotected patient PDF lab reports (batch supported)
- **Processing**: Extract DOB from page 1 header text, generate `ddmmyyyy` password
- **Output**: AES-256 encrypted PDFs + optional HTML report with passwords
- **Review step**: Admin sees a screenshot of each PDF header alongside the extracted DOB and password, can edit/remove before encrypting

The app runs entirely on the local machine. No cloud services, no internet, no patient data leaves the device.

## How It Works

1. Drop PDF files onto the app (or click to browse)
2. App extracts DOB from page 1 header via text extraction + regex matching
3. Generates password from DOB: `dd/mm/yyyy` → `ddmmyyyy` (e.g. `09/03/1983` → `09031983`)
4. Shows a review screen with PDF header screenshot, extracted DOB, and editable password
5. Remove unwanted files (e.g. already-encrypted PDFs) or manually enter passwords for unrecognized formats
6. Click "Protect All PDFs" to encrypt with AES-256 via qpdf
7. Optionally export an HTML report with screenshots and passwords

## Supported Lab Formats

DOB is extracted using pattern matching against text on page 1. Currently recognized formats:

- **ClinILabs** — `DOB : dd/mm/yyyy`
- **TDL** — `DOB | Age: dd/mm/yyyy | nn`
- Generic — `Date of Birth: dd/mm/yyyy`, `D.O.B: dd/mm/yyyy`, etc.

Files with unrecognized formats show a warning so the admin can enter the password manually.

To add support for a new lab format, add a regex to the `DOB_PATTERNS` array in `src/renderer.js`.

## Prerequisites

- **Node.js** 20+
- **qpdf** (for PDF encryption in development)
  - Mac: `brew install qpdf`
  - Windows: bundled automatically in the build

## Development

```bash
# Install dependencies
npm install

# Start the app
npm start
```

To auto-load example PDFs for testing:

```bash
unset ELECTRON_RUN_AS_NODE && npx electron . --demo
```

> If `npm start` fails with `app.whenReady is not a function`, ensure `ELECTRON_RUN_AS_NODE` is not set in your shell environment. The start script handles this automatically.

## Building

### Mac

```bash
npm run build:mac
```

Output: `dist/PDF Password Protector-<version>-arm64.dmg`

macOS may show a Gatekeeper warning since the app is ad-hoc signed. Right-click > Open to bypass.

### Windows (cross-compiled from Mac)

```bash
# Download the qpdf Windows binary (one-time)
npm run download-qpdf

# Build Windows installer
npm run build:win
```

Output: `dist/PDF Password Protector Setup <version>.exe`

Transfer the `.exe` to the Windows machine and run it. No additional setup needed — qpdf is bundled inside.

### Versioning

Update the version in `package.json` before building. Both Mac and Windows outputs include the version number in the filename.

## Tech Stack

| Tool              | Purpose                                       |
| ----------------- | --------------------------------------------- |
| Electron 33       | Desktop app framework                         |
| pdfjs-dist 4      | PDF text extraction + page rendering (browser) |
| qpdf              | AES-256 PDF encryption                        |
| Vanilla HTML/CSS/JS | UI (no framework)                           |
| electron-builder  | Cross-platform packaging                      |

## Architecture Notes

- **Zero native Node modules** — enables clean cross-compilation from Mac to Windows without needing a Windows build environment
- **PDF rendering in the renderer process** — uses the browser's native Canvas API (not node-canvas) so pdfjs works without native dependencies
- **Context isolation** — main and renderer communicate via a preload bridge (`preload.js`); renderer has no direct Node.js access
- **qpdf as external binary** — bundled per-platform in `resources/qpdf/` and resolved at runtime by `lib/pdf-encryptor.js`
- **pdfjs vendor files** — copied from `node_modules` to `src/vendor/` on `npm install` (postinstall script) and loaded as ES modules in the renderer
- **ArrayBuffer handling** — pdfjs transfers ArrayBuffers to its worker, so `.slice()` copies are used when the same PDF data is passed to multiple pdfjs calls

## Project Structure

```text
├── main.js              # Electron main process (file I/O, qpdf, dialogs)
├── preload.js           # Context-isolated IPC bridge (main <-> renderer)
├── src/
│   ├── index.html       # App UI (4 screens: drop, processing, review, done)
│   ├── styles.css       # Styles
│   ├── renderer.js      # UI logic, pdfjs text extraction + page rendering
│   └── vendor/          # pdfjs build files (auto-copied on npm install)
├── lib/
│   └── pdf-encryptor.js # qpdf wrapper (resolves bundled vs system binary)
├── scripts/
│   ├── copy-vendor.js   # Copies pdfjs files to src/vendor/ (postinstall)
│   └── download-qpdf.js # Downloads qpdf Windows binary from GitHub
├── resources/
│   └── qpdf/            # Platform-specific qpdf binaries (gitignored, for builds)
├── examples/            # Demo PDFs for testing
└── task.md              # Original project requirements
```

## Known Issues & Future Work

- **App icon**: Uses the default Electron icon. Add a custom `assets/icon.png` (256x256+) and uncomment the `"icon"` field in `package.json` build config
- **OCR fallback**: `tesseract.js` is included as a dependency but not actively used — all current lab PDFs have selectable text. Could be wired up for scanned/image-only PDFs
- **macOS code signing**: Currently ad-hoc signed. For distribution, configure an Apple Developer certificate and notarization
- **Windows code signing**: Currently unsigned. For production, configure an EV code signing certificate to avoid SmartScreen warnings

# PDF Password Protector

Desktop app that auto-extracts Date of Birth from patient PDF lab reports and generates password-protected copies. Passwords are derived from the patient's DOB formatted as `ddmmyyyy`.

Works completely offline — no internet connection required, no data sent anywhere.

## How It Works

1. Drop PDF files onto the app (or click to browse)
2. App extracts DOB from page 1 header via text extraction + regex matching
3. Generates password from DOB: `dd/mm/yyyy` → `ddmmyyyy` (e.g. `09/03/1983` → `09031983`)
4. Shows a review screen with PDF header screenshot, extracted DOB, and editable password
5. Remove unwanted files or manually enter passwords for unrecognized formats
6. Click "Protect All PDFs" to encrypt with AES-256 via qpdf
7. Optionally export an HTML report with screenshots and passwords

## Supported Lab Formats

DOB is extracted using pattern matching. Currently recognized formats:

- **ClinILabs** — `DOB : dd/mm/yyyy`
- **TDL** — `DOB | Age: dd/mm/yyyy | nn`
- Generic — `Date of Birth: dd/mm/yyyy`, `D.O.B: dd/mm/yyyy`, etc.

Files with unrecognized formats will show a warning so the admin can enter the password manually.

## Prerequisites

- **Node.js** 20+
- **qpdf** (for PDF encryption)
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

### Windows (cross-compiled from Mac)

```bash
# Download the qpdf Windows binary (one-time)
npm run download-qpdf

# Build Windows installer
npm run build:win
```

Output: `dist/PDF Password Protector Setup <version>.exe`

Transfer the `.exe` to the Windows machine and run it. No additional setup needed — qpdf is bundled inside.

## Tech Stack

| Tool | Purpose |
|------|---------|
| Electron 33 | Desktop app framework |
| pdfjs-dist 4 | PDF text extraction + page rendering (browser) |
| qpdf | AES-256 PDF encryption |
| Vanilla HTML/CSS/JS | UI (no framework) |
| electron-builder | Cross-platform packaging |

## Project Structure

```
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
│   └── qpdf/            # Platform-specific qpdf binaries (for builds)
└── examples/            # Demo PDFs for testing
```

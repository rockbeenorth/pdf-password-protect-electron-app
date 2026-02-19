const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { encryptPDF } = require('./lib/pdf-encryptor');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'PDF Password Protector',
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Auto-process demo PDFs for visual testing
  if (process.argv.includes('--demo')) {
    mainWindow.webContents.on('did-finish-load', async () => {
      const demo1 = path.join(__dirname, 'examples', 'demo-01.pdf').replace(/\\/g, '\\\\');
      const demo2 = path.join(__dirname, 'examples', 'demo-02.pdf').replace(/\\/g, '\\\\');
      await mainWindow.webContents.executeJavaScript(
        `processFiles(['${demo1}', '${demo2}'])`
      );
    });
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

// Read a PDF file and return its contents as a base64 string
ipcMain.handle('read-file', async (event, filePath) => {
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
});

// Encrypt a single PDF with the given password
ipcMain.handle('encrypt-pdf', async (event, { filePath, password, outputDir }) => {
  try {
    const fileName = path.basename(filePath, '.pdf');
    const outputPath = path.join(outputDir, `${fileName}_protected.pdf`);
    await encryptPDF(filePath, outputPath, password);
    return { success: true, outputPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Open folder picker for output directory
ipcMain.handle('pick-output-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose output folder for protected PDFs',
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// Open file picker for PDF files
ipcMain.handle('pick-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    title: 'Select PDF files to protect',
  });
  if (result.canceled) return [];
  return result.filePaths;
});

// Open a folder in the OS file explorer
ipcMain.handle('open-folder', async (event, folderPath) => {
  shell.openPath(folderPath);
});

// Save report HTML to file
ipcMain.handle('save-report', async (event, { outputDir, htmlContent }) => {
  const reportPath = path.join(outputDir, `protection_report_${Date.now()}.html`);
  fs.writeFileSync(reportPath, htmlContent, 'utf-8');
  return reportPath;
});

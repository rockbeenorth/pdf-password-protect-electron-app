import * as pdfjsLib from './vendor/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.mjs';

// ─── DOB Extraction ────────────────────────────────────────────────────────────

const DOB_PATTERNS = [
  /DOB\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
  /DOB\s*\|\s*Age\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
  /DOB\s*[:\-|]\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,
  /Date\s+of\s+Birth\s*[:\-|]\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,
  /D\.?\s*O\.?\s*B\.?\s*[:\-|]\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,
];

function generatePassword(dobString) {
  const parts = dobString.split(/[\/\-\.]/);
  if (parts.length !== 3) throw new Error(`Invalid DOB: ${dobString}`);
  const day = parts[0].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  const year = parts[2];
  return `${day}${month}${year}`;
}

/**
 * Extract text from page 1 and find DOB.
 * Returns { dob, password, textContext, rawMatch } or null.
 */
async function extractDOB(pdfData) {
  const doc = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const page = await doc.getPage(1);
  const textContent = await page.getTextContent();

  const textItems = [];
  let fullText = '';
  for (const item of textContent.items) {
    if (item.str) {
      textItems.push({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        height: item.height || 12,
      });
      fullText += item.str + ' ';
    }
  }

  for (const pattern of DOB_PATTERNS) {
    const match = fullText.match(pattern);
    if (match) {
      const dobDateStr = match[1].replace(/[\-\.]/g, '/');

      // Build text context around the match (±100 chars)
      const matchIdx = fullText.indexOf(match[0]);
      const ctxStart = Math.max(0, matchIdx - 80);
      const ctxEnd = Math.min(fullText.length, matchIdx + match[0].length + 80);
      const textContext = fullText.slice(ctxStart, ctxEnd).trim();

      // Find DOB item coordinates for screenshot cropping
      let coordinates = null;
      for (const item of textItems) {
        if (item.text.includes(dobDateStr) || /DOB/i.test(item.text)) {
          coordinates = { x: item.x, y: item.y, width: item.width, height: item.height };
          break;
        }
      }

      await doc.destroy();
      return {
        dob: dobDateStr,
        password: generatePassword(dobDateStr),
        textContext,
        rawMatch: match[0],
        coordinates,
      };
    }
  }

  await doc.destroy();
  return null;
}

/**
 * Render page 1 of the PDF and crop the header area as a base64 PNG data URL.
 * Shows the top portion of the page where DOB is located.
 */
async function renderDOBScreenshot(pdfData, coordinates) {
  const doc = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const page = await doc.getPage(1);

  // Render at 2x for clear, legible text
  const scale = 2;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');

  await page.render({ canvasContext: ctx, viewport }).promise;

  // Crop the top ~25% of the page (header area where DOB lives)
  const cropX = 0;
  const cropY = 0;
  const cropW = viewport.width;
  const cropH = Math.floor(viewport.height * 0.25);

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropW;
  cropCanvas.height = cropH;
  const cropCtx = cropCanvas.getContext('2d');
  cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  const dataUrl = cropCanvas.toDataURL('image/png');
  await doc.destroy();
  return dataUrl;
}

// ─── App State ──────────────────────────────────────────────────────────────────

let state = {
  files: [],       // [{ filePath, fileName, pdfData, dob, password, textContext, screenshot, confidence, error }]
  outputDir: null,  // null = same folder as input
};

function resetState() {
  state.files = [];
  showScreen('drop-zone-screen');
  updateOutputDirLabel();
}

// ─── Screen Management ──────────────────────────────────────────────────────────

const screens = ['drop-zone-screen', 'processing-screen', 'review-screen', 'done-screen'];

function showScreen(id) {
  for (const s of screens) {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  }
}

// ─── Drop Zone ──────────────────────────────────────────────────────────────────

const dropZone = document.getElementById('drop-zone');

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
  if (files.length > 0) {
    processFiles(files.map(f => window.api.getPathForFile(f)));
  }
});

dropZone.addEventListener('click', async () => {
  const filePaths = await window.api.pickFiles();
  if (filePaths.length > 0) {
    processFiles(filePaths);
  }
});

// ─── Output Directory ───────────────────────────────────────────────────────────

function updateOutputDirLabel() {
  document.getElementById('output-dir-label').textContent =
    state.outputDir || 'Same folder as input files';
}

document.getElementById('change-dir-btn').addEventListener('click', async () => {
  const dir = await window.api.pickOutputDir();
  if (dir) {
    state.outputDir = dir;
    updateOutputDirLabel();
  }
});

// ─── File Processing ────────────────────────────────────────────────────────────

async function processFiles(filePaths) {
  showScreen('processing-screen');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');

  const newFiles = [];
  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
    const fileName = filePath.split(/[/\\]/).pop();
    progressText.textContent = `Processing ${i + 1} of ${filePaths.length}: ${fileName}`;
    progressBar.style.width = `${((i + 1) / filePaths.length) * 100}%`;

    try {
      // Read file via main process
      const base64 = await window.api.readFile(filePath);
      const pdfData = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

      // Extract DOB (uses a copy since pdfjs transfers the ArrayBuffer to its worker)
      const result = await extractDOB(pdfData.slice());

      // Render screenshot of PDF header (uses another copy)
      let screenshot = null;
      try {
        screenshot = await renderDOBScreenshot(pdfData.slice());
      } catch (err) {
        console.error('Screenshot failed for', fileName, err);
      }

      if (result) {
        newFiles.push({
          filePath, fileName, pdfData,
          dob: result.dob,
          password: result.password,
          textContext: result.textContext,
          rawMatch: result.rawMatch,
          screenshot,
          confidence: 'text',
          error: null,
        });
      } else {
        newFiles.push({
          filePath, fileName, pdfData,
          dob: null,
          password: '',
          textContext: null,
          rawMatch: null,
          screenshot,
          confidence: null,
          error: 'Could not find DOB',
        });
      }
    } catch (err) {
      newFiles.push({
        filePath, fileName: filePath.split(/[/\\]/).pop(),
        pdfData: null,
        dob: null,
        password: '',
        textContext: null,
        rawMatch: null,
        screenshot: null,
        confidence: null,
        error: err.message,
      });
    }
  }

  state.files = state.files.concat(newFiles);
  showReviewScreen();
}

// ─── Review Screen ──────────────────────────────────────────────────────────────

function showReviewScreen() {
  showScreen('review-screen');
  renderReviewTable();
  updateStatusSummary();
}

function renderReviewTable() {
  const tbody = document.getElementById('review-body');
  tbody.innerHTML = '';

  state.files.forEach((file, index) => {
    const tr = document.createElement('tr');

    // File name
    const tdFile = document.createElement('td');
    tdFile.innerHTML = `<span class="file-name">${escapeHtml(file.fileName)}</span>`;
    tr.appendChild(tdFile);

    // Preview - show screenshot if available, fall back to text context
    const tdPreview = document.createElement('td');
    if (file.screenshot) {
      tdPreview.innerHTML = `<img class="preview-img" src="${file.screenshot}" alt="DOB area">`;
    }
    if (!file.screenshot && file.textContext) {
      const highlighted = escapeHtml(file.textContext).replace(
        escapeHtml(file.rawMatch),
        `<span class="highlight">${escapeHtml(file.rawMatch)}</span>`
      );
      tdPreview.innerHTML = `<div class="text-context">${highlighted}</div>`;
    }
    if (!file.screenshot && !file.textContext) {
      tdPreview.innerHTML = '<span style="color: var(--text-secondary)">—</span>';
    }
    tr.appendChild(tdPreview);

    // DOB
    const tdDOB = document.createElement('td');
    tdDOB.textContent = file.dob || '—';
    tr.appendChild(tdDOB);

    // Password
    const tdPwd = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'password-input';
    input.value = file.password;
    input.placeholder = 'Enter password';
    input.dataset.index = index;
    input.addEventListener('input', (e) => {
      state.files[index].password = e.target.value;
      updateStatusSummary();
    });
    tdPwd.appendChild(input);
    tr.appendChild(tdPwd);

    // Status
    const tdStatus = document.createElement('td');
    tdStatus.style.textAlign = 'center';
    if (file.error) {
      tdStatus.innerHTML = '<span class="status-icon status-warn" title="Manual entry needed">&#9888;</span>';
    } else {
      tdStatus.innerHTML = '<span class="status-icon status-ok" title="DOB extracted">&#10003;</span>';
    }
    tr.appendChild(tdStatus);

    // Remove button
    const tdAction = document.createElement('td');
    tdAction.style.textAlign = 'center';
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove';
    removeBtn.title = 'Remove from list';
    removeBtn.innerHTML = '&#10005;';
    removeBtn.addEventListener('click', () => {
      state.files.splice(index, 1);
      if (state.files.length === 0) {
        resetState();
      } else {
        renderReviewTable();
        updateStatusSummary();
      }
    });
    tdAction.appendChild(removeBtn);
    tr.appendChild(tdAction);

    tbody.appendChild(tr);
  });
}

function updateStatusSummary() {
  const ready = state.files.filter(f => f.password.length > 0).length;
  const total = state.files.length;
  const summary = document.getElementById('status-summary');
  summary.textContent = `${ready} of ${total} ready`;

  const protectBtn = document.getElementById('protect-all-btn');
  protectBtn.disabled = ready < total;
  protectBtn.textContent = ready === total ? 'Protect All PDFs' : `${total - ready} need passwords`;
}

// ─── Encryption ─────────────────────────────────────────────────────────────────

document.getElementById('protect-all-btn').addEventListener('click', async () => {
  const protectBtn = document.getElementById('protect-all-btn');
  protectBtn.disabled = true;
  protectBtn.textContent = 'Encrypting...';

  // Add encrypting class to all rows
  const rows = document.querySelectorAll('#review-body tr');
  rows.forEach(r => r.classList.add('encrypting'));

  let successCount = 0;
  let outputDir = state.outputDir;

  for (let i = 0; i < state.files.length; i++) {
    const file = state.files[i];
    if (!file.password) continue;

    // Determine output dir: custom or same as input
    const fileDir = file.filePath.substring(0, file.filePath.lastIndexOf(/[/\\]/.test(file.filePath) ? (file.filePath.includes('\\') ? '\\' : '/') : '/'));
    const dir = outputDir || file.filePath.replace(/[/\\][^/\\]+$/, '');

    try {
      const result = await window.api.encryptPDF({
        filePath: file.filePath,
        password: file.password,
        outputDir: dir,
      });
      if (result.success) {
        state.files[i].outputPath = result.outputPath;
        successCount++;
      } else {
        state.files[i].encryptError = result.error;
      }
    } catch (err) {
      state.files[i].encryptError = err.message;
    }
  }

  // Use the output dir of the first file for the "done" screen
  if (!outputDir && state.files.length > 0) {
    outputDir = state.files[0].filePath.replace(/[/\\][^/\\]+$/, '');
  }

  showDoneScreen(successCount, state.files.length, outputDir);
});

// ─── Done Screen ────────────────────────────────────────────────────────────────

function showDoneScreen(successCount, total, outputDir) {
  showScreen('done-screen');
  const title = document.getElementById('done-title');
  if (successCount === total) {
    title.textContent = `All ${total} PDFs have been password-protected!`;
  } else {
    title.textContent = `${successCount} of ${total} PDFs protected`;
  }
  document.getElementById('done-output-dir').textContent = outputDir || '';

  document.getElementById('open-folder-btn').onclick = () => {
    if (outputDir) window.api.openFolder(outputDir);
  };
}

document.getElementById('process-more-btn').addEventListener('click', resetState);

// ─── Add More ───────────────────────────────────────────────────────────────────

document.getElementById('add-more-btn').addEventListener('click', async () => {
  const filePaths = await window.api.pickFiles();
  if (filePaths.length > 0) {
    processFiles(filePaths);
  }
});

// ─── Report Export ──────────────────────────────────────────────────────────────

function generateReportHTML() {
  let html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>PDF Protection Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; color: #1e293b; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .date { color: #64748b; font-size: 13px; margin-bottom: 24px; }
  .entry { border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .entry h3 { font-size: 15px; margin-bottom: 8px; }
  .entry img { max-width: 100%; max-height: 80px; border: 1px solid #e2e8f0; border-radius: 4px; margin: 8px 0; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  td { padding: 4px 8px; }
  td:first-child { font-weight: 600; width: 140px; color: #64748b; }
  .text-ctx { font-family: monospace; font-size: 11px; background: #f1f5f9; padding: 6px 8px; border-radius: 4px; }
</style></head><body>
<h1>PDF Protection Report</h1>
<p class="date">Generated: ${new Date().toLocaleString()}</p>
`;

  for (const file of state.files) {
    html += `<div class="entry">
  <h3>${escapeHtml(file.fileName)}</h3>`;
    if (file.screenshot) {
      html += `\n  <img src="${file.screenshot}" alt="DOB area">`;
    }
    html += `
  <table>
    <tr><td>Extracted DOB:</td><td>${escapeHtml(file.dob || 'Not found')}</td></tr>
    <tr><td>Password:</td><td><strong>${escapeHtml(file.password || 'N/A')}</strong></td></tr>
    <tr><td>Detection:</td><td>${file.confidence || 'Manual'}</td></tr>
    <tr><td>Output file:</td><td>${escapeHtml(file.outputPath || 'Pending')}</td></tr>
  </table>`;
    if (file.textContext) {
      html += `\n  <div class="text-ctx">${escapeHtml(file.textContext)}</div>`;
    }
    html += '\n</div>\n';
  }

  html += '</body></html>';
  return html;
}

async function exportReport() {
  const dir = state.outputDir || (state.files[0] && state.files[0].filePath.replace(/[/\\][^/\\]+$/, ''));
  if (!dir) return;
  const reportPath = await window.api.saveReport({
    outputDir: dir,
    htmlContent: generateReportHTML(),
  });
  if (reportPath) {
    window.api.openFolder(dir);
  }
}

document.getElementById('export-report-btn').addEventListener('click', exportReport);
document.getElementById('export-report-done-btn').addEventListener('click', exportReport);

// ─── Utilities ──────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Expose for automated testing via executeJavaScript
window.processFiles = processFiles;
window.state = state;

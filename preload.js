const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  encryptPDF: (data) => ipcRenderer.invoke('encrypt-pdf', data),
  pickOutputDir: () => ipcRenderer.invoke('pick-output-dir'),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  saveReport: (data) => ipcRenderer.invoke('save-report', data),
  getPathForFile: (file) => webUtils.getPathForFile(file),
});

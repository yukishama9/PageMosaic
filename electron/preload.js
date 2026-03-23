// Electron preload script
// Exposes a minimal, safe set of IPC APIs to the renderer process via contextBridge.
// The renderer detects Electron by checking: typeof window.electronAPI !== 'undefined'
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {

  // ── Dialogs ────────────────────────────────────────────────────────────────

  // Show a native folder-picker; resolves to the chosen path string or null
  openDirectory: (options) => ipcRenderer.invoke('dialog:openDirectory', options),

  // ── File system ────────────────────────────────────────────────────────────

  // Read a text file; resolves to string or null
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),

  // Write a text file; resolves to boolean
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),

  // Write a binary file from a Base64 string; resolves to boolean
  writeBinaryFile: (filePath, base64Content) =>
    ipcRenderer.invoke('fs:writeBinaryFile', filePath, base64Content),

  // Delete a file; resolves to boolean
  deleteFile: (filePath) => ipcRenderer.invoke('fs:deleteFile', filePath),

  // Check if a path exists; resolves to boolean
  exists: (targetPath) => ipcRenderer.invoke('fs:exists', targetPath),

  // Create a directory (recursive); resolves to boolean
  mkdir: (dirPath) => ipcRenderer.invoke('fs:mkdir', dirPath),

  // List directory entries; resolves to [{ name, kind, fullPath }]
  listDir: (dirPath) => ipcRenderer.invoke('fs:listDir', dirPath),

  // ── Shell ──────────────────────────────────────────────────────────────────

  // Reveal a path in the OS file explorer
  showInFolder: (targetPath) => ipcRenderer.invoke('shell:showInFolder', targetPath),

  // ── Tailwind compilation ───────────────────────────────────────────────────

  // Write tailwind.config.js and run `npx tailwindcss -i input.css -o assets/css/tailwind.css`
  // in the given dirPath. Returns { success, stdout, stderr, error }
  compileTailwind: (dirPath, configScript) =>
    ipcRenderer.invoke('tailwind:compile', { dirPath, configScript }),

  // ── App info ───────────────────────────────────────────────────────────────

  // Expose platform string so the renderer can adapt UI if needed
  platform: process.platform,

  // Return the absolute path to the bundled resources/ directory
  getResourcesPath: () => ipcRenderer.invoke('app:getResourcesPath'),
});

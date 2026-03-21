// Electron main process
// Creates the BrowserWindow and loads the app UI from src/index.html
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');

// Keep a global reference so the window is not garbage-collected
let mainWindow = null;

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'WebBuilder',
    // Use a custom icon when one is available
    // icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      // Preload script exposes safe IPC APIs to the renderer
      preload: path.join(__dirname, 'preload.js'),
      // Keep Node integration OFF — renderer uses only the preload bridge
      nodeIntegration: false,
      contextIsolation: true,
      // Allow the preview iframe to load local file:// content
      webSecurity: false,
    },
  });

  // Load the app entry point
  mainWindow.loadFile(path.join(__dirname, '../builder/index.html'));

  // Open DevTools in development mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createWindow();

  // macOS: re-create window when dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // On macOS apps stay active until the user explicitly quits
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------------------
// IPC handlers — file system operations
// All handlers are exposed to the renderer via preload.js (contextBridge)
// ---------------------------------------------------------------------------

// Show a native folder-picker dialog; returns the chosen path or null
ipcMain.handle('dialog:openDirectory', async (_event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: options?.title || 'Select Folder',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Read a text file; returns content string or null
ipcMain.handle('fs:readFile', async (_event, filePath) => {
  try {
    return await fsPromises.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
});

// Write a text file; returns true on success
ipcMain.handle('fs:writeFile', async (_event, filePath, content) => {
  try {
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(filePath, content, 'utf8');
    return true;
  } catch (err) {
    console.error('fs:writeFile error', err);
    return false;
  }
});

// Write a binary file from a Base64-encoded string; returns true on success
ipcMain.handle('fs:writeBinaryFile', async (_event, filePath, base64Content) => {
  try {
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    const buf = Buffer.from(base64Content, 'base64');
    await fsPromises.writeFile(filePath, buf);
    return true;
  } catch (err) {
    console.error('fs:writeBinaryFile error', err);
    return false;
  }
});

// Delete a file; returns true on success
ipcMain.handle('fs:deleteFile', async (_event, filePath) => {
  try {
    await fsPromises.unlink(filePath);
    return true;
  } catch {
    return false;
  }
});

// Check whether a path (file or directory) exists
ipcMain.handle('fs:exists', async (_event, targetPath) => {
  try {
    await fsPromises.access(targetPath);
    return true;
  } catch {
    return false;
  }
});

// Create a directory (and any missing parents); returns true on success
ipcMain.handle('fs:mkdir', async (_event, dirPath) => {
  try {
    await fsPromises.mkdir(dirPath, { recursive: true });
    return true;
  } catch (err) {
    console.error('fs:mkdir error', err);
    return false;
  }
});

// List entries in a directory; returns [{ name, kind }] or []
ipcMain.handle('fs:listDir', async (_event, dirPath) => {
  try {
    const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
    return entries.map(e => ({
      name: e.name,
      kind: e.isDirectory() ? 'directory' : 'file',
      fullPath: path.join(dirPath, e.name),
    }));
  } catch {
    return [];
  }
});

// Open the given path in the OS file explorer (reveal in Finder / Explorer)
ipcMain.handle('shell:showInFolder', async (_event, targetPath) => {
  shell.showItemInFolder(targetPath);
});
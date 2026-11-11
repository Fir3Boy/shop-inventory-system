import { app, BrowserWindow, dialog } from 'electron';
import { Server } from 'http';
import { db } from './db';
import { app as expressApp } from './server';

let mainWindow: BrowserWindow | null = null;
let serverInstance: Server | null = null;
const PORT = 3000;

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(bootApplication);
}

async function bootApplication() {
  try {
    // 1. Initialize DB Schema
    await db.initializeSchema();

    // 2. Start Express Server
    serverInstance = expressApp.listen(PORT, '127.0.0.1', () => {
      console.log(`[ELECTRON] Express backend listening on http://127.0.0.1:${PORT}`);
      createMainWindow();
    });

    serverInstance.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        dialog.showErrorBox(
          'Port In Use',
          `Port ${PORT} is occupied by another process. Please close it and reopen the application.`
        );
      } else {
        dialog.showErrorBox('Server Error', err.message);
      }
      app.quit();
    });
  } catch (err) {
    dialog.showErrorBox('Database Error', (err as Error).message);
    app.quit();
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    title: 'Textile POS',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}


app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', (event) => {
  if (serverInstance) {
    event.preventDefault();
    serverInstance.close(async () => {
      try {
        await db.close();
      } catch (err) {
        console.error('Error closing SQLite:', err);
      } finally {
        serverInstance = null;
        app.quit();
      }
    });
  }
});
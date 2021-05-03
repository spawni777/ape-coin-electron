import {
  app,
  protocol,
  BrowserWindow,
  ipcMain,
  dialog,
  Tray,
  Menu,
} from 'electron';

import { createProtocol } from 'vue-cli-plugin-electron-builder/lib';
// eslint-disable-next-line no-unused-vars
import installExtension, { VUEJS_DEVTOOLS } from 'electron-devtools-installer';
import ElectronStore from '@/utils/ElectronStore';
import path from 'path';
import fs from 'fs';
import { genKeyPair } from '@/utils/elliptic';
import bgHandlers from '@/utils/backgroundHandlers';

const isDevelopment = process.env.NODE_ENV !== 'production';
const electronStore = new ElectronStore({
  configName: 'apecoin-preferences',
  defaults: {},
});
let isQuiting = false;
const gotTheLock = app.requestSingleInstanceLock();

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      secure: true,
      standard: true,
    },
  },
]);

let tray = null;
let win = null;
const sendP2pForm = () => {
  const form = electronStore.get('p2pForm');
  if (form) {
    win.webContents.send('load-p2pForm', form);
  }
};

async function createWindow() {
  // Create the browser window.
  win = new BrowserWindow({
    width: 1000,
    height: 650,
    icon: path.resolve(__dirname, './assets/icon.ico'),
    titleBarStyle: 'hiddenInset',
    frame: false,
    webPreferences: {
      enableRemoteModule: true,
      contextIsolation: false,
      // Use pluginOptions.nodeIntegration, leave this alone
      // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration
      // for more info
      nodeIntegration: process.env.ELECTRON_NODE_INTEGRATION,
    },
  });

  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    await win.loadURL(process.env.WEBPACK_DEV_SERVER_URL);
    if (!process.env.IS_TEST) win.webContents.openDevTools();
  } else {
    createProtocol('app');
    // Load the index.html when not in development
    await win.loadURL('app://./index.html');
  }

  win.on('close', (event) => {
    if (!isQuiting) {
      event.preventDefault();
      win.hide();
    }
    return false;
  });

  ipcMain.on('close-window', () => {
    win.close();
  });
  ipcMain.on('hide-window', () => {
    win.minimize();
  });

  bgHandlers.p2pServerHandler(win, app);
  bgHandlers.miningHandler(win, app);

  ipcMain.on('save-p2pForm', (event, form) => {
    electronStore.set('p2pForm', form);
  });

  ipcMain.on('check-p2pForm', sendP2pForm);

  ipcMain.on('checkAuth', async () => {
    const keyPair = electronStore.get('walletAuth');

    if (keyPair) {
      win.webContents.send('signInWallet', keyPair);
    }
  });

  ipcMain.on('createWallet', async () => {
    const keyPair = genKeyPair();
    win.webContents.send('newWalletCreated', keyPair);
  });

  ipcMain.on('saveNewWallet', async (event, keyPair) => {
    const {
      filePath,
      canceled,
    } = await dialog.showSaveDialog(win, {
      defaultPath: path.resolve(app.getPath('desktop'), 'keyPair.txt'),
    });

    if (!canceled) {
      const txtKeyPair = `publicKey(your address): ${keyPair.pub}
privateKey(secret key, don't share it): ${keyPair.priv}`;
      fs.writeFile(filePath, txtKeyPair, (err) => {
        if (err) {
          win.webContents.send('newWalletSaveError');
          return;
        }
        win.webContents.send('newWalletSaved', filePath);
      });
    }
  });

  ipcMain.on('saveAuth', async (event, keyPair) => {
    electronStore.set('walletAuth', keyPair);
  });

  ipcMain.on('deleteAuth', async () => {
    electronStore.delete('walletAuth');
  });

  // eslint-disable-next-line no-undef
  tray = new Tray(path.resolve(__static, './tray-icon.png'));

  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        win.show();
      },
    },
    {
      label: 'Quit',
      click: () => {
        isQuiting = true;
        win.close();
        app.quit();
      },
    },
  ]));

  tray.setToolTip('Ape-coin application');
  tray.on('double-click', () => {
    win.show();
  });
  // tray.setContextMenu(contextMenu);
}

app.on('before-quit', () => {
  isQuiting = true;
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, we should focus our window.
    if (win) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
    }
  });

  app.on('ready', async () => {
    if (isDevelopment && !process.env.IS_TEST) {
      // Install Vue Devtools
      try {
        // demo vue-devtools for vue3 in electron
        await installExtension({
          id: 'ljjemllljcmogpfapbkkighbhhppjdbg',
          electron: '>=1.2.1',
        });
        // await installExtension(VUEJS_DEVTOOLS);
      } catch (e) {
        console.error('Vue Devtools failed to install:', e.toString());
      }
    }
    await createWindow();
    sendP2pForm();
  });
}

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', (data) => {
      if (data === 'graceful-exit') {
        app.quit();
      }
    });
  } else {
    process.on('SIGTERM', () => {
      app.quit();
    });
  }
}

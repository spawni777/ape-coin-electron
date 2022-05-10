import {
  app,
  protocol,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
} from 'electron';

import { createProtocol } from 'vue-cli-plugin-electron-builder/lib';
// eslint-disable-next-line no-unused-vars
import installExtension from 'electron-devtools-installer';
import ElectronStore from '@/utils/ElectronStore';
import path from 'path';
import bgHandlers from '@/utils/backgroundHandlers';
import winFade from '@/utils/winAnimation';
import { FROM_BG, TO_BG } from '@/resources/channels';

const isDevelopment = process.env.NODE_ENV !== 'production';

try {
  const electronStore = new ElectronStore({
    configName: 'ape-coin-data',
    defaults: {},
  });
  // const gotTheLock = app.requestSingleInstanceLock();

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
  let mainWin = null;

  const sendP2pForm = () => {
    const form = electronStore.get('p2pForm');
    if (form) {
      mainWin.webContents.send(FROM_BG.LOAD_P2P_FORM, form);
    }
  };

  const createMainWin = async () => {
    const loadingWin = new BrowserWindow({
      width: 300,
      height: 360,
      icon: path.resolve(__dirname, './assets/icon.ico'),
      titleBarStyle: 'hiddenInset',
      frame: false,
      show: false,
      resizable: false,
    });

    loadingWin.once('show', () => {
      mainWin = new BrowserWindow({
        width: 1000,
        height: 650,
        icon: path.resolve(__dirname, './assets/icon.ico'),
        titleBarStyle: 'hiddenInset',
        frame: false,
        webPreferences: {
          enableRemoteModule: true,
          contextIsolation: false,
          // Use pluginOptions.nodeIntegration, leave this alone
          // eslint-disable-next-line max-len
          // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration
          // for more info
          nodeIntegration: process.env.ELECTRON_NODE_INTEGRATION,
        },
        show: false,
      });

      // const MIN_LOADING_TIME = 2000;
      // let readyToShow = false;

      const showMainWin = () => {
        // if (!readyToShow) {
        //   readyToShow = true;
        //   return;
        // }
        console.log('main win loaded!');
        mainWin.show();
        loadingWin.hide();
        loadingWin.close();
      };
      // setTimeout(showMainWin, MIN_LOADING_TIME);
      mainWin.webContents.once('ready-to-show', showMainWin);

      // long loading html
      if (process.env.WEBPACK_DEV_SERVER_URL) {
        // Load the url of the dev server if in development mode
        mainWin.loadURL(process.env.WEBPACK_DEV_SERVER_URL);
        if (!process.env.IS_TEST) mainWin.webContents.openDevTools();
      } else {
        createProtocol('app');
        // Load the index.html when not in development
        mainWin.loadURL('app://./index.html');
      }
    });

    const isProd = process.env.NODE_ENV === 'production';
    const RESOURCES_PATH = isProd
      ? path.resolve(app.getAppPath(), '../')
      : path.resolve(app.getAppPath(), '../src/resources');
    const WINDOWS_PATH = isProd
      ? path.resolve(app.getAppPath(), './windows')
      : path.resolve(RESOURCES_PATH, './windows');
    await loadingWin.loadFile(path.resolve(WINDOWS_PATH, 'loading.html'));
    loadingWin.show();

    let isQuiting = false;
    mainWin.on('close', (event) => {
      if (!isQuiting) {
        event.preventDefault();
        mainWin.hide();
      }
      app.quit();
    });

    //  window is restored from a minimized state
    mainWin.on('restore', async () => {
      // TODO: continue here
      // await winFade(mainWin, null, 0);
    });

    mainWin.on('minimize', async () => {
      // await winFade(mainWin, null, 0);
    });

    ipcMain.on(TO_BG.CLOSE_MAIN_WINDOW, () => {
      // emit close event
      mainWin.close();
    });
    ipcMain.on(TO_BG.HIDE_MAIN_WINDOW, async () => {
      await winFade(mainWin, (win) => win.minimize(), 1);
    });

    ipcMain.on(TO_BG.SAVE_P2P_FORM, (event, form) => {
      electronStore.set('p2pForm', form);
    });
    ipcMain.on(TO_BG.CHECK_P2P_FORM_SAVING, sendP2pForm);

    bgHandlers.walletHandler(mainWin, electronStore);
    bgHandlers.alertsHandler(mainWin, electronStore);
    bgHandlers.p2pServerHandler(mainWin);
    bgHandlers.miningHandler(mainWin);

    // eslint-disable-next-line no-undef
    tray = new Tray(path.resolve(__static, './tray-icon.png'));

    tray.setContextMenu(Menu.buildFromTemplate([
      {
        label: 'Show App',
        click: () => {
          mainWin.show();
        },
      },
      {
        label: 'Quit',
        click: () => {
          isQuiting = true;
          mainWin.close();
        },
      },
    ]));

    tray.setToolTip('Ape-coin');
    tray.on('double-click', () => {
      mainWin.show();
    });
    // tray.setContextMenu(contextMenu);
  };

  // Quit when all windows are closed.
  app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', async () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) await createMainWin();
  });

  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.

  // if (!gotTheLock) {
  //   app.quit();
  // } else {
  //   app.on('second-instance', () => {
  //     // Someone tried to run a second instance, we should focus our window.
  //     if (mainWin) {
  //       if (mainWin.isMinimized()) mainWin.restore();
  //       if (!mainWin.isVisible()) mainWin.show();
  //       mainWin.focus();
  //     }
  //   });
  //
  //   app.on('ready', async () => {
  //     if (isDevelopment && !process.env.IS_TEST) {
  //       // Install Vue Devtools
  //       try {
  //         // demo vue-devtools for vue3 in electron
  //         await installExtension({
  //           id: 'ljjemllljcmogpfapbkkighbhhppjdbg',
  //           electron: '>=1.2.1',
  //         });
  //         // await installExtension(VUEJS_DEVTOOLS);
  //       } catch (e) {
  //         console.error('Vue Devtools failed to install:', e.toString());
  //       }
  //     }
  //     await createMainWin();
  //     sendP2pForm();
  //   });
  // }

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
    await createMainWin();
    sendP2pForm();
  });

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
} catch (err) {
  console.log(err);
}

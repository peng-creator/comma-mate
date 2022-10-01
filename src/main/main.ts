/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import './comma';
import path from 'path';
import watch from 'watch';
import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import fileType from 'file-type';
import { autoUpdater } from 'electron-updater';
import { BehaviorSubject, filter, Subject, tap } from 'rxjs';
import log from 'electron-log';
import { promises as fs } from 'fs';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import {
  convertToMp4,
  extractSubtitlesOfFile,
  getConvertOutputPath,
  getVideoFile$,
  getVideoInfo,
} from './convert';
import { logToFile } from './log';
import { dbRoot$ } from './state';

export default class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    // autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

let currentMonitor: watch.Monitor | null = null;

type VideoFileInfo = {
  needToConvert: boolean;
  file: string;
};

const videoFileInfo$ = new Subject<VideoFileInfo>();

let convertQueue: string[] = []; // files pending converting.
let convertingCount = 0; // 正在转码的任务数量
let multiThreadsCount = 1; // 同时转码任务数

const finishedFileSet = new Set<string>();

ipcMain.once('ipc-render-ready', async (event, arg) => {
  const convert = () => {
    logToFile('判断 是否可以convert:', convertingCount, multiThreadsCount);
    const spare = multiThreadsCount - convertingCount;
    for (let i = 0; i < spare; i += 1) {
      const convertFile = convertQueue.shift();
      logToFile(`const convertFile = convertQueue.shift()`, convertFile);
      logToFile(`ipc-convert-queue:`, convertQueue);
      event.reply('ipc-convert-queue', convertQueue);
      if (convertFile) {
        convertingCount += 1;
        const videoOutputPath = getConvertOutputPath(
          convertFile,
          'mp4',
          path.dirname(convertFile)
        );
        logToFile('ipc-converting-file:', convertFile);
        event.reply('ipc-converting-file', convertFile);
        logToFile(`convertToMp4`);
        console.log('finishedFileSet.add(videoOutputPath):', videoOutputPath);
        finishedFileSet.add(videoOutputPath.toLowerCase());
        console.log('after add, set is :', finishedFileSet);
        convertToMp4(convertFile, videoOutputPath).subscribe({
          // eslint-disable-next-line @typescript-eslint/no-loop-func
          next() {
            event.reply('ipc-convert-success-file', convertFile);
            convertingCount -= 1;
            convert();
          },
          // eslint-disable-next-line @typescript-eslint/no-loop-func
          error() {
            event.reply('ipc-convert-fail-file', convertFile);
            convertingCount -= 1;
            convert();
          },
        });
      }
    }
  };

  ipcMain.on('ipc-max-task-count', async (_event, _arg) => {
    if (typeof _arg[0] === 'number') {
      logToFile('ipc-max-task-count:', _arg[0]);
      [multiThreadsCount] = _arg;
      convert();
    }
  });
  videoFileInfo$
    .pipe(
      tap(({ file }) => {
        extractSubtitlesOfFile(file, path.dirname(file));
      }),
      filter(({ needToConvert }) => needToConvert)
    )
    .subscribe({
      next({ file }) {
        logToFile('need to convert, video file:', file);
        convertQueue.push(file);
        convertQueue = [...new Set(convertQueue)];
        logToFile(`ipc-convert-queue after push:`, convertQueue.length);
        event.reply('ipc-convert-queue', convertQueue);
        convert();
      },
    });
});

const dealWithFile = (file: string) =>
  fileType
    .fromFile(file)
    .then((type) => {
      if (type) {
        const { mime } = type;
        console.log(
          '!finishedFileSet.has(file):',
          !finishedFileSet.has(file),
          ', file:',
          file
        );
        if (
          mime.startsWith('video') &&
          !finishedFileSet.has(file.toLowerCase())
        ) {
          console.log('is a video file and not in finishedFileSet:', file);
          finishedFileSet.add(file.toLowerCase());
          if (file.endsWith('mp4')) {
            console.log('before rename, set is:', finishedFileSet);
            const renameTo = getConvertOutputPath(
              file,
              'bak',
              path.dirname(file)
            );
            // eslint-disable-next-line promise/catch-or-return, promise/no-nesting
            fs.rename(file, renameTo).then(() => {
              videoFileInfo$.next({
                file: renameTo,
                needToConvert: true,
              });
            });
          } else {
            videoFileInfo$.next({
              file,
              needToConvert: true,
            });
          }
        } else if (finishedFileSet.has(file.toLowerCase())) {
          console.log('is a video file and is in finishedFileSet:', file);
          finishedFileSet.delete(file);
        }
      }
      throw new Error('is not a video file');
    })
    .catch((e) => {
      // logToFile('fileTypeFromFile e:', e);
    });

dbRoot$.subscribe({
  next(dbRoot) {
    if (!dbRoot) {
      return;
    }
    if (currentMonitor) {
      currentMonitor.stop();
    }
    logToFile('watch.createMonitor on:', dbRoot);
    watch.createMonitor(dbRoot, (monitor) => {
      currentMonitor = monitor;
      logToFile('watch.createMonitor has done, on:', dbRoot);
      monitor.on('created', (f, stat) => {
        // Handle new files
        // logToFile('f:', f);
        if (stat.isDirectory()) {
          logToFile('is a dir');
          getVideoFile$([f]).subscribe({
            next(file) {
              logToFile('dealWithFile in getVideoFile$:', file);
              if (!f.endsWith('bak')) {
                dealWithFile(file);
              }
            },
          });
          return;
        }
        logToFile('dealWithFile of single:', f);
        if (!f.endsWith('bak')) {
          dealWithFile(f);
        }
      });
    });
  },
});

ipcMain.on('ipc-on-got-db-root', async (event, arg) => {
  logToFile('ipc-on-got-db-root:', arg);
  if (arg.length > 0) {
    dbRoot$.next(arg[0]);
  }
});

ipcMain.on('ipc-select-dir', async (event, arg) => {
  dialog
    .showOpenDialog({
      title: '请选择视频目录',
      // 默认打开的路径，比如这里默认打开下载文件夹
      defaultPath: app.getPath('desktop'),
      buttonLabel: '选取目录',
      properties: ['openDirectory'],
      message: '请选择Comma视频目录',
    })
    .then(({ filePaths }) => {
      if (filePaths && filePaths.length > 0) {
        event.reply('ipc-select-dir', filePaths[0]);
        dbRoot$.next(filePaths[0]);
      }
    })
    .catch((e) => {
      console.error('showOpenDialog to selectMainDir error', e);
    });
});

ipcMain.on('ipc-show-dir', async (event, arg) => {
  shell.showItemInFolder(arg[0]);
});


if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload
    )
    .catch(logToFile);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });
  mainWindow.loadURL(resolveHtmlPath('index.html'));
  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  app.quit();
});

app
  .whenReady()
  .then(() => {
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(logToFile);

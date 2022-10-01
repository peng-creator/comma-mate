import { Button, Input, Select } from 'antd';
import { useEffect, useState } from 'react';
import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import qrcode from 'qrcode-generator';

const { Option } = Select;
const initDbRoot = localStorage.getItem('dbRoot');

if (initDbRoot !== null) {
  window.electron.ipcRenderer.sendMessage('ipc-on-got-db-root', [initDbRoot]);
}

window.electron.ipcRenderer.sendMessage('ipc-render-ready', []);

const FileList = ({ files, title }: { files: string[]; title: string }) => {
  if (files.length === 0) {
    return null;
  }
  return (
    <div>
      <div>{title}</div>
      <div
        style={{ maxHeight: '400px', overflowX: 'hidden', overflowY: 'auto' }}
      >
        {files.map((file) => {
          return <div key={file}>{file}</div>;
        })}
      </div>
    </div>
  );
};

const convertingFileSet = new Set<string>();
const failedFileSet = new Set<string>();

const Main = () => {
  const [dbRoot, setDbRoot] = useState(initDbRoot);
  const [convertQueue, setConvertQueue] = useState<string[]>([]);
  const [convertingFiles, setConvertingFiles] = useState<string[]>([]);
  const [convertFailList, setConvertFailList] = useState<string[]>([]);
  const [maxTaskCount, setMaxTaskCount] = useState(1);

  useEffect(() => {
    window.electron.ipcRenderer.sendMessage('ipc-max-task-count', [
      maxTaskCount,
    ]);
  }, [maxTaskCount]);

  useEffect(() => {
    window.electron.ipcRenderer.on('ipc-convert-queue', (...args) => {
      setConvertQueue([...new Set(args[0] as string[])]);
    });
    window.electron.ipcRenderer.on('ipc-converting-file', (...args) => {
      convertingFileSet.add(args[0] as string);
      setConvertingFiles([...convertingFileSet]);
    });
    window.electron.ipcRenderer.on('ipc-convert-success-file', (...args) => {
      convertingFileSet.delete(args[0] as string);
      setConvertingFiles([...convertingFileSet]);
    });
    window.electron.ipcRenderer.on('ipc-convert-fail-file', (...args) => {
      failedFileSet.add(args[0] as string);
      setConvertFailList([...failedFileSet]);
      convertingFileSet.delete(args[0] as string);
      setConvertingFiles([...convertingFileSet]);
    });
  }, [convertFailList, convertingFiles]);

  useEffect(() => {
    fetch('http://localhost:8080/ipaddress')
      .then((res) => res.text())
      .then((ip) => {
        const container = document.querySelector('#qrcode');
        if (container) {
          const typeNumber = 4;
          const errorCorrectionLevel = 'L';
          const qr = qrcode(typeNumber, errorCorrectionLevel);
          qr.addData(`http://${ip}:8080`);
          qr.make();
          container.innerHTML = qr.createImgTag();
        }
      });
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        width: '100%',
        padding: '20px',
      }}
    >
      <div id="qrcode" />
      <div>
        Comma Mate 将自动对数据目录及其子目录中新增的视频文件进行转码和字幕提取.
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div>数据目录</div>
        <div style={{ margin: '10px' }}>{dbRoot || '未选取'}</div>
        <div style={{ margin: '10px' }}>
          <Button
            onClick={() => {
              // calling IPC exposed from preload script
              window.electron.ipcRenderer.once('ipc-select-dir', (...args) => {
                const selectedDbRoot = args[0] as string;
                localStorage.setItem('dbRoot', selectedDbRoot);
                setDbRoot(selectedDbRoot);
              });
              window.electron.ipcRenderer.sendMessage('ipc-select-dir', []);
            }}
          >
            {dbRoot ? '更换' : '设置'}
          </Button>
          {dbRoot !== null && (
            <Button
              onClick={() => {
                window.electron.ipcRenderer.sendMessage('ipc-show-dir', [
                  dbRoot,
                ]);
              }}
            >
              打开
            </Button>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div>视频转码并行任务数量上限</div>
        <div style={{ margin: '12px' }}>
          <Select
            style={{ width: '120px' }}
            onChange={(value) => setMaxTaskCount(value)}
            value={maxTaskCount}
          >
            {new Array(10).fill(1).map((_, index) => {
              return (
                // eslint-disable-next-line react/no-array-index-key
                <Option value={index + 1} key={index}>
                  {index + 1}
                </Option>
              );
            })}
          </Select>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          width: '100%',
          justifyContent: 'space-around',
        }}
      >
        <FileList title="等待转码" files={convertQueue} />
        <FileList title="正在转码" files={convertingFiles} />
        <FileList title="转码失败" files={convertFailList} />
      </div>
    </div>
  );
};

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Main />} />
      </Routes>
    </Router>
  );
}

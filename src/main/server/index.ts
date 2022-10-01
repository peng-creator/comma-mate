/* eslint-disable consistent-return */
/* eslint-disable promise/no-nesting */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable func-names */
/* eslint-disable no-console */
/* eslint-disable no-restricted-syntax */
/* eslint-disable promise/always-return */
/* eslint-disable promise/catch-or-return */
import express from 'express';
import expressWs from 'express-ws';
import cors from 'cors';
import path from 'path';
import bodyParser from 'body-parser';
import WebSocket from 'ws';
import { firstValueFrom } from 'rxjs';
import { getSubtitleOfVideo } from './src/subtitle';
import { Ass } from './src/subtitle/ass/ass';
import { getCardCollection } from './src/card/getCardCollection';
import {
  getAllCardCollections,
  saveCard,
  searchFlashCardCollections,
} from './src/card/searchCardCollection';
// const streamer = require("./node-http-streamer/index.js");
// import serveStatic from 'serve-static';
import { loadDirChildren } from './src/resourceLoader';
import { internalIpV4 } from './ip';
import { dbRoot$ } from '../state';

export const app = express();

app.use(cors());
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));
// parse application/json
app.use(
  bodyParser.json({
    limit: '10mb',
  })
);

expressWs(app);

app.get('/api/resource/children', (req, res) => {
  loadDirChildren('').then((data) => {
    res.json(data);
  });
});

app.get('/api/resource/children/:dir', (req, res) => {
  loadDirChildren(req.params.dir).then((data) => {
    res.json(data);
  });
});

app.get('/resource/*', (req, res) => {
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range');
  firstValueFrom(dbRoot$).then((dbRoot) => {
    if (!dbRoot) {
      res.status(404);
      return;
    }
    res.sendFile(path.join(dbRoot, decodeURIComponent(req.url)));
  });
});

app.get('/ipaddress', (req, res) => {
  internalIpV4().then((result) => {
    res.send(result);
  });
});

// getting the subtitle of the video filePath, filePath 为resource的子路径
app.get('/api/video/subtitle/:filePath', (req, res) => {
  firstValueFrom(dbRoot$).then((dbRoot) => {
    if (!dbRoot) {
      res.json([]);
      return;
    }
    const videoPath = path.join(dbRoot, 'resource', req.params.filePath);
    console.log('start trying to loading subtitle of video:', videoPath);
    getSubtitleOfVideo(videoPath)
      .then((result) => {
        console.log(
          'send back subtitle of ',
          videoPath,
          ', subtitle length:',
          result.length
        );
        res.json(result);
      })
      .catch((e) => {
        console.log('load subtitle error:', e);
        res.status(500);
        res.json([]);
      });
  });
});

// getting the subtitle of the video filePath, filePath 为resource的子路径
app.post('/api/video/subtitle/:filePath', (req, res) => {
  firstValueFrom(dbRoot$)
    .then((dbRoot) => {
      if (!dbRoot) {
        res.send('success');
        return;
      }
      const videoPath = path.join(dbRoot, 'resource', req.params.filePath);
      console.log('saving subtitle of video:', videoPath);
      console.log('subtitle:', req.body);
      return Ass.saveByVideoSrc(videoPath, req.body);
    })
    .finally(() => {
      res.send('success');
    });
});

app.get('/api/card/:collectionName', (req, res) => {
  getCardCollection(req.params.collectionName)
    .then((result) => {
      res.json(result);
    })
    .catch((e) => {
      res.status(500);
      res.json([]);
    });
});

app.get('/api/card', (req, res) => {
  res.json(getAllCardCollections());
});

app.get('/api/card/collectionName/:search', (req, res) => {
  const { search } = req.params;
  if (search) {
    const result = searchFlashCardCollections(search);
    res.json(result);
  } else {
    res.status(400);
  }
});

app.post('/api/card', (req, res) => {
  saveCard(req.body)
    .then(() => {
      res.send('success');
    })
    .catch((e) => {
      res.status(500);
      res.send(e);
    });
});

const wsList = new Set<WebSocket>();
(app as any).ws('/', function (ws: WebSocket, req: any) {
  wsList.add(ws);
  ws.on('message', function (msg: string) {
    if (msg === '__ping__') {
      ws.send('__pong__');
      return;
    }
    wsList.forEach((_ws) => {
      if (_ws === ws) {
        return;
      }
      _ws.send(msg);
    });
    console.log(msg);
  });
  ws.on('close', () => {
    wsList.delete(ws);
  });
  // console.log('socket', req.testing);
});

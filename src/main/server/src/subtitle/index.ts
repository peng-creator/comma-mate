/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable promise/no-nesting */
/* eslint-disable no-console */
/* eslint-disable import/prefer-default-export */
import { promises as fs } from 'fs';
import path from 'path';
import { Ass } from './ass/ass';
import { srtToSubtitle } from './srt/srt';

export const getSubtitleOfVideo = async (videoPath: string) => {
  const cachePath = `${videoPath.slice(0, -4)}.json`;
  const dir = path.dirname(cachePath);
  console.log('load children of dir:', dir);
  let dirChildren = await fs.readdir(dir);
  dirChildren = dirChildren.filter((child) => !child.startsWith('.'));
  console.log('dirChildren:', dirChildren);
  const assList = dirChildren.filter((file) => {
    return path.extname(file).toLowerCase() === '.ass';
  });
  const srtList = dirChildren.filter((file) => {
    return path.extname(file).toLowerCase() === '.srt';
  });
  const mp4List = dirChildren.filter((file) => {
    return path.extname(file).toLowerCase() === '.mp4';
  });
  const indexOfCurrentVideo = mp4List.indexOf(path.basename(videoPath));
  if (indexOfCurrentVideo === -1) {
    console.log('没找到当前视频文件！');
    return [];
  }
  const assFilName = assList[indexOfCurrentVideo];
  const srtFileName = srtList[indexOfCurrentVideo];
  const assFilePath = path.join(dir, assFilName || '');
  const srtFilePath = path.join(dir, srtFileName || '');

  return fs
    .readFile(cachePath) // 读取字幕解析缓存。
    .then((res) => {
      console.log('reading cache...');
      const cache = JSON.parse(res.toString());
      if (cache.length > 0) {
        return cache;
      }
      throw new Error('empty cache');
    })
    .catch(() => {
      console.log('try to load srt from:', srtFilePath);
      console.log('try to load ass from:', assFilePath);
      return Promise.all([
        fs
          .readFile(srtFilePath)
          .then((srtBuf) => srtBuf.toString())
          .then((srtContent) => {
            return srtToSubtitle(srtContent);
          })
          .catch((e) => {
            return [];
          }),
        Ass.loadBySrc(assFilePath).catch((e) => {
          return [];
        }),
      ])
        .then(([srtRes, assRes]) => {
          console.log('srtRes length:', srtRes.length);
          console.log('assRes length:', assRes.length);
          return [...srtRes, ...assRes];
        })
        .then((subtitles) => {
          fs.writeFile(cachePath, JSON.stringify(subtitles));
          return subtitles;
        })
        .catch((e) => {
          console.log(
            'unexpected error when get the subtitle of video file ',
            videoPath,
            ' e:',
            e
          );
          return [];
        });
    })
    .then((subtitles) => {
      return subtitles
        .filter((s: any) => s.subtitles.length > 0)
        .map((sub: any, index: number) => {
          sub.id = index;
          return sub;
        });
    });
};

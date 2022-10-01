/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
import { firstValueFrom } from 'rxjs';
import { promises as fs } from 'fs';
import PATH from 'path';
import { dbRoot$ } from '../../state';

// eslint-disable-next-line import/prefer-default-export
export const loadDirChildren = async (dir: string) => {
  console.log('loadDirsAndArticles of dir:', dir);
  const dirs: string[] = [];
  const videos: string[] = [];
  const pdfs: string[] = [];
  console.log('await firstValueFrom(dbRoot$)');
  const dbRoot = await firstValueFrom(dbRoot$);
  console.log('await firstValueFrom(dbRoot$) ===> dbRoot:', dbRoot);
  if (!dbRoot) {
    return {
      dirs: [],
      videos: [],
      pdfs: [],
    };
  }
  const abs = PATH.join(dbRoot, 'resource', dir);
  console.log('loadDirChildren of ', abs);
  return fs
    .readdir(abs)
    .then(async (files) => {
      for (const file of files) {
        const stat = await fs.stat(PATH.join(abs, file));
        if (stat.isDirectory()) {
          dirs.push(file);
        } else if (file.toLowerCase().endsWith('mp4')) {
          videos.push(file);
        } else if (file.toLowerCase().endsWith('pdf')) {
          pdfs.push(file);
        }
      }
      return {
        dirs,
        videos,
        pdfs,
      };
    })
    .catch((e) => {
      console.log(`load child dirs of ${abs}:`, e);
      return {
        dirs,
        videos,
        pdfs,
      };
    });
};

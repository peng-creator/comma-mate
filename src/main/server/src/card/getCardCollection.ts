/* eslint-disable import/prefer-default-export */
/* eslint-disable @typescript-eslint/no-unused-vars */
import PATH from 'path';
import { v5 as uuidv5 } from 'uuid';
import { promises as fs } from 'fs';
import { CARD_COLLECTION_NAMESPACE } from '../constant';
import { FlashCard } from '../types/FlashCard';
import { firstValueFrom } from 'rxjs';
import { dbRoot$ } from '../../../../main/state';

export const getCardCollection = async (keyword: string) => {
  const dbRoot = await firstValueFrom(dbRoot$);
  if (!dbRoot) {
    return [];
  }
  const dir = PATH.join(
    dbRoot,
    'flash_cards',
    uuidv5(keyword, CARD_COLLECTION_NAMESPACE)
  );
  return fs
    .readdir(dir)
    .then((files) => {
      return Promise.all(
        files.map((file) => fs.readFile(PATH.join(dir, file)))
      );
    })
    .then((bufs) => {
      return bufs
        .map((buf) => {
          try {
            const flashCard = JSON.parse(buf.toString()) as FlashCard;
            flashCard.front.subtitles = flashCard.front.subtitles || [];
            return flashCard;
          } catch (err) {
            return null;
          }
        })
        .filter((f) => {
          return f !== null;
        });
    })
    .catch((e) => {
      return [];
    });
};

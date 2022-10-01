/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable import/prefer-default-export */
/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable func-names */
/* eslint-disable no-console */
/* eslint-disable no-continue */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
import { Observable, from, catchError } from 'rxjs';
import { mergeMap, map } from 'rxjs/operators';
import { promises as fs } from 'fs';
import child_process from 'child_process';
import path from 'path';
import { logToFile } from './log';

const ffmpeg = path.resolve(__dirname, '../../ffmpeg/ffmpeg');
const ffprobe = path.resolve(__dirname, '../../ffmpeg/ffprobe');

// eslint-disable-next-line consistent-return
async function mkdir(p: string) {
  try {
    await fs.stat(p);
  } catch (err) {
    const parent = path.resolve(p, '..');
    await mkdir(parent);
    return fs.mkdir(p);
  }
}

export const getConvertOutputPath = (
  file: string,
  aimExt: string,
  outDir: string,
  changeVideoName = (s: any) => s
) => {
  const basename = path.basename(file);
  const ext = path.extname(file);
  if (!outDir) {
    outDir = path.dirname(file);
  }
  const viedoName = changeVideoName(
    `${basename.slice(0, basename.length - ext.length)}`
  );
  return `${outDir}/${viedoName}.${aimExt}`;
};

export const getVideoFile$ = (sourcePathList: any): Observable<string> =>
  new Observable((observer) => {
    (async () => {
      const files = [...sourcePathList];
      for (const file of files) {
        const stat = await fs.stat(file);
        if (stat.isDirectory()) {
          const innerFiles = await fs.readdir(file);
          for (const innerFile of innerFiles) {
            files.push(path.join(file, innerFile));
          }
          continue;
        }
        const basename = path.basename(file);
        const extname = path.extname(file);
        const isHidingFile = basename.startsWith('.') || extname === 'bak';
        if (isHidingFile) {
          continue;
        }
        observer.next(file);
      }
      observer.complete();
    })().catch((e) => {
      logToFile(`get video files error: ${e.message}`);
      observer.error(e);
    });
  });

class Exec {
  command: string;

  args: string[];

  constructor(command: string) {
    this.command = command;
    this.args = [];
  }

  addArg(arg: string) {
    this.args.push(arg);
    return this;
  }

  run(): Promise<string> {
    return new Promise((resolve) => {
      logToFile(`command: ${this.command} ${this.args.join(' ')}`);
      const spawnObj = child_process.spawn(this.command, this.args);
      const { stderr, stdout } = spawnObj;
      let error: string | any[] | Buffer | Uint8Array | undefined;
      let out: string | any[] | Buffer | Uint8Array | undefined;
      stderr.on('data', function (data) {
        if (error === undefined) {
          error = data;
        } else {
          error = Buffer.concat([error, data], error.length + data.length);
        }
        logToFile(`stderr on data: ${error?.toString()}`);
      });
      stdout.on('data', function (data) {
        if (out === undefined) {
          out = data;
        } else {
          out = Buffer.concat([out, data], out.length + data.length);
        }
        // logToFile(`stdout on data: ${out?.toString()}`);
      });
      spawnObj.on('close', function (code) {
        // logToFile(`close code : ${code}`);
        if (out) {
          // logToFile('close out:', out.toString());
          resolve(out.toString() as string);
        } else if (error) {
          // logToFile('close error:', error.toString());
          resolve(error.toString() as string);
        }
      });
      spawnObj.on('exit', (code) => {
        // logToFile(`exit code : ${code}`);
      });
      spawnObj.on('error', (err) => {
        logToFile('启动子进程失败', err);
      });
    });
  }
}

export function convertToMp4(
  source: string,
  output: string,
  crf = 28,
  preset = 'ultrafast'
) {
  // .addArg('-vcodec')
  // .addArg(vcodec) // 'h264'
  // ffmpeg -i test.mkv -c:v libx264 -crf 23 -profile:v baseline -level 3.0 -pix_fmt yuv420p -c:a aac -ac 2 -b:a 128k -movflags faststart ksk-example.mp4
  return from(
    new Exec(ffmpeg)
      .addArg('-i')
      .addArg(source)
      .addArg('-c:v')
      .addArg('libx264')
      .addArg('-crf')
      .addArg(`${crf}`)
      .addArg('-profile:v')
      .addArg(`baseline`)
      .addArg('-level')
      .addArg(`3.0`)
      .addArg(`-pix_fmt`)
      .addArg(`yuv420p`)
      .addArg(`-c:a`)
      .addArg(`aac`)
      .addArg(`-ac`)
      .addArg(`2`)
      .addArg(`-b:a`)
      .addArg(`128k`)
      .addArg(`-movflags`)
      .addArg(`faststart`)
      // .addArg('-map')
      // .addArg('0')
      // .addArg('-c:a')
      // .addArg('copy')
      // .addArg('-c:s')
      // .addArg('copy')
      // .addArg('-preset')
      // .addArg(preset)
      // .addArg('-vtag')
      // .addArg('avc1')
      .addArg(output)
      .addArg('-y')
      .run()
  ).pipe(
    map((v) => {
      // logToFile('in map: ', v);
      return source;
    })
    // mapTo(source)
  );
}

export function getVideoInfo(source: any): Promise<string> {
  return new Exec(ffprobe)
    .addArg('-print_format')
    .addArg('json')
    .addArg('-show_streams')
    .addArg('-show_format')
    .addArg(source)
    .run();
}

function getSubtitleInfo(source: string) {
  return getVideoInfo(source)
    .then((data: string) => JSON.parse(data))
    .then((info) => {
      // logToFile('video info:', JSON.stringify(info, null, 4));
      const { streams } = info;
      return streams.filter(
        ({ codec_type }: { codec_type: string }) => codec_type === 'subtitle'
      );
    })
    .catch((e) => {
      // process.exit(1);
    });
}

function genSubtitle(source: string, index: number, output: string) {
  return new Exec(ffmpeg)
    .addArg('-i')
    .addArg(source)
    .addArg('-map')
    .addArg(`0:s:${index}`)
    .addArg(output)
    .addArg('-y')
    .run();
}

export const extractSubtitlesOfFile = (file: string, outDir: string) =>
  getSubtitleInfo(file).then((subtitleList) => {
    return Promise.all(
      subtitleList.map((s: { codec_name: string }, i: number) => {
        const ext = s.codec_name === 'subrip' ? 'srt' : 'ass';
        if (i === 0) {
          return genSubtitle(file, i, getConvertOutputPath(file, ext, outDir));
        }
        return genSubtitle(
          file,
          i,
          getConvertOutputPath(
            file,
            ext,
            outDir,
            (videoFileName) => `${videoFileName} ${i}`
          )
        );
      })
    );
  });

export const extractSubtitles = (
  sourcePathList: any,
  outDir: any,
  concurrent = 2
) => {
  const extract$ = getVideoFile$(sourcePathList).pipe(
    mergeMap((file) => {
      // const videoOutputPath = getConvertOutputPath(file, 'mp4', outDir);
      return from(extractSubtitlesOfFile(file, outDir)); // source stream
    }, concurrent)
  );
  extract$.subscribe({
    next(output) {
      logToFile(output);
    },
  });
};

export const convert = async (
  sourcePathList: any,
  outDir: any,
  concurrent = 2
) => {
  await mkdir(outDir);
  const convert$ = getVideoFile$(sourcePathList).pipe(
    mergeMap((file) => {
      const videoOutputPath = getConvertOutputPath(file, 'mp4', outDir);
      return from(convertToMp4(file, videoOutputPath)); // source stream
    }, concurrent)
  );
  convert$.subscribe({
    next(o) {
      logToFile(o);
    },
  });
};

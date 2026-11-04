// 서버 렌더: 편집 화면(studio.html?export=1)을 헤드리스 크롬으로 한 프레임씩 찍어 MP4로 만들고,
// 장면별 목소리 + 배경음악을 합친 뒤 저장소(Supabase Storage)에 올립니다.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const FPS = 30;
const LEAD = 0.6;

function run(cmd, args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: [input ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; if (err.length > 8000) err = err.slice(-8000); });
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`${cmd} 실패 (${c}): ${err.slice(-1500)}`))));
    if (input) input(p.stdin);
  });
}

// 목소리 파일 위치: 기본 음성(/assets/...)과 로컬 저장(/files/...)은 디스크 경로로, Supabase는 URL 그대로
function mediaPath(src, { publicDir, localDir }) {
  if (/^https?:\/\//.test(src)) return src;
  if (src.startsWith('/files/')) return path.join(localDir, 'files', src.slice(7));
  return path.join(publicDir, src.replace(/^\//, ''));
}

export async function renderProject({ slug, port, store, jobId, publicDir, localDir, onProgress }) {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), `render-${jobId}-`));
  const silent = path.join(work, 'video.mp4');
  const final = path.join(work, 'final.mp4');
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`http://127.0.0.1:${port}/studio.html?p=${encodeURIComponent(slug)}&export=1`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForFunction(() => window.__video && window.__video.ready === true, null, { timeout: 120000 });
    const info = await page.evaluate(() => window.__video.info());
    const total = info.scenes.reduce((a, s) => a + Math.round(s.dur * FPS), 0);

    // 1) 화면 → 무음 MP4
    let done = 0;
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), silent], {
      input: async (stdin) => {
        let t0 = 0;
        for (const s of info.scenes) {
          const n = Math.round(s.dur * FPS);
          for (let f = 0; f < n; f++) {
            await page.evaluate((t) => window.__video.seek(t), t0 + f / FPS + 1e-4);
            const jpg = await page.screenshot({ type: 'jpeg', quality: 90 });
            if (!stdin.write(jpg)) await new Promise((r) => stdin.once('drain', r));
            done++;
            if (done % 45 === 0) onProgress?.(Math.round((done / total) * 85));
          }
          t0 += s.dur;
        }
        stdin.end();
      },
    });
    onProgress?.(88);

    // 2) 목소리 + 배경음악 믹스 (음악은 목소리가 나올 때 살짝 줄어듦)
    const inputs = ['-i', silent, '-i', mediaPath(info.music, { publicDir, localDir })];
    const parts = []; const labels = [];
    let start = 0;
    info.scenes.forEach((s, i) => {
      if (s.voice) {
        inputs.push('-i', mediaPath(s.voice, { publicDir, localDir }));
        const idx = inputs.filter((x) => x === '-i').length - 1;
        const ms = Math.round((start + LEAD) * 1000);
        parts.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${(s.dur - LEAD).toFixed(2)},volume=${info.voiceVolume.toFixed(2)},adelay=${ms}|${ms}[v${i}]`);
        labels.push(`[v${i}]`);
      }
      start += s.dur;
    });
    const musicDb = 20 * Math.log10(Math.max(0.001, info.musicVolume / 0.6)) - 2;
    let fc = parts.join(';');
    if (labels.length) {
      fc += `;${labels.join('')}amix=inputs=${labels.length}:normalize=0,apad[vo];[vo]asplit[vk][vm];`;
      fc += `[1:a]volume=${musicDb.toFixed(1)}dB[mu];[mu][vk]sidechaincompress=threshold=0.03:ratio=4:attack=20:release=400[duck];[vm][duck]amix=inputs=2:normalize=0,alimiter=limit=0.95[a]`;
    } else {
      fc = `[1:a]volume=${musicDb.toFixed(1)}dB,apad[a]`;
    }
    await run('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', fc, '-map', '0:v', '-map', '[a]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', final]);
    onProgress?.(95);

    // 3) 업로드
    const buf = await fs.readFile(final);
    const url = await store.putFile(`renders/${slug}/${jobId}.mp4`, buf, 'video/mp4');
    return { url, seconds: total / FPS };
  } finally {
    await browser.close().catch(() => {});
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

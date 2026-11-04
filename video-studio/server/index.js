// HJ전자 발표 영상 스튜디오 서버 (Node 20+, 외부 프레임워크 없음)
//   GET  /                      편집 화면
//   GET  /api/health            상태 확인 (Render 헬스체크)
//   GET  /api/config            저장소 종류, 비밀번호 필요 여부
//   GET  /api/projects/:slug    프로젝트(문구·폰트·목소리) 불러오기
//   PUT  /api/projects/:slug    저장                       [편집 비밀번호]
//   POST /api/upload            목소리·폰트 파일 올리기       [편집 비밀번호]
//   POST /api/render/:slug      MP4 만들기 시작             [편집 비밀번호]
//   GET  /api/jobs/:id          렌더 진행 상황
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createStore, newId, LOCAL_DIR } from './store.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 10000);
const EDIT_PASSWORD = process.env.EDIT_PASSWORD || '';
const MAX_UPLOAD = 25 * 1024 * 1024;
const store = createStore();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.webm': 'audio/webm', '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
};

const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const authorized = (req) => !EDIT_PASSWORD || req.headers['x-edit-key'] === EDIT_PASSWORD;
const slugOk = (s) => /^[a-z0-9][a-z0-9-]{0,62}$/.test(s);

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('파일이 너무 커요 (최대 25MB)'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// 정적 파일 (오디오 탐색을 위해 Range 요청 지원)
async function serveFile(req, res, file) {
  let st;
  try { st = await fsp.stat(file); if (!st.isFile()) throw 0; } catch { return send(res, 404, { error: '없는 파일이에요' }); }
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
  const cache = file.startsWith(path.join(PUBLIC, 'assets')) ? 'public, max-age=86400' : 'no-cache';
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': cache });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': cache });
  fs.createReadStream(file).pipe(res);
}

// 렌더 작업: 한 번에 하나씩
const queue = []; let busy = false;
async function pump() {
  if (busy || !queue.length) return;
  busy = true;
  const { id, slug } = queue.shift();
  const { renderProject } = await import('./render.js');
  try {
    await store.updateJob(id, { status: 'running', progress: 1 });
    let last = 0;
    const out = await renderProject({
      slug, port: PORT, store, jobId: id, publicDir: PUBLIC, localDir: LOCAL_DIR,
      onProgress: (p) => { if (p - last >= 3) { last = p; store.updateJob(id, { progress: p }).catch(() => {}); } },
    });
    await store.updateJob(id, { status: 'done', progress: 100, output_url: out.url });
  } catch (e) {
    console.error('render failed', e);
    await store.updateJob(id, { status: 'failed', error: String(e.message || e).slice(0, 2000) }).catch(() => {});
  } finally { busy = false; pump(); }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    let m;
    if (p === '/api/health') return send(res, 200, { ok: true, storage: store.kind });
    if (p === '/api/config') return send(res, 200, { storage: store.kind, needsKey: !!EDIT_PASSWORD });

    if ((m = p.match(/^\/api\/projects\/([^/]+)$/))) {
      if (!slugOk(m[1])) return send(res, 400, { error: '프로젝트 이름은 영문 소문자, 숫자, -만 쓸 수 있어요' });
      if (req.method === 'GET') return send(res, 200, (await store.getProject(m[1])) || { slug: m[1], data: {} });
      if (req.method === 'PUT') {
        if (!authorized(req)) return send(res, 401, { error: '편집 비밀번호가 맞지 않아요' });
        const body = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString('utf8') || '{}');
        return send(res, 200, await store.saveProject(m[1], body.data || {}));
      }
    }

    if (p === '/api/upload' && req.method === 'POST') {
      if (!authorized(req)) return send(res, 401, { error: '편집 비밀번호가 맞지 않아요' });
      const slug = url.searchParams.get('p') || 'hj-signup';
      const kind = url.searchParams.get('kind');
      const ext = (url.searchParams.get('ext') || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!slugOk(slug) || !['voice', 'font'].includes(kind) || !ext) return send(res, 400, { error: '잘못된 요청이에요' });
      const okExt = kind === 'voice' ? ['webm', 'ogg', 'mp3', 'm4a', 'mp4', 'wav', 'aac'] : ['woff2', 'woff', 'ttf', 'otf'];
      if (!okExt.includes(ext)) return send(res, 400, { error: `${okExt.join(', ')} 파일만 올릴 수 있어요` });
      const buf = await readBody(req, MAX_UPLOAD);
      const name = (url.searchParams.get('scene') || 'font').replace(/[^a-z0-9_-]/gi, '');
      const key = `${kind}s/${slug}/${name}-${Date.now()}.${ext}`;
      const type = MIME['.' + ext] || req.headers['content-type'] || 'application/octet-stream';
      return send(res, 200, { url: await store.putFile(key, buf, type) });
    }

    if ((m = p.match(/^\/api\/render\/([^/]+)$/)) && req.method === 'POST') {
      if (!authorized(req)) return send(res, 401, { error: '편집 비밀번호가 맞지 않아요' });
      if (!slugOk(m[1])) return send(res, 400, { error: '잘못된 프로젝트 이름이에요' });
      if (!(await store.getProject(m[1]))) await store.saveProject(m[1], {});
      const job = { id: newId(), slug: m[1], status: 'queued', progress: 0, created_at: new Date().toISOString() };
      await store.createJob(job);
      queue.push(job); pump();
      return send(res, 202, { jobId: job.id, position: queue.length });
    }
    if ((m = p.match(/^\/api\/jobs\/([0-9a-f-]{36})$/))) {
      const job = await store.getJob(m[1]);
      return job ? send(res, 200, job) : send(res, 404, { error: '작업을 찾지 못했어요' });
    }

    if (p.startsWith('/files/') && store.kind === 'local') return serveFile(req, res, path.join(LOCAL_DIR, 'files', path.normalize(p.slice(7)).replace(/^(\.\.[/\\])+/, '')));
    if (p === '/' ) { res.writeHead(302, { Location: '/studio.html' }); return res.end(); }
    const file = path.join(PUBLIC, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'forbidden' });
    return serveFile(req, res, file);
  } catch (e) {
    console.error(e);
    send(res, e.code === 413 ? 413 : 500, { error: e.message || '서버 오류가 났어요' });
  }
});

server.listen(PORT, () => console.log(`HJ 영상 스튜디오: http://localhost:${PORT}  (저장소: ${store.kind}${EDIT_PASSWORD ? ', 편집 비밀번호 사용' : ''})`));

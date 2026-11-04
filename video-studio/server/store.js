// 저장소: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 가 있으면 Supabase(Postgres + Storage),
// 없으면 서버 디스크(data/local)에 저장합니다. 디스크 저장은 개발용이에요 — Render에서는 재배포 때 지워져요.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const LOCAL_DIR = path.join(ROOT, 'data', 'local');

function supabaseStore(url, key, bucket) {
  const base = url.replace(/\/+$/, '');
  const h = (extra = {}) => ({ apikey: key, Authorization: `Bearer ${key}`, ...extra });
  async function rest(method, p, body, prefer) {
    const res = await fetch(`${base}/rest/v1/${p}`, {
      method,
      headers: h({ 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Supabase ${method} ${p}: ${res.status} ${await res.text()}`);
    const t = await res.text();
    return t ? JSON.parse(t) : null;
  }
  return {
    kind: 'supabase',
    async getProject(slug) {
      const rows = await rest('GET', `projects?slug=eq.${encodeURIComponent(slug)}&select=slug,data,updated_at`);
      return rows[0] || null;
    },
    async saveProject(slug, data) {
      const rows = await rest('POST', 'projects?on_conflict=slug',
        [{ slug, data, updated_at: new Date().toISOString() }], 'resolution=merge-duplicates,return=representation');
      return rows[0];
    },
    async putFile(p, buf, contentType) {
      const res = await fetch(`${base}/storage/v1/object/${bucket}/${p}`, {
        method: 'POST', headers: h({ 'Content-Type': contentType, 'x-upsert': 'true', 'cache-control': '3600' }), body: buf,
      });
      if (!res.ok) throw new Error(`Supabase Storage 업로드 실패: ${res.status} ${await res.text()}`);
      return `${base}/storage/v1/object/public/${bucket}/${p}`;
    },
    async createJob(job) { return (await rest('POST', 'render_jobs', [job], 'return=representation'))[0]; },
    async updateJob(id, patch) { await rest('PATCH', `render_jobs?id=eq.${id}`, { ...patch, updated_at: new Date().toISOString() }); },
    async getJob(id) { return (await rest('GET', `render_jobs?id=eq.${id}&select=*`))[0] || null; },
  };
}

function localStore() {
  const pj = (...a) => path.join(LOCAL_DIR, ...a);
  const readJSON = async (f) => JSON.parse(await fs.readFile(f, 'utf8'));
  const writeJSON = async (f, v) => { await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, JSON.stringify(v, null, 1)); };
  return {
    kind: 'local',
    async getProject(slug) { try { return await readJSON(pj('projects', `${slug}.json`)); } catch { return null; } },
    async saveProject(slug, data) { const row = { slug, data, updated_at: new Date().toISOString() }; await writeJSON(pj('projects', `${slug}.json`), row); return row; },
    async putFile(p, buf) { const f = pj('files', p); await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, buf); return `/files/${p}`; },
    async createJob(job) { await writeJSON(pj('jobs', `${job.id}.json`), job); return job; },
    async updateJob(id, patch) { const f = pj('jobs', `${id}.json`); const j = await readJSON(f); await writeJSON(f, { ...j, ...patch, updated_at: new Date().toISOString() }); },
    async getJob(id) { try { return await readJSON(pj('jobs', `${id}.json`)); } catch { return null; } },
  };
}

export function createStore() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET = 'studio' } = process.env;
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) return supabaseStore(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET);
  return localStore();
}

export const newId = () => crypto.randomUUID();

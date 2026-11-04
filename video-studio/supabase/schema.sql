-- HJ전자 발표 영상 스튜디오 - Supabase 설정
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여 넣고 Run 하세요. 여러 번 실행해도 안전해요.

-- 1) 프로젝트: 화면 문구, 자막, 폰트, 목소리 파일 주소, 볼륨을 JSON으로 저장
create table if not exists public.projects (
  slug        text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- 2) 렌더 작업: MP4 만들기 진행 상황과 결과 주소
create table if not exists public.render_jobs (
  id          uuid primary key,
  slug        text not null references public.projects(slug) on delete cascade,
  status      text not null default 'queued' check (status in ('queued','running','done','failed')),
  progress    int  not null default 0,
  output_url  text,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists render_jobs_slug_idx on public.render_jobs (slug, created_at desc);

-- 3) 보안: 브라우저에서 직접 접근하지 못하게 RLS를 켜고 정책은 두지 않아요.
--    서버(Render)만 service_role 키로 읽고 씁니다.
alter table public.projects    enable row level security;
alter table public.render_jobs enable row level security;

-- 4) 파일 저장소: 목소리·폰트·완성 영상 (공개 읽기, 업로드는 서버만)
insert into storage.buckets (id, name, public, file_size_limit)
values ('studio', 'studio', true, 52428800)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

-- HJ전자 회원가입: Supabase 스키마
-- 실행 위치: Supabase 대시보드 > SQL Editor (여러 번 실행해도 되도록 작성)
--
-- 구조
--   auth.users (Supabase Auth가 관리: 이메일, 암호 해시, 인증 여부)
--      │ 1:1
--   public.profiles (이 파일이 만드는 표: 이름·생년월일·약관 동의)
--
-- 가입 흐름: 프런트가 signUp()에 입력값을 user metadata로 실어 보내면,
-- auth.users에 행이 생길 때 트리거가 profiles 행을 자동으로 만든다.
-- (이메일 인증 전에는 로그인 세션이 없어 프런트가 직접 INSERT 할 수 없기 때문)

-- 1) 표 ---------------------------------------------------------------
create table if not exists public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  last_name             text not null check (char_length(last_name)  between 1 and 40),
  first_name            text not null check (char_length(first_name) between 1 and 40),
  birth_date            date check (birth_date between date '1900-01-01' and current_date),
  country               text not null default 'KR',

  -- 필수 약관 3개: 가입 시점에 반드시 true (프런트가 막지만 DB도 한 번 더 막는다)
  consent_privacy       boolean not null check (consent_privacy),      -- 개인정보 수집·이용
  consent_third_party   boolean not null check (consent_third_party),  -- 개인정보 제3자 제공
  consent_overseas      boolean not null check (consent_overseas),     -- 개인정보 국외 이전
  -- 선택 동의 2개
  marketing_email       boolean not null default false,                -- 신제품·이벤트 소식 이메일
  marketing_app         boolean not null default false,                -- 앱·서비스 업데이트 소식

  consented_at          timestamptz not null default now(),            -- 약관에 동의한 시각
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.profiles is '회원 프로필. 이메일·암호는 auth.users에 있다.';

-- 2) 가입 시 profiles 자동 생성 -----------------------------------------
-- 프런트가 signUp({ options: { data: {...} } })로 보낸 값은 raw_user_meta_data에 들어 있다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''   -- security definer 함수의 표준 안전 설정
as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  bd date;
begin
  -- 생년월일 형식이 잘못돼도 가입 자체가 실패하지 않게 null로 둔다
  begin
    bd := nullif(m ->> 'birth_date', '')::date;
  exception when others then
    bd := null;
  end;

  insert into public.profiles (
    id, last_name, first_name, birth_date, country,
    consent_privacy, consent_third_party, consent_overseas,
    marketing_email, marketing_app
  ) values (
    new.id,
    coalesce(nullif(m ->> 'last_name',  ''), ''),
    coalesce(nullif(m ->> 'first_name', ''), ''),
    bd,
    coalesce(nullif(m ->> 'country', ''), 'KR'),
    coalesce((m ->> 'consent_privacy')::boolean,     false),
    coalesce((m ->> 'consent_third_party')::boolean, false),
    coalesce((m ->> 'consent_overseas')::boolean,    false),
    coalesce((m ->> 'marketing_email')::boolean,     false),
    coalesce((m ->> 'marketing_app')::boolean,       false)
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) updated_at 자동 갱신 ---------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- 4) 접근 제어 (RLS) ---------------------------------------------------
-- 원칙: 로그인한 본인 행만 읽고 고칠 수 있다. 삭제·직접 생성은 막는다.
-- 프런트에 들어가는 anon 키는 공개 값이므로, 보안은 전적으로 이 정책이 책임진다.
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using      ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- INSERT / DELETE 정책은 일부러 만들지 않는다.
--   INSERT: 트리거(security definer)만 만든다.
--   DELETE: 계정 삭제는 auth.users 삭제 시 cascade로 처리한다.

-- 필수 약관과 동의 시각은 가입 후 프런트에서 바꾸지 못하게 컬럼 단위로 권한을 좁힌다.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (last_name, first_name, birth_date, country, marketing_email, marketing_app)
  on public.profiles to authenticated;

-- 5) 가입 화면에서 "이미 가입한 이메일"을 미리 알려 주는 함수 ---------------------
-- Supabase Auth는 이미 가입한 이메일로 signUp해도 오류 없이 성공처럼 응답하므로,
-- 가입 2단계에서 미리 확인하려면 이 함수가 필요하다. (없어도 가입은 되고, 4단계에서 뒤늦게 알게 될 뿐이다)
-- 인증을 마친 계정만 true. 인증 전 계정은 false라서 같은 이메일로 다시 가입(코드 재발송)할 수 있다.
--
-- 주의: 누구나(비로그인 포함) 이 함수를 불러 이메일의 가입 여부를 알아낼 수 있다.
--   가입 화면 UX를 위해 일부러 감수한 절충이다. 이 노출이 부담스러우면 이 함수와 호출을 지운다.
create or replace function public.email_is_registered(p_email text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from auth.users
    where lower(email) = lower(p_email)
      and email_confirmed_at is not null
  );
$$;

revoke all on function public.email_is_registered(text) from public;
grant execute on function public.email_is_registered(text) to anon, authenticated;

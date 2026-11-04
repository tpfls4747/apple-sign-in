# Supabase 연결 (이 저장소에서 실제로 쓴 방식)

[SKILL.md](../SKILL.md)의 4번 "서비스 매핑" 표를 Supabase 기준으로 채운 문서다. 값 옆의 **(확인)** 은 이 프로젝트에서 직접 보거나 시험해 본 것, **(미확인)** 은 시험하지 못해 문서·기본값에 의존한 것이다. 대시보드 메뉴 이름과 기본값은 바뀔 수 있으니 의심되면 화면에서 다시 본다. (기준일: 2026-11)

참조 구현: `index.html`의 "backend: Supabase Auth" 구간(`API`, `authMsg`, `startSignup`, 재설정 폼), `supabase-config.js`, `supabase/schema.sql`, `supabase/README.md`.

## 1. 공개 키와 주소

| 값 | 프런트에 | 비고 |
| --- | --- | --- |
| Project URL `https://<ref>.supabase.co` | 넣는다 | 공개 값 |
| publishable 키 `sb_publishable_…` | 넣는다 | RLS가 켜져 있으면 브라우저에 공개돼도 안전 (Project Settings → API Keys) |
| secret 키 `sb_secret_…`, `service_role`, DB 비밀번호 | **절대 안 넣는다** | RLS를 무시한다 |

- 두 공개 값은 `supabase-config.js`의 `window.HJ_SUPABASE = {url, key}`에 둔다. 값이 바뀌면 이 파일만 고친다.
- SDK는 CDN의 UMD 빌드를 **정확한 버전으로 고정**해 불러온다(`@supabase/supabase-js@2.117.3/dist/umd/supabase.js`). 버전은 npm 레지스트리에서 공개된 지 2주 이상 된 것으로 고른다. 새 `sb_publishable_` 키로 `createClient(url, key)`가 정상 동작한다 **(확인)**.

## 2. 어댑터 함수 ↔ SDK 호출

| 어댑터 | SDK 호출 | 확인 |
| --- | --- | --- |
| `signUp` | `sb.auth.signUp({email, password, options:{data}})` | 확인 (가입·프로필 저장까지) |
| `resend` | `sb.auth.resend({type:'signup', email})` | **미확인** (재전송은 시험하지 않음) |
| `verify` | `sb.auth.verifyOtp({email, token, type:'email'})` | 확인 |
| `signIn` | `sb.auth.signInWithPassword({email, password})` | 확인 |
| `signOut` | `sb.auth.signOut()` | 확인 |
| `resetSend` | `sb.auth.resetPasswordForEmail(email)` (redirect 지정 안 함) | 확인 |
| `resetDo` | `verifyOtp({email, token, type:'recovery'})` → `updateUser({password})` | 확인 (바로 로그인됨) |
| 세션 복원 | `getSession()` + `onAuthStateChange`(`SIGNED_OUT`만 처리) | 확인 (새로고침 유지) |

- `onAuthStateChange` 콜백 안에서 다른 Supabase 호출을 하지 않는다(교착 위험). 표시용 상태만 바꾼다.
- 표시 이름은 `user.user_metadata`의 `last_name`+`first_name`에서 읽는다. 표(`profiles`)를 조회하지 않아도 되고, 표가 없어도 표시는 된다.
- 재설정을 링크가 아니라 **코드**로 하는 이유: 링크 방식은 리다이렉트 주소 등록과 복구 전용 화면, 주소의 `#` 토큰이 해시 라우터와 충돌하는 문제까지 따라온다.

## 3. 사용자 데이터와 접근 제어 (`supabase/schema.sql`)

- 이름·생년월일·국가·약관 동의는 `signUp`의 `options.data`로 보낸다 → `auth.users.raw_user_meta_data` → **트리거 `handle_new_user`** 가 `public.profiles`에 행을 만든다. 이메일 인증 전에는 세션이 없어 프런트가 직접 INSERT할 수 없기 때문이다.
- 트리거 함수는 `security definer` + `set search_path = ''`. 생년월일 변환이 실패해도 가입 자체가 실패하지 않게 `null`로 둔다.
- 필수 약관 3개는 표의 `check (…)` 제약으로 **DB가 한 번 더** 막는다. 프런트가 값을 빼먹으면 가입이 거부된다 **(미확인: 거부 시 화면에 어떻게 보이는지 시험하지 않음)**.
- RLS: `select`, `update`만 본인 행(`auth.uid() = id`)에 허용. `insert`/`delete` 정책은 일부러 만들지 않는다(삭제는 `auth.users` cascade). 컬럼 단위 `grant update (…)` 로 필수 약관·동의 시각은 가입 후 바꾸지 못하게 한다.
- 실제 저장값 **(확인)**: 국가는 `KR`이 아니라 **화면의 선택값 그대로**(예: `대한민국`)로 들어갔다. 표의 기본값 `KR`은 프런트가 값을 안 보낼 때만 쓰인다.
- SQL 실행은 사용자가 SQL Editor에 붙여 넣고 Run(`Success. No rows returned`면 성공). 에이전트는 실행 전에는 "작성만 했다"고 말한다.

## 4. 이메일 코드 설정 (가장 많이 막히는 곳)

1. **메일 템플릿은 커스텀 SMTP 없이는 수정할 수 없다 (확인).** Authentication → Emails → Templates에 "Set up custom SMTP to edit templates"가 뜨고 편집기가 잠긴다. 그래서 가입 확인 메일이 코드 없이 링크만 담은 기본 템플릿으로 나간다. → 먼저 SMTP부터 설정한다.
2. **SMTP**(Authentication → Emails → SMTP Settings): 메일 서비스로 Resend를 썼다.

   | 칸 | 값 |
   | --- | --- |
   | Sender email | `onboarding@resend.dev` |
   | Sender name | 서비스 이름 |
   | Host / Port | `smtp.resend.com` / `465` |
   | Username | `resend` |
   | Password | Resend API 키(`re_…`) — 사용자가 Supabase 화면에만 직접 입력, 채팅에 붙이지 않는다 |

   - `onboarding@resend.dev`로는 **Resend에 가입한 본인 이메일로만** 발송된다. 다른 사람에게 보내려면 본인 도메인 인증이 필요하다.
   - SMTP를 저장하면 이메일 발송 한도가 시간당 2건에서 30건으로 올랐다 (Auth 로그의 설정 반영 기록, 확인). SMTP를 켜는 것만으로는 메일이 나가지 않는다. 가입을 시도할 때 처음 나간다.
3. **템플릿 본문**: Confirm sign up과 Reset password 본문을 `{{ .Token }}`을 쓴 코드 메일로 바꾸고 Save (확인). 새로고침해서 본문이 남아 있고 "Reset template" 버튼이 생기면 저장된 것이다.
4. **코드 길이**: Authentication → Sign In / Providers → Email의 **Email OTP length**. 이 프로젝트는 기본값이 **8**이었다 **(확인)**. 6칸 입력 화면이면 6으로 바꾸고 Save(새로고침 후 유지 확인). **Email OTP expiration**은 3600초였고 그대로 뒀다(화면의 3분 타이머가 더 짧아 문제는 없다).
5. **Confirm email**: 켜져 있어야 한다(켜짐 확인).

## 5. 오류 코드 → 문구 (`authMsg`)

| 코드 | 의미 | 확인 |
| --- | --- | --- |
| `invalid_credentials` | 이메일 또는 암호 불일치 | 확인 (서버 로그 400) |
| `email_not_confirmed` | 인증 전 로그인 | 미확인 |
| `over_email_send_rate_limit`, `over_request_rate_limit`, 문구 `only request this after` | 요청 한도·재전송 간격 | 미확인 |
| `weak_password`, `same_password` | 약한 암호, 이전과 같은 암호 | 미확인 |
| `otp_expired` (코드 불일치·만료가 같은 코드로 올 수 있다), `validation_failed` | 코드 오류 | 미확인 |
| `AuthRetryableFetchError`, 문구 `failed to fetch` | 네트워크 | 미확인 |

- 재전송은 같은 사용자에게 **서버 기본 약 60초 간격**으로만 가능해서 화면 간격도 60초로 맞췄다 **(미확인: 실제 시험 안 함)**. 어기면 위 한도 오류가 온다.

## 6. 이미 가입한 이메일

이미 인증까지 마친 이메일로 `signUp`하면 **오류 없이** 가짜 사용자 객체가 오고, `user.identities`가 빈 배열이다. 가입 화면에서는 이를 감지해 2단계로 돌려 "이미 가입된 이메일이에요"를 보여 준다(`startSignup`). 인증하지 않은 이메일로 다시 가입하면 코드가 다시 발송된다. **(미확인: 이 두 경우는 이 프로젝트에서 시험하지 않았다. 코드와 문서 기준이다.)** 이 절충 때문에 가입 화면에서는 이메일 존재 여부가 드러난다.

## 7. 로그와 상태를 읽는 위치 (에이전트는 읽기만)

대시보드 주소는 `https://supabase.com/dashboard/project/<ref>/…` 뒤에 붙인다.

| 보고 싶은 것 | 경로 |
| --- | --- |
| 요청이 서버에 닿았는지 | `logs/auth-logs` — 목록에는 "request completed"만 보이므로 항목을 열어 `path`(`/token`, `/recover`…)와 `status`, `error_code`를 본다. 검색창에 `recover` 같은 단어로 걸러 낼 수 있다 |
| 사용자·발송 기록 | `auth/users` — 행을 열면 Created, Confirmation sent, Confirmed, Last signed in |
| 프로필 값 | `editor` → `profiles` (열이 많아 옆으로 넘겨야 모두 보인다) |
| 템플릿·SMTP·코드 길이 | `auth/templates`, `auth/smtp`, `auth/providers?provider=Email` |

- `/recover`는 **가입하지 않은 이메일이어도 200**으로 응답한다. 재설정 코드가 안 올 때는 입력한 이메일이 가입한 이메일과 같은지부터 본다(사용자 상세에 재설정 발송 기록이 없으면 다른 이메일일 가능성이 크다).
- 로그의 `referer`가 `http://localhost:3000`으로 찍혔다(실제 접속 주소는 다른데도). 프로젝트의 기본 사이트 주소(Site URL) 값으로 보이지만 원인은 확인하지 못했다. 요청의 출처를 가리는 용도로 쓰지 않는다.

## 8. 브라우저로 대시보드를 다룰 때의 요령

- 에이전트의 내장 브라우저가 로그인돼 있지 않으면 로그인 화면이 나온다. **로그인은 사용자가 직접** 하게 하고 끝났다는 말만 받는다.
- 코드 편집기에는 글자를 직접 타이핑해도 태그가 중복으로 닫히지 않았다 **(확인)**. 전체 선택 → 삭제 → 줄별 입력 → 줄바꿈 순으로 쓰고, 마지막에 화면에서 본문을 확인한다.
- 화면 구석의 안내 팝업이 저장 버튼 위를 가릴 수 있다. 팝업을 닫은 뒤 누르고, 눌렀는지는 **새로고침해서 값이 남았는지**로 판단한다. 클릭이 빗나갔을 수 있으니 저장 확인 없이 성공이라고 말하지 않는다.
- 값 입력칸은 삼중 클릭으로 선택해 바꾼다.

## 9. 알려진 한계

- 패스키는 연결하지 않았다. 대시보드에 Passkeys(베타) 메뉴가 있는 것만 확인했다.
- 소셜 로그인, "로그인 유지" 선택, 계정 삭제·탈퇴, 재가입 제한은 구현하지 않았다. 탈퇴 후 재가입 제한은 화면 시연용 가짜 규칙이다.
- 재전송, 5회 잠금, 이미 가입한 이메일, 이메일 미인증 로그인은 실제 서버로 시험하지 못했다.

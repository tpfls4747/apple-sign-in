# Supabase 설정 가이드

프런트(`index.html`)를 Supabase에 연결하기 전에 한 번만 하는 설정입니다. 대시보드 메뉴 이름은 업데이트로 조금 달라질 수 있어요.

## 1. 테이블 만들기

1. 대시보드 > **SQL Editor** > New query
2. [`schema.sql`](schema.sql) 전체를 붙여 넣고 **Run**
3. **Table Editor**에서 `profiles` 표가 보이면 성공

## 2. 가입 메일을 "6자리 코드"로 바꾸기

프로토타입은 이메일 링크가 아니라 6자리 코드를 입력하는 방식입니다.

1. **Authentication > Email Templates > Confirm signup**
2. 본문의 확인 링크(`{{ .ConfirmationURL }}`) 대신 코드를 넣습니다.

   ```html
   <h2>HJ전자 이메일 인증</h2>
   <p>아래 6자리 코드를 가입 화면에 입력해 주세요.</p>
   <p style="font-size:28px;letter-spacing:6px"><b>{{ .Token }}</b></p>
   ```
3. **Authentication > Providers > Email**에서 확인:
   - Confirm email: **켜짐**
   - Email OTP length: **6**
   - Email OTP expiration: 프로토타입 화면은 3분(03:00)이라 `180`초로 맞추면 일치 (허용 범위는 대시보드에서 확인)

### 암호 재설정 메일도 코드 방식으로

프런트의 암호 재설정은 링크가 아니라 6자리 코드를 입력하는 방식입니다.

1. **Authentication > Email Templates > Reset Password**
2. 확인 링크 대신 `{{ .Token }}`을 넣습니다 (위 가입 메일 예시와 같은 형태).

## 3. 메일 발송 한도

기본 메일 서버는 시간당 발송 수가 매우 적어 테스트 중에 막힐 수 있습니다. 실제로 써 보려면 **Authentication > SMTP Settings**에 Resend 등 SMTP를 연결하세요. 같은 사용자에게는 서버가 기본 60초 간격으로만 다시 보내 주기 때문에, 프런트의 재전송 간격도 60초로 맞춰 두었습니다.

## 4. 프런트에 넣을 값

**Project Settings > API**에서 아래 두 값만 복사합니다.

| 값 | 위치 | 공개 여부 |
|---|---|---|
| Project URL | `https://xxxx.supabase.co` | 공개 가능 |
| anon / publishable key | API Keys | 공개 가능 (RLS가 지켜 줌) |

> `service_role` 키와 DB 비밀번호는 절대 `index.html`이나 저장소에 넣지 마세요. 이 키는 RLS를 무시합니다.

## 5. 프런트가 보내는 값 (signUp 메타데이터)

가입 시 `signUp({ email, password, options: { data } })`의 `data`에 아래 키를 실으면, 트리거가 `profiles`에 저장합니다.

| 키 | 화면 | 형식 |
|---|---|---|
| `last_name`, `first_name` | 1단계 | 문자열 |
| `birth_date` | 1단계 | `YYYY-MM-DD` (화면의 `1995.03.12`는 변환 필요) |
| `country` | 1단계 | 화면 선택값 그대로 (예: `대한민국`) |
| `consent_privacy`, `consent_third_party`, `consent_overseas` | 3단계 필수 | `true` |
| `marketing_email`, `marketing_app` | 3단계 선택 | `true` / `false` |

필수 동의 3개 중 하나라도 `false`면 DB가 가입을 거부합니다(`profiles` 제약).

## 6. 알아둘 점

- **중복 이메일 안내**: Supabase는 이미 가입된 이메일로 `signUp`해도 오류 대신 "성공"처럼 응답하고, 대신 `user.identities`가 빈 배열로 옵니다. 프런트는 이 값으로 "이미 가입된 이메일이에요"를 보여 줍니다(`startSignup`). 이 방식은 가입 화면에서 이메일 존재 여부가 드러나는 절충이고, 로그인·암호 재설정 화면에서는 존재 여부를 알려 주지 않습니다.
- **패스키**: 이번 연결에는 포함하지 않았습니다. 로그인 화면과 가입 완료 화면의 관련 버튼은 제거하거나 "준비 중"으로 두었습니다.
- **파일 구성**: 프런트는 `supabase-config.js`의 주소와 publishable 키만 사용합니다. DB 비밀번호와 secret 키는 어디에도 넣지 않았습니다.

# HJ전자 발표 영상 스튜디오

회원가입 UX 개선 발표 영상을 웹에서 고치고, 서버에서 MP4로 다시 만드는 앱입니다.

- 화면 문구 고치기: [텍스트 편집]을 누르고 영상 속 글자를 바로 수정
- 폰트 바꾸기: 본고딕, 프리텐다드, IBM Plex Sans KR, 나눔고딕, 고운돋움, 도현 또는 내 폰트 파일(woff2·ttf·otf) 올리기
- 목소리 바꾸기: 장면마다 브라우저에서 바로 [녹음]하거나 [파일 넣기]로 내 녹음·다른 AI 음성 올리기. 녹음이 장면보다 길면 그 장면이 자동으로 늘어나요
- 자막(대본) 고치기: 장면별 입력칸에서 수정
- 효과음: 장면 전환·클릭·성공 알림 같은 중요한 순간 20곳에만 작게 들어가요. [효과음 켜짐/꺼짐]으로 끄고 켤 수 있고, 녹음 길이가 바뀌어도 모션 시점을 따라가요 (`public/assets/sfx`)
- 저장: Supabase(데이터베이스 + 파일 저장소)에 저장
- MP4 만들기: 서버가 영상을 한 프레임씩 그려 목소리·배경음악과 합친 뒤 내려받기 링크를 줘요 (2~10분)

## 구조

| 위치 | 하는 일 |
| --- | --- |
| `public/studio.html` | 편집 화면 겸 영상 플레이어 (`?p=프로젝트이름`, 기본 `hj-signup`) |
| `public/assets`, `public/data` | 실제 화면 캡처, 기본 목소리, 배경음악, 효과음, 장면 대본·길이 |
| `server/index.js` | API 서버 (Node 20, 외부 프레임워크 없음) |
| `server/store.js` | Supabase 연동 (REST API) — 키가 없으면 서버 디스크에 임시 저장 |
| `server/render.js` | 헤드리스 크롬 + ffmpeg로 MP4 렌더 |
| `supabase/schema.sql` | 테이블·저장소 생성 SQL |
| `../render.yaml` | Render 배포 설정 |

API: `GET /api/projects/:slug`, `PUT /api/projects/:slug`, `POST /api/upload?p=&kind=voice|font&scene=&ext=`, `POST /api/render/:slug`, `GET /api/jobs/:id`, `GET /api/health`. 쓰기 요청은 `x-edit-key` 헤더에 편집 비밀번호가 필요해요.

## 배포 순서

### 1. Supabase

1. https://supabase.com 에서 새 프로젝트를 만들어요.
2. SQL Editor에 `supabase/schema.sql` 내용을 붙여 넣고 Run.
3. Project Settings > API 에서 두 값을 복사해요.
   - Project URL → `SUPABASE_URL`
   - `service_role` 키 → `SUPABASE_SERVICE_ROLE_KEY` (절대 브라우저나 GitHub에 올리지 마세요. Render 환경변수에만 넣어요)

### 2. Render

1. https://render.com > New > Blueprint > 이 GitHub 저장소 선택 (브랜치 `video-studio`).
2. 환경변수 입력:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: 위에서 복사한 값
   - `EDIT_PASSWORD`: 편집·저장·렌더에 쓸 비밀번호 (비워 두면 누구나 고칠 수 있어요)
3. Apply → 몇 분 뒤 `https://hj-video-studio.onrender.com` 같은 주소가 생겨요.
4. 요금제는 `standard`(메모리 2GB)를 권장해요. 영상 렌더에 크롬과 ffmpeg를 함께 써서, 더 작은 요금제에서는 렌더가 멈출 수 있어요. 편집과 재생만 쓸 거라면 `starter`로 낮춰도 돼요.

### 로컬에서 실행

```bash
cd video-studio
npm install
npx playwright install chromium      # 처음 한 번
# ffmpeg 필요 (macOS: brew install ffmpeg)
EDIT_PASSWORD=1234 npm start          # http://localhost:10000
```

Supabase 없이 실행하면 `data/local`에 저장돼요. Supabase를 쓰려면 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 함께 넣어 실행해요.

## 참고

- 기본 목소리는 발표용으로 받은 음성이에요 (음량 -16 LUFS로 맞춘 뒤 장면별로 자름). 자막은 녹음 시점에 맞춰져 있고, 대본을 고치거나 새로 녹음하면 그 장면 자막은 글자 수 비율로 다시 계산돼요.
- 녹음 기능은 HTTPS 주소(Render 배포 주소)나 localhost에서만 마이크 권한을 받을 수 있어요.
- 렌더는 한 번에 하나씩 처리하고, 나머지는 순서를 기다려요.

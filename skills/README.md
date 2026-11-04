# 스킬

이 저장소의 HJ전자 회원가입 UX 개선 작업 과정을 Claude 스킬로 정리했습니다.

| 스킬 | 언제 쓰나 |
| --- | --- |
| [ux-signup-redesign](ux-signup-redesign/SKILL.md) | 회원가입 흐름 캡처를 UX 원칙으로 분석하고, 개선 프로토타입·개선 노트를 만들어 GitHub에 올릴 때 (전체 과정의 메인 스킬) |
| [mascot-silhouette-logo](mascot-silhouette-logo/SKILL.md) | 캐릭터 이미지에서 얼굴 실루엣만 추출해 로고 심볼과 워드마크를 만들 때 |
| [account-rejoin-restriction](account-rejoin-restriction/SKILL.md) | 탈퇴 후 30일 재가입 제한 안내 화면을 추가할 때 |
| [auth-signup-backend](auth-signup-backend/SKILL.md) | 가입 프로토타입의 가입·이메일 코드 인증·로그인·암호 재설정을 Supabase 같은 인증 서비스에 연결하거나 다른 서비스로 옮길 때 (서비스별 상세는 [providers/supabase.md](auth-signup-backend/providers/supabase.md)) |

## 설치

각 폴더(`SKILL.md`가 든 폴더)를 Claude 스킬로 등록해 씁니다. Claude Code에서는 폴더를 `~/.claude/skills/` 아래에 복사하면 됩니다.

# 서강 글벗 v3

자기소개서(한국어·영어)를 대화로 함께 고치는 튜터 챗봇. 20분 세션 = 진단이 고른 **과제 3개**를 차례로.
대화 설계는 NCF 패턴(Moore & Arar 2019)을 따른다. 근거 문서: `제안 - v3 새로 짜기 (ponytail).md` · `제안 - NCF 패턴으로 대화 설계.md` · `대본 목업 - NCF 패턴 1차.md`.

이번 판은 **텍스트 1차** — 음성은 아직 없다.

## 한 턴

```
학생 발화 ─▶ Haiku 1회 (tool: respond → move + reply + paraphrase/example + opens)
         ─▶ next(state, judge, event)  상태·과제·종료는 코드만 옮긴다
         ─▶ 결정적 검사 (2문장 상한 · 답 뒤 질문 떼기 · 인용 존재) ─▶ Supabase 저장
힌트 칩(뭐라고요/무슨 뜻이에요/예를 들면요/그만)은 라벨을 직접 보내 LLM 호출 0회.
수정 저장 ─▶ (시범 문장 그대로면 0회) Haiku 재평가 1회 → better면 done
```

## 명령

```bash
cp .env.example .env          # ANTHROPIC_API_KEY (필수), SUPABASE_* (선택 — 없으면 저장 생략)
npm install
npx netlify-cli dev           # http://localhost:8888 — 화면 + /api/* 함수
npm test                      # node:test (decide 표 테스트 · checks · 핸들러)
npm run typecheck
npm run build
npm run gold                  # 골드 29개를 실제 API로 1회 — next() 결과로 채점 (기본 .env: ../pre-dashboard_code/.env)
```

Supabase: 새 프로젝트에서 `supabase/schema.sql` 실행. 서버만 service_role 키로 쓴다(RLS 켬, 정책 없음).
Netlify: 진단(Sonnet)이 10초를 넘을 수 있어 함수 시간 제한을 26초로 올려 둔다.

## 파일

| 파일 | 하는 일 |
|---|---|
| `src/state.ts` | SessionState · Task · Judge · 이벤트 타입, 시간 예산 상수 |
| `src/decide.ts` | `next()` — 13 라벨 · B4.4 · UNCLEAR 1/2/3 · 과제 전환 · 시간 제안 · 마무리. 순수 함수 |
| `src/lines.ts` | 코드가 직접 말하는 문장(ko/en) · 마무리 파트(과제 표에서만) |
| `src/checks.ts` | 문장 상한 · 답 뒤 질문 떼기 · 인용 검사 · 시간 · 상투 표현 사전(v2 이식) |
| `src/prompt.ts` | 프롬프트 .md 읽기 + 열린 패턴/지금 과제/다음 칸 채우기 · respond 도구 |
| `src/respond.ts` | Haiku 한 번 + 출력 검증 + 길이 검사 |
| `src/llm.ts` | Anthropic Messages 호출 하나(도구 강제, 시간 제한, 사용자용 오류) |
| `src/validate.ts` | 요청 본문·클라이언트 상태·LLM 출력 손 검사 |
| `src/db.ts` · `src/http.ts` | Supabase 저장(없으면 생략) · 응답 봉투 `{ok, data, error}` |
| `src/prompts/*.md` | tutor.ko/en · diagnose · evaluate · summary |
| `netlify/functions/` | `diagnose` (Sonnet) · `turn` (Haiku) · `evaluate` (Haiku) · `summary` (Sonnet) |
| `src/client/` | Landing · Session(대화·칩·글 패널·과제 목록) · Summary(과제 표·처음/끝 글) |
| `tests/` | `decide.test.ts` 목업 표 테스트 · `checks.test.ts` · `handlers.test.ts` |
| `experiments/gold_eval.mjs` | 골드 29개를 v3 턴 경로로, 라벨이 아니라 `next()` 결과로 채점 |

## 다음 단계

- lab-server 음성 연결 + VAD (끼어들기 시 TTS 멈춤, `last.played`에 재생된 부분만)
- TTS 문장 단위 스트리밍 (0.3초 쉼)
- 끼어들기(barge-in)와 응답 전 지연(ms)을 judge 입력에
- 힌트 칩 확장 (상태별 칩, "다른 거 할래요" 등)
- Jev 판정기 — 지금은 Haiku가 응답과 함께 판정
- NCF 1차 미룬 것: 부분 반복·들음 확인·HOLD·OFFENSE·잡담 라벨 · A4 퀴즈 흐름 · C1.7 · "네/네?" 억양 · 숫자 되읽기(M3-c) · 영어 목업

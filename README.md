# 서강 글벗 v3

자기소개서(한국어·영어)를 대화로 함께 고치는 튜터 챗봇. 20분 세션 = 진단이 고른 **과제 3개**를 차례로.
대화 설계는 NCF 패턴(Moore & Arar 2019)을 따른다. 근거 문서: `제안 - v3 새로 짜기 (ponytail).md` · `제안 - NCF 패턴으로 대화 설계.md` · `대본 목업 - NCF 패턴 1차.md`.

음성은 브라우저 내장 음성 인식 + 서버 TTS(Google) — 연구실 lab-server로 바꿀 때 `src/client/voice/`만 교체한다.

## 한 턴

```
학생 발화 ─▶ Haiku 1회 (tool: respond → move + reply + paraphrase/example + opens + criteria(A2.6일 때))
         ─▶ TutoringSession(국면 클래스)  상태·과제·종료는 코드만 옮긴다
         ─▶ 결정적 검사 (2문장 상한 · 이끄는 끝 질문 · 인용 존재) ─▶ Supabase 저장
힌트 칩(뭐라고요/무슨 뜻이에요/예를 들면요/그만)은 라벨을 직접 보내 LLM 호출 0회.
수정 저장 ─▶ 과제의 완료 항목(체크리스트)마다 판정: 코드 항목(상투 표현)은 코드가, 나머지는 Haiku 1회
         ─▶ 전부 충족이면 확인 질문("이 문단이 뭘 주장하고 뭐가 받쳐 주죠?") → 학생이 짚으면 done, 아니면 못 채운 항목이 힌트 (ARCHITECTURE.md 6절)
튜터는 문장을 써 주지 않는다 — 막히면 틀 · 다른 사람의 예 · 학생 재료의 자리를 보여 준다 (비계). 재료가 없다고 하면 이력서·다른 문단에서 바꿔 준다
돌지 않기: 과제마다 이미 정해진 것(notes)·직전 힌트·확인 질문 횟수를 기억한다. 구조 과제(문장 이동·문단 추가·삭제)는 문단 여럿을 고친다
세션 끝   ─▶ Sonnet 요약 + 끝 글을 처음과 같은 5축 루브릭으로 재진단 (처음/끝 비교)
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

Supabase: 새 프로젝트에서 `supabase/schema.sql` 실행, 이미 있는 DB는 `supabase/migrations/`를 차례로. 서버만 service_role 키로 쓴다(RLS 켬, 정책 없음).
Netlify: 진단(Sonnet)이 10초를 넘을 수 있어 함수 시간 제한을 26초로 올려 둔다.

## 파일

| 파일 | 하는 일 |
|---|---|
| `src/state.ts` | SessionState · Task · Judge · 이벤트 타입, 시간 예산 상수 |
| `src/conversation/` | 대화 흐름 — `TutoringSession` + 국면 클래스(State 패턴): 15 라벨 · B4.4 · UNCLEAR 1/2/3 · 막힘·다른 요청 · 과제 전환 · 시간 규칙 · 마무리. 지도: `FLOW.md` |
| `src/decide.ts` | 예전 입구 `next()` — `TutoringSession`에 위임 (테스트·실험용) |
| **`src/prompts.ts`** | **모델이 읽는 글과 코드가 말하는 문장 전부 한 파일** (v2 `prompts.ts`와 같은 자리) — 0 공통 · 1 턴(ko/en · 다음 칸 · 덧붙임 줄 · 기록 문장) · 2 진단·재진단·루브릭 · 3 재평가 · 4 요약 · 5 코드가 말하는 줄. 맨 위에 고치는 법·목차·짝 표시. 고친 뒤 `npm test -- tests/prompts.test.ts`가 무엇이 바뀌었는지 보여 준다 (`tests/snapshots/prompts.md`) |
| `src/lines.ts` | `prompts.ts` 5장 재수출 · 마무리 파트(과제 표에서만) |
| `src/checks.ts` | 문장 상한 · 답 뒤 질문 떼기 · 인용 검사 · 시간 · 상투 표현 사전(v2 이식) |
| `src/server/handlers/` | 함수 본문 클래스 (Diagnose · Turn · Evaluate · Summary · Tts) |
| `src/server/services/` | `TurnResponder`(Haiku 한 번 + 길이 검사) · `Diagnoser`(첫 진단 · 끝 재진단) · `Evaluator`(완료 항목 판정) · `Summarizer` · `TtsService` |
| `src/server/llm/` | `LlmClient`(구조화된 출력, 시간 제한, 사용자용 오류) · `TurnPrompt`(1장의 글에 사실을 채우는 조립) |
| `src/server/parse/` | `RequestParser`(요청 본문·클라이언트 상태) · `LlmOutputParser`(모델 출력, 스키마는 `outputs/`) |
| `src/server/store/` · `src/server/http/` | Supabase 저장(없으면 생략) · 응답 봉투 `{ok, data, error}` |
| `netlify/functions/` | `diagnose` (Sonnet) · `turn` (Haiku) · `evaluate` (Haiku) · `summary` (Sonnet) |
| `src/client/` | Landing · Session(대화·칩·글 패널·과제 목록) · Summary(과제 표·처음/끝 글) · `SessionController` · `voice/`(TutorSpeaker · BargeInDetector · SpeechListener) |
| `tests/` | `decide.test.ts` 목업 표 테스트 · `conversation.test.ts` 국면 · `criteria.test.ts` 완료 항목 · `prompts.test.ts` 프롬프트 스냅샷 · `llm.test.ts` thinking 끔 · `ca.test.ts` · `sessionController.test.ts` · `checks` · `handlers` · `validate` |
| `experiments/gold_eval.mjs` | 골드 29개를 v3 턴 경로로, 라벨이 아니라 `next()` 결과로 채점 |

## 다음 단계

- lab-server 음성 연결 + VAD (끼어들기 시 TTS 멈춤, `last.played`에 재생된 부분만)
- TTS 문장 단위 스트리밍 (0.3초 쉼)
- 끼어들기(barge-in)와 응답 전 지연(ms)을 judge 입력에
- 힌트 칩 확장 (상태별 칩, "다른 거 할래요" 등)
- Jev 판정기 — 지금은 Haiku가 응답과 함께 판정
- NCF 1차 미룬 것: 부분 반복·들음 확인·HOLD·OFFENSE·잡담 라벨 · A4 퀴즈 흐름 · C1.7 · "네/네?" 억양 · 숫자 되읽기(M3-c) · 영어 목업

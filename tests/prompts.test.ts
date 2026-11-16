// 프롬프트 스냅샷 — 고정 상태로 채운 프롬프트를 tests/snapshots/prompts.md와 글자 그대로 대조한다.
// src/prompts.ts(또는 조립 코드)를 고치면 이 테스트가 **무엇이 바뀌었는지** 보여 준다.
// 일부러 고친 것이면:  UPDATE_SNAPSHOTS=1 npm test -- tests/prompts.test.ts   (기준을 갱신하고 diff를 커밋에 남긴다)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { next } from '../src/decide';
import { Tasks } from '../src/conversation/Tasks';
import { closingParts } from '../src/lines';
import { TurnPrompt } from '../src/server/llm/TurnPrompt';
import { Diagnoser } from '../src/server/services/Diagnoser';
import { Evaluator } from '../src/server/services/Evaluator';
import { Summarizer } from '../src/server/services/Summarizer';
import { activeTask, type SessionState } from '../src/state';
import { ESSAY, fresh, j, MIN, POSTING, T0 } from './fixture';

const SNAP = join(process.cwd(), 'tests', 'snapshots', 'prompts.md');
const ctx = { posting: POSTING, paragraphs: ESSAY, resume: 'TOEIC 985 · 과외 2년 · 동아리 회계' };
const p = new TurnPrompt();

const t1Active = (): SessionState => {
  let s = fresh();
  for (let i = 0; i < 3; i++) s = next(s, null, { kind: 'pause', now: T0 }).state;
  return next(s, j('ACCEPT'), { kind: 'say', text: '네', now: T0 }).state; // 과제 1 active, A5.1 열림
};

// 상태마다 하나 — 다음 칸·덧붙임 줄·표가 다 보이는 자리들
function render(): Record<string, string> {
  const s = t1Active();
  const confirmed = Tasks.note(Tasks.confirmCriteria(s, 't1', ['2문단에 예산표를 공유 시트로 만든 행동이 들어간다', '2문단에 예산을 넘기지 않은 결과가 들어간다'], '예산표로 갈등을 푼 경험'), 't1', '결론 확정: 예산표로 갈등을 푼 경험');
  const judged = Tasks.applyVerdict(confirmed, 't1', { done: false, met: ['a1'], reason: '', evidence: { a1: '공유 시트를 만들어' } });
  const stuck = Tasks.update(judged, 't1', { lastHint: '그래서 어떻게 됐는지도 넣어 볼래요?', stuckOn: 'a2', stuckCount: 2 });
  const form = Tasks.update({ ...s, open: null }, 't1', { kind: 'form' });
  const structure = Tasks.update({ ...s, open: null }, 't1', { kind: 'structure', target: { paragraph: 1, paragraphs: [1, 3] } });
  const en: SessionState = { ...s, lang: 'en' };
  const out: Record<string, string> = {
    '턴 · 브리핑 (과제 시작 제안이 열림)': p.system(fresh(), ctx),
    '턴 · 내용 과제 — 듣기 (A5.1 열림)': p.system(s, ctx),
    '턴 · 내용 과제 — 결론 확정 뒤 고치기 (항목 ✓/✗ · 정해진 것)': p.system({ ...judged, open: null }, ctx),
    '턴 · 확인 질문 A4': p.system({ ...judged, open: { pattern: 'A4', firstPair: '지금 2문단이 하고 싶은 말이 뭐고, 어느 문장이 그걸 받쳐 주죠?' } }, ctx),
    '턴 · 막힘 1회 뒤 (비계 안내) + 끼어들기': p.system({ ...s, confusedStreak: 1 }, ctx, true),
    '턴 · 막힘 2회 뒤 (자리 불러 주기) · 못 알아들음 1회 · 다른 요청 1회': p.system({ ...s, confusedStreak: 2, unclearStreak: 1, offGoalCount: 1 }, ctx),
    '턴 · 형식 과제 — 합의 전': p.system(form, ctx),
    '턴 · 구조 과제': p.system(structure, ctx),
    '턴 · 영어 — 듣기': p.system(en, { ...ctx, resume: '' }),
    '턴 · user (대화 기록)': p.user([{ who: 'tutor', text: '2문단 협업 얘기예요. 같이 뭔가 해낸 일이 있었어요?' }, { who: 'student', text: '동아리에서 예산 때문에 싸웠어요' }], '그래서 시트를 만들었어요', 'ko'),
    '진단 · 첫 진단 (공고·이력서 있음)': Diagnoser.prompt(ctx, 'ko', ctx.resume),
    '진단 · 첫 진단 (공고·이력서 없음, 영어)': Diagnoser.prompt({ posting: '', paragraphs: ESSAY, resume: '' }, 'en', ''),
    '진단 · 끝 재진단': Diagnoser.regradePrompt(ctx, 'ko', ctx.resume),
    '재평가 · 항목 2개 (새 내용 표시)': Evaluator.prompt(activeTask(confirmed)!, { originals: ESSAY, paragraphs: ESSAY.map((x, i) => (i === 1 ? `${x} 공유 시트를 만들어 예산을 지켰습니다.` : x)), resume: ctx.resume }, 'ko'),
    '재평가 · 막힘 2회 — 직전 힌트 · 재료 창고': Evaluator.prompt(activeTask(stuck)!, { originals: ESSAY, paragraphs: ESSAY, resume: ctx.resume }, 'ko'),
    '재평가 · 구조 과제 (문단 둘)': Evaluator.prompt(activeTask(structure)!, { originals: ESSAY, paragraphs: ESSAY }, 'ko'),
    '요약': Summarizer.prompt(Tasks.update(judged, 't1', { status: 'done', endedAt: T0 + 6 * MIN }), ESSAY, ESSAY.map((x, i) => (i === 1 ? `${x} (고침)` : x)), T0 + 12 * MIN),
    '코드가 말하는 마무리 파트': closingParts('ko', Tasks.update(judged, 't1', { status: 'done' }).tasks).join('\n'),
  };
  return out;
}

const toText = (r: Record<string, string>) => Object.entries(r).map(([k, v]) => `### ${k}\n\n${v.trimEnd()}\n`).join('\n');

test('프롬프트 스냅샷 — 빈칸이 다 채워지고, 기준과 글자 그대로 같다', () => {
  const r = render();
  for (const [k, v] of Object.entries(r)) assert.ok(!v.includes('{{'), `${k}: 채워지지 않은 빈칸`);
  const now = toText(r);
  if (process.env.UPDATE_SNAPSHOTS || !existsSync(SNAP)) {
    mkdirSync(join(SNAP, '..'), { recursive: true });
    writeFileSync(SNAP, now);
    return;
  }
  const was = readFileSync(SNAP, 'utf8');
  if (was !== now) {
    const a = was.split('\n'), b = now.split('\n');
    const i = a.findIndex((l, k) => l !== b[k]);
    assert.fail(`프롬프트가 기준(tests/snapshots/prompts.md)과 다르다 — 첫 차이 ${i + 1}째 줄:\n  기준: ${a[i] ?? '(없음)'}\n  지금: ${b[i] ?? '(없음)'}\n일부러 고친 것이면 UPDATE_SNAPSHOTS=1 npm test -- tests/prompts.test.ts`);
  }
});

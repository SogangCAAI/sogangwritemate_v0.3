// 대본 목업의 공통 자료 (지어낸 글) — decide.test · gold_eval이 같이 쓴다
import { newSession } from '../src/decide';
import { emptyJudge, type Judge, type Move, type SessionState, type Task } from '../src/state';

export const POSTING = '한빛물류 데이터분석 인턴. 요구: 데이터로 문제를 정의하고 푼 경험 · 여러 부서와의 협업 · SQL 또는 R.';

export const ESSAY = [
  '저는 데이터로 문제를 해결하는 사람입니다. 한빛물류 데이터분석 인턴에 지원합니다.',
  '학교 마케팅 동아리에서 회장으로 활동하며 리더십을 길렀습니다. 다양한 사람들과 소통하는 법을 배웠습니다.',
  '통계 수업에서 R을 배웠고 열정을 가지고 공부했습니다. 입사 후 최선을 다하겠습니다.',
];

const task = (id: string, order: 1 | 2 | 3, kind: Task['kind'], paragraph: number, keyword: string, goal: string, doneWhen: string): Task => ({
  id, order, kind, target: { paragraph, keyword }, goal, doneWhen,
  status: 'pending', fromExemplar: false, turns: 0, edits: 0, experience: [], nudged: false,
});

export const TASKS: Task[] = [
  task('t1', 1, 'content', 2, '협업', '2문단에 협업 경험 넣기', '2문단에 학생이 직접 한 행동과 결과가 하나 이상 들어간다'),
  task('t2', 2, 'content', 1, '지원 동기', '1문단에 지원 이유 넣기', '1문단이 이 회사·직무를 고른 이유를 한 문장 이상 말한다'),
  task('t3', 3, 'form', 3, '상투 표현', '3문단 표현 다듬기', '3문단에 두 상투 표현이 없고 그 자리에 구체적 내용이 있다'),
];

export const BRIEFING = [
  '먼저, 데이터로 문제를 푼다는 첫 문장은 공고와 잘 맞아요. 다만 그걸 보여 줄 경험이 글에 아직 없어요.',
  '다음으로, 오늘은 세 가지를 하려고 해요. 2문단에 협업 경험 넣기, 1문단에 지원 이유 넣기, 3문단 표현 다듬기예요.',
  '마지막으로, 하나 끝날 때마다 고친 문단을 같이 확인하고 넘어갈게요.',
];

export const T0 = 1_000_000;
export const MIN = 60_000;

export function fresh(): SessionState {
  return newSession({ id: 's1', lang: 'ko', tasks: TASKS, briefing: BRIEFING, now: T0 });
}

// 모델이 낸 판정 — reply·opens 등은 필요한 것만 채운다
export function j(move: Move, extra: Partial<Judge> = {}): Judge {
  return { ...emptyJudge(move), reply: `(모델 응답:${move})`, ...extra };
}

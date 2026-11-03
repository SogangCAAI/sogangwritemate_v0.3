// next(state, judge, event) — 예전 순수 함수 입구를 그대로 둔다 (테스트·실험이 쓴다).
// 실제 흐름은 src/conversation/TutoringSession.ts (국면별 클래스, 표는 FLOW.md).
// 순수: 입력 상태를 바꾸지 않고 새 상태를 돌려준다. LLM·시계·네트워크 없음 (시각은 event.now로 받는다).
import type { Judge, Lang, Outcome, SessionState, Task, TurnEvent } from './state';
import { TutoringSession } from './conversation/TutoringSession';

export function next(s: SessionState, judge: Judge | null, ev: TurnEvent): Outcome {
  return TutoringSession.from(s).handle(judge, ev);
}

// 클라이언트가 쉼(맞장구로 보는 침묵) 이벤트를 보내야 하는 상태인가
export function wantsPause(s: SessionState): boolean {
  return TutoringSession.from(s).wantsPause;
}

// 학생이 대상 문단을 고쳤을 때 재평가(Haiku)를 불러야 하나 — 시범 문장을 그대로 넣었으면 부르지 않는다
export function editNeedsEval(s: SessionState, paragraph: number, after: string): boolean {
  return TutoringSession.from(s).editNeedsEval(paragraph, after);
}

export function newSession(a: { id: string; lang: Lang; tasks: Task[]; briefing: string[]; now: number }): SessionState {
  return TutoringSession.start(a).toState();
}

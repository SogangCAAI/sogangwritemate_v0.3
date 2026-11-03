// 세션 진행표 — 여러 국면이 함께 쓰는 '다음으로 가기' 이동 (모두 코드가 말한다)
//   A3 파트 넘기기 · 다음 과제 제안(P1) · 마무리 시작(C4.0) · 시간 제안(P1:moveOn / P1:close)
import { activeTask, CLOSE_AT_LEFT_MS, NEXT_TASK_MIN_LEFT_MS, type Outcome, type SessionState } from '../state';
import { closingParts, lines } from '../lines';
import { sessionLeftMs } from '../checks';
import { Say } from './Say';
import { Tasks } from './Tasks';

export class Agenda {
  // A3 다음 파트 — 브리핑과 마무리 요약이 함께 쓴다. 파트가 끝났으면 아무 말도 하지 않는다
  static nextPart(s: SessionState): Outcome {
    const idx = (s.open?.part ?? 0) + 1;
    const parts = s.open?.parts ?? [];
    if (idx >= parts.length) return Say.nothing(s);
    return Agenda.servePart({ ...s, stage: s.stage === 'opening' ? 'briefing' : s.stage }, idx, parts[idx]!);
  }

  // 파트 하나를 말한다. 마지막 파트는 다음 첫째 짝을 연다: 마무리면 성공 확인(C4), 브리핑이면 과제 시작 제안(P1)
  static servePart(s: SessionState, idx: number, text: string): Outcome {
    const parts = s.open?.parts ?? [];
    if (idx < parts.length - 1) return Say.code(s, text, { pattern: 'A3', firstPair: text, parts, part: idx }, 'A3');
    if (s.stage === 'closing') return Say.code(s, text, { pattern: 'C4', firstPair: text }, 'C4.6');
    const t = Tasks.firstPending(s);
    return Say.code(s, text, t ? Tasks.proposal(text, t) : null, 'A3');
  }

  // 다음 과제 시작을 제안한다(P1). 남은 과제가 없거나 시간이 모자라면 마무리로 — 과제 2·3은 시간이 될 때만
  // closeLead: 마무리로 갈 때 기본 머리말("정리하고 끝낼게요") 대신 쓸 말
  static proposeNext(s: SessionState, now: number, lead = '', closeLead?: string): Outcome {
    const t = Tasks.firstPending(s);
    if (!t || sessionLeftMs(s, now) < NEXT_TASK_MIN_LEFT_MS) return Agenda.startClosing(s, true, closeLead);
    const say = [lead, lines(s.lang).proposeTask(t.goal)].filter(Boolean).join(' ');
    return Say.code({ ...s, repaired: false }, say, Tasks.proposal(say, t), 'P1');
  }

  // 마무리(C4.0) — 작별 전에 과제 표로 만든 요약 파트(A3)부터
  static startClosing(s: SessionState, withLead: boolean, lead?: string): Outcome {
    const L = lines(s.lang);
    const parts = closingParts(s.lang, s.tasks);
    const first = withLead ? `${lead ?? L.closingLead} ${parts[0]}` : parts[0]!;
    const s1: SessionState = {
      ...s, stage: 'closing', repaired: false, unclearStreak: 0,
      open: { pattern: 'A3', firstPair: first, parts, part: 0 },
    };
    return { ...Agenda.servePart(s1, 0, first), agentAction: 'C4.0' };
  }

  // 과제 중에 남은 시간이 CLOSE_AT_LEFT_MS 이하인가 — 그러면 20분 전에 마무리를 시작한다
  static timeUp(s: SessionState, now: number): boolean {
    return (s.stage === 'content' || s.stage === 'form') && sessionLeftMs(s, now) <= CLOSE_AT_LEFT_MS;
  }

  // 시간이 다 됐다 — 제안하지 않고 마무리를 시작한다. 하던 과제는 timeout으로 남긴다
  static closeForTime(s: SessionState, now: number): Outcome {
    const t = activeTask(s);
    const s1 = t ? Tasks.finish(s, 'timeout', now) : s;
    return Agenda.startClosing({ ...s1, open: null }, true, lines(s.lang).timeUp);
  }

  // 튜터가 이미 정한 말(o) 대신 마무리를 시작할지 본다. 과제 시간 예산으로 '다음으로' 넘기지 않는다 (과제 1에 집중)
  static nudge(o: Outcome, now: number): Outcome {
    return Agenda.timeUp(o.state, now) ? Agenda.closeForTime(o.state, now) : o;
  }
}

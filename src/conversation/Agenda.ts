// 세션 진행표 — 여러 국면이 함께 쓰는 '다음으로 가기' 이동 (모두 코드가 말한다)
//   A3 파트 넘기기 · 다음 과제 제안(P1) · 마무리 시작(C4.0) · 시간 제안(P1:moveOn / P1:close)
import { activeTask, CLOSE_WARN_MS, TASK_BUDGET_MS, type Outcome, type SessionState } from '../state';
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

  // 다음 과제 시작을 제안한다(P1). 남은 과제가 없으면 마무리로
  static proposeNext(s: SessionState, lead = ''): Outcome {
    const t = Tasks.firstPending(s);
    if (!t) return Agenda.startClosing(s, true);
    const say = [lead, lines(s.lang).proposeTask(t.goal)].filter(Boolean).join(' ');
    return Say.code({ ...s, repaired: false }, say, Tasks.proposal(say, t), 'P1');
  }

  // 마무리(C4.0) — 작별 전에 과제 표로 만든 요약 파트(A3)부터
  static startClosing(s: SessionState, withLead: boolean): Outcome {
    const L = lines(s.lang);
    const parts = closingParts(s.lang, s.tasks);
    const first = withLead ? `${L.closingLead} ${parts[0]}` : parts[0]!;
    const s1: SessionState = {
      ...s, stage: 'closing', repaired: false, unclearStreak: 0,
      open: { pattern: 'A3', firstPair: first, parts, part: 0 },
    };
    return { ...Agenda.servePart(s1, 0, first), agentAction: 'C4.0' };
  }

  // 시간 예산은 강제가 아니라 제안이다 — 세션 마감이 과제 예산보다 먼저.
  // 튜터가 이미 정한 말(o) 대신 시간 제안을 할지 본다
  static nudge(o: Outcome, now: number): Outcome {
    const s = o.state;
    if (s.open?.effect || (s.stage !== 'content' && s.stage !== 'form')) return o;
    const L = lines(s.lang);
    const left = sessionLeftMs(s, now);
    if (left <= CLOSE_WARN_MS) {
      // 마감이 가까우면 '다음 과제로' 제안은 하지 않는다 — 마무리 제안 한 번뿐
      if (s.closeOffered) return o;
      const say = L.closeSoon(Math.max(1, Math.ceil(left / 60_000)));
      return Say.code({ ...s, closeOffered: true }, say, { pattern: 'P1', firstPair: say, effect: 'close' }, 'P1:close');
    }
    const t = activeTask(s);
    if (t && !t.nudged && t.startedAt !== undefined && now - t.startedAt >= TASK_BUDGET_MS) {
      const say = L.moveOn(t.goal);
      return Say.code(Tasks.update(s, t.id, { nudged: true }), say, { pattern: 'P1', firstPair: say, effect: 'moveOn' }, 'P1:moveOn');
    }
    return o;
  }
}

// 브리핑 — NCF A3 Extended Telling (+ C1 인사)
// 튜터가 방금 한 일: 인사 또는 진단 브리핑 파트 하나를 말했다 (코드가 말함 · 파트는 진단이 만든 3개).
// 나가는 길:
//   쉼 · 맞장구 · 답 · 수락 · 거절 · 인정 → 다음 파트 (마지막 파트 = 과제 1 시작 제안 → TaskProposalPhase)
//   질문 · 써 달라                    → 모델이 답하고 브리핑은 열린 채 (기본값)
//   그만(A3.1)                       → 남은 파트를 건너뛰고 바로 과제 1 시작 제안
import type { Judge, Outcome } from '../../state';
import { lines } from '../../lines';
import { Agenda } from '../Agenda';
import { Phase } from '../Phase';
import { Say } from '../Say';
import { Tasks } from '../Tasks';

export class BriefingPhase extends Phase {
  readonly name = 'briefing';

  override get awaitsPause(): boolean {
    return true;
  }

  // 브리핑 중의 "네"·"음"은 판정이 무엇이든 '계속하세요'로 본다
  private advance(): Outcome {
    return Agenda.nextPart({ ...this.s, repaired: false });
  }

  override onAnswer(): Outcome { return this.advance(); }
  override onContinuer(): Outcome { return this.advance(); }
  override onAccept(): Outcome { return this.advance(); }
  override onReject(): Outcome { return this.advance(); }
  override onCloser(_j: Judge): Outcome { return this.advance(); }

  // 쉼 = 맞장구 — 학생 발화를 기다리지 않고 다음 파트로
  override onPause(): Outcome {
    return Agenda.nextPart(this.s);
  }

  override onAbort(): Outcome {
    const L = lines(this.s.lang);
    const base = { ...this.s, repaired: false, unclearStreak: 0, stage: 'briefing' as const };
    const t = Tasks.firstPending(this.s);
    const say = t ? `${L.abortBriefing} ${L.firstTask(t.goal)}` : L.abortBriefing;
    return Say.code(base, say, t ? Tasks.proposal(say, t) : null, 'A3.1');
  }
}

// 마무리 — NCF C4 Closing: C4.0 Last Topic(요약 파트, A3) → C4.6 Success Check → 작별
// 튜터가 방금 한 일 (코드): "먼저, ○○ — 끝냈어요." 같은 요약 파트, 마지막 파트 끝에 "처음보다 나아진 것 같아요?"(C4)
// 나가는 길:
//   요약 파트(A3) 중 — 쉼·맞장구·답·수락·거절·인정 → 다음 파트 (마지막 = 성공 확인 C4)
//   성공 확인(C4)에 긍정     → helped=true, 모델이 작별 → EndedPhase
//   성공 확인(C4)에 부정     → helped=false, 무엇이 걸리는지 한 번 더 듣는다(C4.7) → 그다음 말에 작별 → EndedPhase
//   요약 중 질문·써 달라, 또는 C4 뒤의 아무 말 → 모델이 답하고 작별 → EndedPhase
//   그만                    → "수고 많았어요" (코드) → EndedPhase
import type { Judge, Outcome } from '../../state';
import { lines } from '../../lines';
import { Agenda } from '../Agenda';
import { Phase } from '../Phase';
import { Say } from '../Say';

export class ClosingPhase extends Phase {
  readonly name = 'closing';

  // 요약 파트(A3)를 말하는 중인가
  private get summarizing(): boolean {
    return this.s.open?.pattern === 'A3';
  }

  override get awaitsPause(): boolean {
    return this.summarizing;
  }

  private advanceOr(j: Judge): Outcome {
    return this.summarizing ? Agenda.nextPart({ ...this.s, repaired: false }) : this.reply(j);
  }

  override onAnswer(j: Judge): Outcome { return this.advanceOr(j); }
  override onContinuer(j: Judge): Outcome { return this.advanceOr(j); }
  override onAccept(j: Judge): Outcome { return this.advanceOr(j); }
  override onReject(j: Judge): Outcome { return this.advanceOr(j); }
  override onCloser(j: Judge): Outcome { return this.advanceOr(j); }
  override onInquiry(j: Judge): Outcome { return this.reply(j); }
  override onExemplarRequest(j: Judge): Outcome { return this.reply(j); }

  override onPause(): Outcome {
    return this.summarizing ? Agenda.nextPart(this.s) : Say.nothing(this.s);
  }

  override onAbort(): Outcome {
    const base = { ...this.s, repaired: false, unclearStreak: 0 };
    return Say.end(Say.line(base, lines(this.s.lang).bye, 'B5'));
  }

  // 성공 확인(C4)의 답, 또는 마무리 중의 다른 말
  private reply(j: Judge): Outcome {
    if (this.s.open?.pattern !== 'C4') return Say.end(Say.model(this.s, j, true));
    const s1 = { ...this.s, helped: j.positive, open: null };
    // C4.7: 성공 확인이 부정이면 무엇이 걸리는지 한 번 더 듣고 끝낸다
    return j.positive ? Say.end(Say.model(s1, j, true)) : Say.model(s1, j, false);
  }
}

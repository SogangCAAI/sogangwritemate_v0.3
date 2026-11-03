// 끝 — 성공 확인까지 마친 세션. 어떤 수에도 움직이지 않는다 (요약 화면은 클라이언트가 띄운다)
import type { Outcome } from '../../state';
import { Phase } from '../Phase';
import { Say } from '../Say';

export class EndedPhase extends Phase {
  readonly name = 'ended';

  override get isOver(): boolean {
    return true;
  }

  override onAnswer(): Outcome { return Say.nothing(this.s); }
  override onContinuer(): Outcome { return Say.nothing(this.s); }
  override onAccept(): Outcome { return Say.nothing(this.s); }
  override onReject(): Outcome { return Say.nothing(this.s); }
  override onCloser(): Outcome { return Say.nothing(this.s); }
  override onInquiry(): Outcome { return Say.nothing(this.s); }
  override onExemplarRequest(): Outcome { return Say.nothing(this.s); }
  override onAbort(): Outcome { return Say.nothing(this.s); }
}

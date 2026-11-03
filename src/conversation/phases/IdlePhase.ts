// 과제 사이 — 진행 중인 과제가 없다 (과제를 끝냈거나 건너뛴 직후)
// 튜터가 방금 한 일: 완료 피드백 · "여기까지 할게요" 같은 닫는 말 (B4 CLOSER)
// 나가는 길:
//   쉼(B4.0, 학생이 다른 말을 꺼낼 자리를 준 뒤) → 다음 과제 시작 제안 → TaskProposalPhase (남은 과제가 없으면 ClosingPhase)
//   말에 대한 수 → 기본값 (Phase) — 모델이 짧게 답한다
// 열린 짝이 남아 있으면(예: 못 알아들어 방향을 바꾼 제안) 쉼을 기다리지 않는다.
import type { Outcome } from '../../state';
import { Agenda } from '../Agenda';
import { Phase } from '../Phase';
import { Say } from '../Say';

export class IdlePhase extends Phase {
  readonly name = 'idle';

  override get awaitsPause(): boolean {
    return this.s.open === null;
  }

  override onPause(): Outcome {
    return this.awaitsPause ? Agenda.proposeNext(this.s) : Say.nothing(this.s);
  }
}

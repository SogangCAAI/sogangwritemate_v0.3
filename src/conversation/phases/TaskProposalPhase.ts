// 코드가 뜻을 정해 둔 제안 — NCF에 없는 우리 패턴 P1 (open.effect가 있다)
// 튜터가 방금 한 일 (코드가 말함):
//   effect=startTask  "다음 과제는 ○○, 시작해 볼까요?" (브리핑 끝 · 과제 사이)
//   effect=moveOn     과제 5분 초과 — "여기까지 하고 다음으로 갈까요?"
//   effect=close      세션 마감 3분 전 — "여기까지 하고 정리할까요?"
// 나가는 길:
//   수락 startTask → 과제 active + 진단이 만든 첫 질문(opener)을 코드가 바로 말함 → ExperiencePhase(A5.1)
//   수락 moveOn    → 지금 과제 timeout → 다음 과제 제안 (없으면 마무리)
//   수락 close     → 지금 과제 timeout → ClosingPhase
//   거절 startTask → 그 과제 skipped(P1.1, 재설득 없음) → 다음 후보 제안
//   거절 moveOn·close → 계속한다 (nudged·closeOffered가 켜져 있어 다시 묻지 않음)
import type { Judge, Outcome } from '../../state';
import { lines } from '../../lines';
import { Agenda } from '../Agenda';
import { Phase } from '../Phase';
import { Say } from '../Say';
import { Tasks } from '../Tasks';

export class TaskProposalPhase extends Phase {
  readonly name = 'taskProposal';

  override onAccept(j: Judge, now: number): Outcome {
    const s = { ...this.s, repaired: false };
    const o = s.open;
    // 과제 시작을 받으면 진단이 만든 첫 질문을 코드가 바로 한다 — 모델에 맡기면 "시작해 볼게요"로 멈춰 학생이 먼저 말해야 했다
    if (o?.effect === 'startTask' && o.taskId) {
      const t = Tasks.find(s, o.taskId);
      if (t) return Say.code(Tasks.start(s, t.id, now), `${lines(s.lang).startAck} ${t.opener}`, { pattern: 'A5.1', firstPair: t.opener }, 'A5.1');
    }
    if (o?.effect === 'moveOn') return Agenda.proposeNext(Tasks.finish(s, 'timeout', now), now);
    if (o?.effect === 'close') return Agenda.startClosing(Tasks.finish(s, 'timeout', now), true);
    return super.onAccept(j, now);
  }

  override onReject(j: Judge, text: string, now: number): Outcome {
    const o = this.s.open;
    if (o?.effect === 'startTask' && o.taskId) {
      const s1 = Tasks.skip({ ...this.s, repaired: false }, o.taskId, text, now);
      return Agenda.proposeNext({ ...s1, open: null }, now, lines(this.s.lang).ok);
    }
    return super.onReject(j, text, now);
  }
}

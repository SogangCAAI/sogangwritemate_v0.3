// 해석·결론 확인 — NCF Formulation + A2.6 Summary (내용 과제)
// 튜터가 방금 한 일 (모델): "그러니까 ~한 경험이네요. 2문단에 넣는 거, 맞아요?" — 자기 해석을 드러내고 내용+자리를 확인
// 나가는 길:
//   수락 → 결론(firstPair)을 과제 evidence로 기록하고, 합의한 내용이 과제의 완료 항목(criteria)이 된다 — 진단의 초안을 대신한다.
//          아직 done은 아니다 (글이 바뀌어야 한다 — 이해는 주장이 아니라 시연, NCF p.18–19) → EditingPhase
//   거절·정정 → 기본값: 모델이 고친 해석으로 다시 A2.6을 연다 (과제는 그대로)
import type { Judge, Outcome } from '../../state';
import { activeTask } from '../../state';
import { Agenda } from '../Agenda';
import { Phase } from '../Phase';
import { Say } from '../Say';
import { Tasks } from '../Tasks';

export class ConclusionPhase extends Phase {
  readonly name = 'conclusion';

  override onAccept(j: Judge, now: number): Outcome {
    const s = { ...this.s, repaired: false };
    const t = activeTask(s);
    const s1 = t ? Tasks.note(Tasks.confirmCriteria(s, t.id, s.open?.criteria ?? [], s.open!.firstPair), t.id, `결론 확정: ${s.open!.firstPair}`) : s;
    return Agenda.nudge(Say.model({ ...s1, open: null }, j, false), now);
  }
}

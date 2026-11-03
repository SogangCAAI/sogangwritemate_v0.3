// 해석·결론 확인 — NCF Formulation + A2.6 Summary (내용 과제)
// 튜터가 방금 한 일 (모델): "그러니까 ~한 경험이네요. 2문단에 넣는 거, 맞아요?" — 자기 해석을 드러내고 내용+자리를 확인
// 나가는 길:
//   수락 → 결론(firstPair)을 과제 evidence로 기록. 아직 done은 아니다 (글이 바뀌어야 한다) → EditingPhase
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
    const s1 = t ? Tasks.update(s, t.id, { evidence: s.open!.firstPair }) : s;
    return Agenda.nudge(Say.model({ ...s1, open: null }, j, false), now);
  }
}

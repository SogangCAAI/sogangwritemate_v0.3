// 막힘 사다리 — 학생이 튜터의 질문·제안에 "모르겠어요"·"생각이 안 나요"(CONFUSED)라고 할 때.
// 국면과 상관없이 TutoringSession이 국면보다 먼저 부른다 (RepairHandler와 같은 자리).
//
// 근거 (v2, 읽기 전용 — pre-dashboard_code/):
//   src/domain/dialogue/caJudge.ts  CA_ACTION_TABLE의 clue_up · exemplar · move_on 행 (notUnderstood.streak 1 / 2 / ≥3)
//   src/domain/dialogue/dialogueState.ts  notUnderstood — 쉼·편집·수리는 세지 않고 건너뛴다(skip), 다른 수가 오면 끊긴다(clear)
//   1회 clue_up  — 이요안 10/09 "한 번 더 설명" · 워크플로 R6 L1: 질문을 좁히는 단서 하나(빈칸·되받기, v2 proposeHeader) + 같은 질문 → 모델, opens=A5.1
//   2회 exemplar — 허윤석·이요안 10/09 "모범답안 1개 시범": 시범 한 문장 → 모델, opens=P1.4 (대필 금지 — 한 문장까지)
//   3회 move_on  — 사람 튜터 K20161108 t58 "보류하고 2번": 코드가 과제를 미루고(skipped, '학생이 막힘') 다음 과제 제안 (시간 규칙 그대로)
//
// v3에서 달라진 점: v2는 헤더 주입(+플래그)으로 모델에게 지시했다. v3는 같은 턴의 Haiku가 라벨과 말을 함께 내므로,
// 모델이 맞는 칸의 말을 하도록 TurnPrompt가 지금 막힘 횟수를 알려 주고, 이 클래스는 상태만 정한다 (호출 추가 없음).
// 과제가 없을 때(브리핑·과제 제안·과제 사이)는 사다리를 타지 않는다 — 모델이 풀어 말하고 열린 짝은 그대로.
// 마무리 중이면(성공 확인에 "잘 모르겠어요") 그 국면의 답으로 넘긴다.
import { activeTask, type Judge, type Outcome, type SessionState } from '../state';
import { lines } from '../lines';
import { Agenda } from './Agenda';
import { PhaseFactory } from './PhaseFactory';
import { Say } from './Say';
import { Tasks } from './Tasks';

export class ConfusionHandler {
  constructor(private readonly s: SessionState) {}

  onConfused(j: Judge, text: string, now: number): Outcome {
    const base: SessionState = { ...this.s, repaired: false, unclearStreak: 0 };
    if (this.s.stage === 'closing') return PhaseFactory.for({ ...base, confusedStreak: 0 }).onAnswer(j, text, now);
    const t = activeTask(this.s);
    if (!t) return { ...Say.model({ ...base, confusedStreak: 0 }, j, true), agentAction: 'clarify' };
    const n = this.s.confusedStreak + 1;
    if (n === 1) return { ...Say.model({ ...base, confusedStreak: 1 }, { ...j, opens: 'A5.1' }, false), agentAction: 'clue_up' };
    if (n === 2) return { ...Say.model({ ...base, confusedStreak: 2 }, { ...j, opens: 'P1.4' }, false), agentAction: 'exemplar' };
    return this.moveOn(base, t.id, now);
  }

  // 세 번째 막힘 — 과제를 미루고 다음으로 (모델의 reply는 버리고 코드가 말한다)
  private moveOn(s: SessionState, id: string, now: number): Outcome {
    const L = lines(s.lang);
    const s1 = Tasks.skip({ ...s, confusedStreak: 0, open: null }, id, L.stuckEvidence, now);
    const o = Agenda.proposeNext(s1, now, L.stuckMoveOn, L.stuckMoveOn);
    return { ...o, agentAction: `move_on:${o.agentAction}` };
  }
}

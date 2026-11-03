// 학생의 다른 요청 — 지금 과제 말고 다른 것을 하자고 할 때(OFF_GOAL: "3문단 먼저 볼래요", "지원 동기부터 하고 싶어요").
// 국면과 상관없이 TutoringSession이 국면보다 먼저 부른다.
//
// 근거 (v2, 읽기 전용 — pre-dashboard_code/):
//   src/domain/agenda/sessionGoal.ts  [2026-10-02 회의] "다른 요청이면 한 번만 목표로 돌아가자고 제안하고, 그래도 원하면 학생 뜻에 맞춘다"
//   src/domain/dialogue/caJudge.ts   CA_ACTION_TABLE 2차 평가 행 (이요안 10/09):
//     sequence_student_first — importance=higher: "그거부터 하고 두 번째는 내 것으로 돌아가기" (목표는 지우지 않는다)
//     subsume                — importance=equal: 요청을 지금 목표에 겹쳐 받는다
//     keep_goal              — importance=lower: "양보 + 그러나 + 이유" (사람 거절 30/73, K20161312 t19)
//
// 규칙 (코드가 정한다 — importance·targetParagraph는 같은 턴 Haiku의 판정):
//   1) 요청 문단이 아직 안 한 과제(pending)의 문단이고, importance=higher 이거나 두 번째 이상 요청 → 바꾼다:
//      지금 과제는 pending으로 돌리고(들은 것·턴 수 유지) 그 과제를 시작, 코드가 opener를 말한다 (과제 수락과 같은 모양)
//   2) 첫 요청(그리고 higher가 아님) → 겹쳐 받기: 모델이 요청을 지금 과제와 이어 받고 지금 과제를 계속한다.
//      importance=lower면 같은 자리에서 '양보 + 그러나 + 이유'로 지금 과제를 지킨다 (keep_goal, 문구는 TurnPrompt)
//   3) 그 밖(두 번째 요청인데 맞는 과제가 없음 · higher인데 맞는 과제가 없음) → 학생을 따른다: 모델이 요청에 짧게 답하고,
//      과제 표는 그대로 (agentAction=follow_student로 기록)
// v3에서 달라진 점: v2는 중요도를 배경 호출로 한 턴 늦게 받았다(N턴 겹쳐 받기 → N+1턴 교통정리).
// v3는 턴 호출 하나가 라벨·중요도·말을 함께 내므로 같은 턴에 정한다. 과제가 문단 단위라 '자리'는 문단 번호로만 맞춘다.
import { activeTask, type Judge, type Outcome, type SessionState, type Task } from '../state';
import { lines } from '../lines';
import { PhaseFactory } from './PhaseFactory';
import { Say } from './Say';
import { Tasks } from './Tasks';

export class OffGoalHandler {
  constructor(private readonly s: SessionState) {}

  onOffGoal(j: Judge, now: number): Outcome {
    const s = this.s;
    if (s.stage === 'closing') return PhaseFactory.for(s).onInquiry(j); // 마무리 중이면 답하고 끝
    const count = s.offGoalCount;
    const base: SessionState = { ...s, offGoalCount: count + 1, repaired: false, unclearStreak: 0, confusedStreak: 0 };
    const want = OffGoalHandler.requested(s, j.targetParagraph);
    if (want && (j.importance === 'higher' || count >= 1)) return OffGoalHandler.switchTo(base, want, now);
    // 코드가 뜻을 정한 제안(과제 시작)·브리핑 파트는 열린 채 둔다
    const keepOpen = !!s.open?.effect || s.open?.pattern === 'A3';
    const said = Say.model(base, j, keepOpen);
    if (count === 0 && j.importance !== 'higher') return { ...said, agentAction: j.importance === 'lower' ? 'keep_goal' : 'subsume' };
    return { ...said, agentAction: 'follow_student' };
  }

  // 학생이 집은 문단의 아직 안 한 과제
  static requested(s: SessionState, paragraph: number): Task | undefined {
    return paragraph > 0 ? s.tasks.find((t) => t.status === 'pending' && t.target.paragraph === paragraph) : undefined;
  }

  // 학생 안건 먼저 — 지금 과제는 내려놓고(pending) 요청한 과제를 시작한다
  private static switchTo(s: SessionState, t: Task, now: number): Outcome {
    const say = `${lines(s.lang).switchTask} ${t.opener}`;
    const s1 = Tasks.start(activeTask(s) ? Tasks.park(s) : s, t.id, now);
    return Say.code(s1, say, { pattern: 'A5.1', firstPair: t.opener }, 'sequence_student_first');
  }
}

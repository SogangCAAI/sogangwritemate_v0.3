// 과제 진행 · 문단 고치기 — 결론 확인 뒤 / 힌트(A4.1) 뒤 / 쓰는 법을 보여 준(P1.4) 뒤, 또는 표현 과제의 질문·제안 중
// 튜터가 방금 한 일 (모델): "고쳐 보세요" · 표현 과제의 질문·힌트 · 뼈대(틀 + 다른 예) — 이제 학생이 글 패널에서 고칠 차례
// 말에 대한 수는 모두 기본값 (Phase). 이 국면의 핵심은 onEdit — 학생이 문단을 저장했을 때:
//   과제가 손대는 문단 밖          → 아무 말 없음 (구조 과제는 문단 여럿을 손댈 수 있다 — Tasks.targets)
//   재평가: 항목 전부 충족         → 아직 done이 아니다. 확인 질문(A4)을 연다 — 학생이 문단의 주장과 근거를 말해야 끝난다 (CheckPhase)
//                                 확인 질문은 과제당 한 번. 주장만 짚었으면 두 번째는 받침 문장만 묻고, 그 뒤로는 묻지 않고 완료 (돌지 않기, 2026-11-16)
//   재평가: 일부만                → active 유지, 항목 ✓/✗ 갱신, reason이 곧 못 채운 항목의 힌트 하나 (A4.1, P1을 연다)
//                                 같은 항목이 연달아 안 채워지면 stuckCount가 오른다 — 재평가가 같은 힌트를 되풀이하지 않게 한다 (Evaluator)
//   재평가 없음(verdict null)     → 수정 횟수만 센다
// 시범 문장을 그대로 넣으면 끝나던 지름길은 2026-11-16에 없앴다 — 튜터는 문장을 써 주지 않는다.
// 편집은 어느 국면에서 와도(경험을 듣는 중에 고쳐도) 같은 규칙으로 판정한다 — TutoringSession.onEdit가 이 국면을 쓴다.
import { activeTask, type Outcome, type SessionState, type Task, type TurnEvent } from '../../state';
import { lines } from '../../lines';
import { Phase } from '../Phase';
import { Say } from '../Say';
import { Tasks } from '../Tasks';

export type EditEvent = Extract<TurnEvent, { kind: 'edit' }>;

export class EditingPhase extends Phase {
  readonly name = 'editing';

  onEdit(ev: EditEvent): Outcome {
    const L = lines(this.s.lang);
    const t = activeTask(this.s);
    if (!t || !Tasks.isTarget(t, ev.paragraph)) return Say.nothing(this.s);
    const edits = t.edits + 1;
    if (!ev.verdict) return Say.nothing(Tasks.update(this.s, t.id, { edits }));
    const { done } = ev.verdict;
    const reason = ev.verdict.reason || (done ? '' : L.tryAgain);
    const s0 = Tasks.update(Tasks.applyVerdict(this.s, t.id, ev.verdict), t.id, { edits });
    if (done) return EditingPhase.allMet(s0, t, reason, ev.now);
    // A4.1: 아직 부족 — reason이 곧 못 채운 항목의 힌트 하나. 같은 항목이 또 안 채워졌으면 횟수를 올린다
    const unmet = Tasks.find(s0, t.id)!.criteria.filter((c) => !c.met).map((c) => c.id).join(',');
    const stuckCount = unmet === t.stuckOn ? t.stuckCount + 1 : 1;
    const s1 = Tasks.update(s0, t.id, { lastHint: reason, stuckOn: unmet, stuckCount });
    return Say.code(s1, reason, { pattern: 'P1', firstPair: reason }, 'A4.1');
  }

  // 항목을 다 채웠다 — 확인 질문으로, 또는 이미 충분히 물었으면 완료로
  private static allMet(s: SessionState, t: Task, reason: string, now: number): Outcome {
    const L = lines(s.lang);
    const p = t.target.paragraph;
    const { asked, claimOk } = t.check;
    if (asked >= 2) {
      // 두 번 물었다 — 더 묻지 않는다. 재평가가 다 채웠다고 했으니 끝낸다
      const s1 = Tasks.update(s, t.id, { status: 'done', endedAt: now, evidence: t.evidence ?? reason, stuckCount: 0 });
      return Say.code({ ...s1, open: null }, `${L.better} ${reason}`.trim(), null, 'done:eval');
    }
    // A4: 첫 번째는 주장과 근거를 다 묻고, 주장을 이미 짚었으면 두 번째는 받침 문장만 묻는다
    const q = asked === 1 && claimOk ? L.checkSupport(p) : L.checkQuestion(p);
    const s1 = Tasks.update(s, t.id, { check: { ...t.check, asked: asked + 1 }, stuckCount: 0 });
    return Say.code(s1, `${L.allMet} ${q}`, { pattern: 'A4', firstPair: q }, 'A4.0');
  }
}

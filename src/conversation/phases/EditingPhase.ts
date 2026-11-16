// 과제 진행 · 문단 고치기 — 결론 확인 뒤 / 힌트(A4.1) 뒤 / 쓰는 법을 보여 준(P1.4) 뒤, 또는 표현 과제의 질문·제안 중
// 튜터가 방금 한 일 (모델): "고쳐 보세요" · 표현 과제의 질문·힌트 · 뼈대(틀 + 다른 예) — 이제 학생이 글 패널에서 고칠 차례
// 말에 대한 수는 모두 기본값 (Phase). 이 국면의 핵심은 onEdit — 학생이 문단을 저장했을 때:
//   대상 밖 문단                 → 아무 말 없음
//   재평가: 항목 전부 충족        → 아직 done이 아니다. 확인 질문(A4)을 연다 — 학생이 문단의 주장과 근거를 말해야 끝난다 (CheckPhase)
//   재평가: 일부만               → active 유지, 항목 ✓/✗ 갱신, reason이 곧 못 채운 항목의 힌트 하나 (A4.1, P1을 연다)
//   재평가 없음(verdict null)    → 수정 횟수만 센다
// 시범 문장을 그대로 넣으면 끝나던 지름길은 2026-11-16에 없앴다 — 튜터는 문장을 써 주지 않는다.
// 편집은 어느 국면에서 와도(경험을 듣는 중에 고쳐도) 같은 규칙으로 판정한다 — TutoringSession.onEdit가 이 국면을 쓴다.
import { activeTask, type Outcome, type TurnEvent } from '../../state';
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
    if (!t || t.target.paragraph !== ev.paragraph) return Say.nothing(this.s);
    const edits = t.edits + 1;
    if (!ev.verdict) return Say.nothing(Tasks.update(this.s, t.id, { edits }));
    const { done } = ev.verdict;
    const reason = ev.verdict.reason || (done ? '' : L.tryAgain);
    const s0 = Tasks.update(Tasks.applyVerdict(this.s, t.id, ev.verdict), t.id, { edits });
    if (done) {
      // A4: 항목은 다 보인다 — 이제 학생이 설명으로 보여 줄 차례 (이해는 주장이 아니라 시연, NCF p.18–19)
      const q = L.checkQuestion(t.target.paragraph);
      return Say.code(s0, `${L.allMet} ${q}`, { pattern: 'A4', firstPair: q }, 'A4.0');
    }
    // A4.1: 아직 부족 — reason이 곧 못 채운 항목의 힌트 하나
    return Say.code(s0, reason, { pattern: 'P1', firstPair: reason }, 'A4.1');
  }
}

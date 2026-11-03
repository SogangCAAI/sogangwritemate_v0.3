// 과제 진행 · 문단 고치기 — 결론 확인 뒤 / 힌트(A4.1) 뒤 / 시범 문장(P1.4) 뒤, 또는 표현 과제의 질문·제안 중
// 튜터가 방금 한 일 (모델): "고쳐 보세요" · 표현 과제의 질문·힌트 · 시범 한 문장 — 이제 학생이 글 패널에서 고칠 차례
// 말에 대한 수는 모두 기본값 (Phase). 이 국면의 핵심은 onEdit — 학생이 문단을 저장했을 때:
//   대상 밖 문단                 → 아무 말 없음
//   시범 문장이 그대로 들어감     → done(fromExemplar), 재평가 없음 → IdlePhase(쉼 뒤 다음 과제 제안)
//   재평가 better               → done, reason으로 칭찬 한 문장 → IdlePhase
//   재평가 !better              → active 유지, reason이 곧 힌트 하나(A4.1, P1을 연다)
//   재평가 없음(verdict null)    → 수정 횟수만 센다
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
    if (Tasks.exemplarUsed(t, ev.after)) {
      const s1 = Tasks.update(this.s, t.id, { edits, status: 'done', endedAt: ev.now, fromExemplar: true, evidence: t.exemplar });
      return Say.code({ ...s1, open: null }, L.exemplarDone, null, 'done:exemplar');
    }
    if (!ev.verdict) return Say.nothing(Tasks.update(this.s, t.id, { edits }));
    const { better } = ev.verdict;
    const reason = ev.verdict.reason || (better ? '' : L.tryAgain);
    if (better) {
      const s1 = Tasks.update(this.s, t.id, { edits, status: 'done', endedAt: ev.now, evidence: reason });
      return Say.code({ ...s1, open: null }, `${L.better} ${reason}`.trim(), null, 'done:eval');
    }
    // A4.1: 아직 부족 — reason이 곧 힌트 하나
    return Say.code(Tasks.update(this.s, t.id, { edits }), reason, { pattern: 'P1', firstPair: reason }, 'A4.1');
  }
}

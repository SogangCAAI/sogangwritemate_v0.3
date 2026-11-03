// /api/evaluate — 학생이 대상 문단을 고쳐 저장했을 때: 재평가(Haiku 1회, 시범 문장 그대로면 0회) → TutoringSession.onEdit
import { TutoringSession } from '../../conversation/TutoringSession';
import { activeTask, type Verdict } from '../../state';
import { Handler, ok } from '../http/Handler';
import { num, str, ValidationError } from '../parse/fields';
import { RequestParser } from '../parse/RequestParser';
import type { Evaluator } from '../services/Evaluator';
import type { SessionStore } from '../store/SessionStore';

export class EvaluateHandler extends Handler {
  constructor(private readonly evaluator: Evaluator, private readonly store: SessionStore) {
    super('evaluate');
  }

  protected async run(req: Request): Promise<Response> {
    const t0 = Date.now();
    const b = await RequestParser.body(req);
    const state = RequestParser.state(b.state);
    const paragraph = num(b.paragraph, 'paragraph');
    if (!Number.isInteger(paragraph) || paragraph < 1) throw new ValidationError('paragraph: 문단 번호가 잘못됐어요.');
    const original = str(b.original, 'original');
    const edited = str(b.edited, 'edited');

    const session = TutoringSession.from(state);
    const task = activeTask(state);
    const verdict: Verdict | null = task && session.editNeedsEval(paragraph, edited)
      ? await this.evaluator.evaluate(task, original, edited, state.lang)
      : null;

    const o = session.onEdit({ kind: 'edit', paragraph, after: edited, verdict, now: Date.now() });
    await this.store.saveTurn({
      session_id: state.id, kind: 'edit', user_text: edited, agent_text: o.say,
      user_action: null, agent_action: o.agentAction, apr: null, judge: verdict,
      task_id: task?.id ?? null, latency_ms: Date.now() - t0,
    });
    return ok({ state: o.state, say: o.say, verdict, awaitPause: TutoringSession.from(o.state).wantsPause });
  }
}

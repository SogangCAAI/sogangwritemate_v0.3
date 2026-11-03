// /api/diagnose — 세션 입구. Sonnet이 과제 3개와 브리핑 3파트를 고르고, 코드가 첫 상태를 만든다
import { randomUUID } from 'node:crypto';
import { TutoringSession } from '../../conversation/TutoringSession';
import { Handler, ok } from '../http/Handler';
import { str } from '../parse/fields';
import { RequestParser } from '../parse/RequestParser';
import type { Diagnoser } from '../services/Diagnoser';
import type { SessionStore } from '../store/SessionStore';

export class DiagnoseHandler extends Handler {
  constructor(private readonly diagnoser: Diagnoser, private readonly store: SessionStore) {
    super('diagnose');
  }

  protected async run(req: Request): Promise<Response> {
    const b = await RequestParser.body(req);
    const ctx = RequestParser.context(b);
    const lang = RequestParser.lang(b.lang);
    const resume = b.resume === undefined ? '' : str(b.resume, 'resume', 6000);

    const d = await this.diagnoser.diagnose(ctx, lang, resume);
    const session = TutoringSession.start({ id: randomUUID(), lang, tasks: d.tasks, briefing: d.briefing, now: Date.now() });
    const state = session.toState();

    await this.store.saveSession({ id: state.id, lang, posting: ctx.posting, essay: ctx.paragraphs, tasks: state.tasks });
    return ok({ state, say: state.last.played, awaitPause: session.wantsPause, assessment: d.assessment });
  }
}

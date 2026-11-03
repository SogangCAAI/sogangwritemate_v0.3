// /api/summary — 세션 끝: 과제 표(코드) + Sonnet 요약 한 번 → 세션 행 갱신
import { Handler, ok } from '../http/Handler';
import { str, strList } from '../parse/fields';
import { RequestParser } from '../parse/RequestParser';
import type { Summarizer } from '../services/Summarizer';
import type { SessionStore } from '../store/SessionStore';

export class SummaryHandler extends Handler {
  constructor(private readonly summarizer: Summarizer, private readonly store: SessionStore) {
    super('summary');
  }

  protected async run(req: Request): Promise<Response> {
    const b = await RequestParser.body(req);
    const state = RequestParser.state(b.state);
    const original = strList(b.original, 'original', 20);
    const final = strList(b.final, 'final', 20);
    const posting = str(b.posting ?? '', 'posting', 6000);
    const now = Date.now();

    const summary = await this.summarizer.summarize(state, original, final, now);
    await this.store.saveSession({
      id: state.id, lang: state.lang, posting, essay: original, tasks: state.tasks,
      final_essay: final, summary, helped: state.helped, ended_at: new Date(now).toISOString(),
    });
    return ok(summary);
  }
}

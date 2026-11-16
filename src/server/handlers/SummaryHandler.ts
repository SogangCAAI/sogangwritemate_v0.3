// /api/summary — 세션 끝: 과제 표(코드) + Sonnet 요약 한 번 + 끝 글의 루브릭 재진단 한 번(나란히) → 세션 행 갱신
// 재진단이 실패해도 요약은 돌려준다 (finalRubric: null) — 요약 화면이 멈추지 않게
import type { Regrade } from '../parse/LlmOutputParser';
import { Handler, ok } from '../http/Handler';
import { str, strList } from '../parse/fields';
import { RequestParser } from '../parse/RequestParser';
import type { Diagnoser } from '../services/Diagnoser';
import type { Summarizer } from '../services/Summarizer';
import type { SessionStore } from '../store/SessionStore';

export class SummaryHandler extends Handler {
  constructor(private readonly summarizer: Summarizer, private readonly diagnoser: Diagnoser, private readonly store: SessionStore) {
    super('summary');
  }

  protected async run(req: Request): Promise<Response> {
    const b = await RequestParser.body(req);
    const state = RequestParser.state(b.state);
    const original = strList(b.original, 'original', 20);
    const final = strList(b.final, 'final', 20);
    const posting = str(b.posting ?? '', 'posting', 6000);
    const resume = str(b.resume ?? '', 'resume', 6000);
    const now = Date.now();

    const [summary, regrade] = await Promise.all([
      this.summarizer.summarize(state, original, final, now),
      this.diagnoser.regrade({ posting, paragraphs: final }, state.lang, resume).catch((e: unknown): Regrade | null => {
        console.error('[summary] 끝 재진단 실패 — 요약만 돌려줍니다:', e instanceof Error ? e.message : e);
        return null;
      }),
    ]);
    await this.store.saveSession({
      id: state.id, lang: state.lang, posting, essay: original, tasks: state.tasks,
      final_essay: final, summary, helped: state.helped, ended_at: new Date(now).toISOString(),
      final_rubric: regrade,
    });
    return ok({ ...summary, finalRubric: regrade?.rubric ?? null, finalStrengths: regrade?.strengths ?? '' });
  }
}

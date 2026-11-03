// 한 턴 — (힌트 칩이 아니면) Haiku 1회 → next() → 인용 검사 → 저장
import type { Config } from '@netlify/functions';
import { missingQuotes } from '../../src/checks';
import { aprOf, saveTurn } from '../../src/db';
import { next, wantsPause } from '../../src/decide';
import { fail, handle, ok, readBody } from '../../src/http';
import { respond } from '../../src/respond';
import { activeTask, CHIP_MOVES, emptyJudge, type Judge, type TurnEvent } from '../../src/state';
import { obj, oneOf, parseContext, parseHistory, parseState, str } from '../../src/validate';

export default (req: Request) =>
  handle('turn', async () => {
    const t0 = Date.now();
    const b = obj(await readBody(req), 'body');
    const state = parseState(b.state);
    const ctx = parseContext(b.context);
    const e = obj(b.event, 'event');
    const kind = oneOf(e.kind, ['say', 'pause'] as const, 'event.kind');
    const now = Date.now();

    let judge: Judge | null = null;
    let event: TurnEvent = { kind: 'pause', now };
    if (kind === 'say') {
      const text = str(e.text, 'event.text', 2000).trim();
      if (!text) return fail(400, '할 말을 적어 주세요.');
      // 힌트 칩은 라벨을 직접 보낸다 — 판정 호출 없이 코드가 답한다
      const chip = e.move === undefined ? null : oneOf(e.move, CHIP_MOVES, 'event.move');
      judge = chip ? emptyJudge(chip) : await respond(state, ctx, parseHistory(b.history ?? []), text);
      event = { kind: 'say', text, now };
    }

    const o = next(state, judge, event);
    const exemplar = activeTask(o.state)?.exemplar ?? '';
    const unquoted = o.say ? missingQuotes(o.say, [...ctx.paragraphs, ctx.posting, exemplar]) : [];
    if (unquoted.length) console.warn('[turn] 글에 없는 인용:', unquoted);

    await saveTurn({
      session_id: state.id, kind,
      user_text: event.kind === 'say' ? event.text : null, agent_text: o.say,
      user_action: judge?.move ?? null, agent_action: o.agentAction, apr: aprOf(judge?.move ?? null),
      judge: judge ? { ...judge, unquoted } : null,
      task_id: activeTask(state)?.id ?? null, latency_ms: Date.now() - t0,
    });
    return ok({ state: o.state, say: o.say, move: judge?.move ?? null, awaitPause: wantsPause(o.state) });
  });

export const config: Config = { path: '/api/turn' };

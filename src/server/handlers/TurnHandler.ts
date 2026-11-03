// /api/turn — 한 턴: (힌트 칩이 아니면) Haiku 1회 → TutoringSession → 인용 검사 → 저장 (끼어들기 집계 ca도 함께 기록)
import { missingQuotes } from '../../checks';
import { Interruption } from '../../conversation/Interruption';
import { TutoringSession } from '../../conversation/TutoringSession';
import { activeTask, CHIP_MOVES, emptyJudge, type Judge, type TurnEvent } from '../../state';
import { fail, Handler, ok } from '../http/Handler';
import { obj, oneOf, str } from '../parse/fields';
import { RequestParser } from '../parse/RequestParser';
import type { TurnResponder } from '../services/TurnResponder';
import { SessionStore } from '../store/SessionStore';

export class TurnHandler extends Handler {
  constructor(private readonly responder: TurnResponder, private readonly store: SessionStore) {
    super('turn');
  }

  protected async run(req: Request): Promise<Response> {
    const t0 = Date.now();
    const b = await RequestParser.body(req);
    const state = RequestParser.state(b.state);
    const ctx = RequestParser.context(b.context);
    const ca = RequestParser.ca(b.ca); // 끼어들기 집계 — 자주 끼어들면 튜터 말을 한 문장으로
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
      judge = chip ? emptyJudge(chip) : await this.responder.respond(state, ctx, RequestParser.history(b.history ?? []), text, ca);
      event = { kind: 'say', text, now };
    }

    const o = TutoringSession.from(state).handle(judge, event);
    const exemplar = activeTask(o.state)?.exemplar ?? '';
    const unquoted = o.say ? missingQuotes(o.say, [...ctx.paragraphs, ctx.posting, exemplar]) : [];
    if (unquoted.length) console.warn('[turn] 글에 없는 인용:', unquoted);

    await this.store.saveTurn({
      session_id: state.id, kind,
      user_text: event.kind === 'say' ? event.text : null, agent_text: o.say,
      user_action: judge?.move ?? null, agent_action: o.agentAction, apr: SessionStore.aprOf(judge?.move ?? null),
      judge: judge ? { ...judge, unquoted, ca: new Interruption(ca).toLog() } : null,
      task_id: activeTask(state)?.id ?? null, latency_ms: Date.now() - t0,
    });
    return ok({ state: o.state, say: o.say, move: judge?.move ?? null, awaitPause: TutoringSession.from(o.state).wantsPause });
  }
}

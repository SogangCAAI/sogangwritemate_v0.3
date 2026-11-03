// 한 턴 — 판정(Haiku) → 대화 흐름(TutoringSession) → 저장. 본문은 src/server/handlers/TurnHandler.ts
import type { Config } from '@netlify/functions';
import { services } from '../../src/server/deps';
import { TurnHandler } from '../../src/server/handlers/TurnHandler';

const handler = new TurnHandler(services.responder, services.store);
export default (req: Request) => handler.handle(req);
export const config: Config = { path: '/api/turn' };

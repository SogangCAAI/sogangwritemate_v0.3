// 세션 끝 — 과제 표 + 요약(Sonnet). 본문은 src/server/handlers/SummaryHandler.ts
import type { Config } from '@netlify/functions';
import { services } from '../../src/server/deps';
import { SummaryHandler } from '../../src/server/handlers/SummaryHandler';

const handler = new SummaryHandler(services.summarizer, services.store);
export default (req: Request) => handler.handle(req);
export const config: Config = { path: '/api/summary' };

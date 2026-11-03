// 문단 수정 — 재평가(Haiku, 시범 문장 그대로면 0회) → 과제 완료 판정. 본문은 src/server/handlers/EvaluateHandler.ts
import type { Config } from '@netlify/functions';
import { services } from '../../src/server/deps';
import { EvaluateHandler } from '../../src/server/handlers/EvaluateHandler';

const handler = new EvaluateHandler(services.evaluator, services.store);
export default (req: Request) => handler.handle(req);
export const config: Config = { path: '/api/evaluate' };

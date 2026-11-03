// 세션 입구 — 진단(Sonnet) → 첫 상태. 본문은 src/server/handlers/DiagnoseHandler.ts
import type { Config } from '@netlify/functions';
import { services } from '../../src/server/deps';
import { DiagnoseHandler } from '../../src/server/handlers/DiagnoseHandler';

const handler = new DiagnoseHandler(services.diagnoser, services.store);
export default (req: Request) => handler.handle(req);
export const config: Config = { path: '/api/diagnose' };

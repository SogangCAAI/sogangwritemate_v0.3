// 배포 상태 점검 — 브라우저에서 /api/health. 본문은 src/server/handlers/HealthHandler.ts
import type { Config } from '@netlify/functions';
import { services } from '../../src/server/deps';
import { HealthHandler } from '../../src/server/handlers/HealthHandler';

const handler = new HealthHandler(services.store, process.env.COMMIT_REF ?? 'dev');
export default (req: Request) => handler.handle(req);
export const config: Config = { path: '/api/health' };

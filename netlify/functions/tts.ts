// 튜터 목소리 — Google TTS MP3. 본문은 src/server/handlers/TtsHandler.ts
import type { Config } from '@netlify/functions';
import { services } from '../../src/server/deps';
import { TtsHandler } from '../../src/server/handlers/TtsHandler';

const handler = new TtsHandler(services.tts);
export default (req: Request) => handler.handle(req);
export const config: Config = { path: '/api/tts' };

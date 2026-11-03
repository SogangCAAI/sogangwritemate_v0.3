// /api/tts — 튜터 목소리 MP3 (base64). 서버 음성이 없으면 503 — 클라이언트는 브라우저 내장 음성으로 돌아간다
import { fail, Handler, ok } from '../http/Handler';
import { str } from '../parse/fields';
import { RequestParser } from '../parse/RequestParser';
import type { TtsService } from '../services/TtsService';

export class TtsHandler extends Handler {
  constructor(private readonly tts: TtsService) {
    super('tts');
  }

  protected async run(req: Request): Promise<Response> {
    const b = await RequestParser.body(req);
    const text = str(b.text, 'text', 1000).trim();
    const lang = RequestParser.lang(b.lang);
    if (!text) return fail(400, '읽을 글이 없어요.');
    const r = await this.tts.synthesize(text, lang);
    return 'error' in r ? fail(503, r.error) : ok({ audio: r.audio });
  }
}

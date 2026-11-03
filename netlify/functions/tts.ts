// 튜터 목소리 — Google TTS(MP3). 브라우저가 이 소리를 <audio>로 재생해야 Chrome의 메아리 제거가
// 그 소리를 기준으로 마이크에서 걸러 낸다 (브라우저 내장 음성 합성은 OS가 재생해 걸러지지 않는다).
// 키가 없거나 실패하면 503 — 클라이언트는 브라우저 내장 음성으로 돌아간다.
import type { Config } from '@netlify/functions';
import { fail, handle, ok, readBody } from '../../src/http';
import { LANGS, obj, oneOf, str } from '../../src/validate';

const VOICE = {
  ko: { languageCode: 'ko-KR', name: 'ko-KR-Chirp3-HD-Autonoe' },
  en: { languageCode: 'en-US', name: 'en-US-Chirp3-HD-Aoede' },
} as const;
const SPEAKING_RATE = 1.15; // v2와 같은 속도
const TIMEOUT_MS = 8000;

export default (req: Request) =>
  handle('tts', async () => {
    const b = obj(await readBody(req), 'body');
    const text = str(b.text, 'text', 1000).trim();
    const lang = oneOf(b.lang, LANGS, 'lang');
    if (!text) return fail(400, '읽을 글이 없어요.');
    const key = process.env.GOOGLE_TTS_API_KEY;
    if (!key) return fail(503, '서버 음성이 설정되지 않았어요.');

    const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: { text }, voice: VOICE[lang], audioConfig: { audioEncoding: 'MP3', speakingRate: SPEAKING_RATE } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch((e: unknown) => {
      console.error('[tts] 연결 실패', e);
      return null;
    });
    if (!res?.ok) {
      if (res) console.error('[tts] Google TTS', res.status, (await res.text()).slice(0, 200));
      return fail(503, '서버 음성을 만들지 못했어요.');
    }
    const data = (await res.json()) as { audioContent?: string };
    if (!data.audioContent) return fail(503, '서버 음성을 만들지 못했어요.');
    return ok({ audio: data.audioContent });
  });

export const config: Config = { path: '/api/tts' };

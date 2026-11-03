// 튜터 목소리 — Google TTS(MP3). 브라우저가 이 소리를 <audio>로 재생해야 Chrome의 메아리 제거가
// 그 소리를 기준으로 마이크에서 걸러 낸다 (브라우저 내장 음성 합성은 OS가 재생해 걸러지지 않는다).
// 키가 없거나 실패하면 이유 문장을 돌려준다 — 함수는 503, 클라이언트는 브라우저 내장 음성으로 돌아간다.
import type { Lang } from '../../state';

const VOICE = {
  ko: { languageCode: 'ko-KR', name: 'ko-KR-Chirp3-HD-Autonoe' },
  en: { languageCode: 'en-US', name: 'en-US-Chirp3-HD-Aoede' },
} as const;
const SPEAKING_RATE = 1.15; // v2와 같은 속도
const TIMEOUT_MS = 8000;
const FAILED = '서버 음성을 만들지 못했어요.';

export type TtsResult = { audio: string } | { error: string };

export class TtsService {
  constructor(private readonly apiKey: () => string | undefined = () => process.env.GOOGLE_TTS_API_KEY) {}

  async synthesize(text: string, lang: Lang): Promise<TtsResult> {
    const key = this.apiKey();
    if (!key) return { error: '서버 음성이 설정되지 않았어요.' };
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
      return { error: FAILED };
    }
    const data = (await res.json()) as { audioContent?: string };
    return data.audioContent ? { audio: data.audioContent } : { error: FAILED };
  }
}

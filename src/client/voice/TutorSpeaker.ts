// 튜터 말하기 — 서버 TTS(/api/tts)를 <audio>로 재생하고, 서버 음성이 없으면 브라우저 내장 speechSynthesis.
// <audio>로 재생해야 Chrome의 메아리 제거가 그 소리를 기준 신호로 삼아 마이크에서 걸러 낸다 (BargeInDetector).
// 줄마다 번호를 붙인다 — 끝까지 말했거나 끊기면 onEnd(번호). 그새 다음 줄로 넘어간 늦은 소리는 버린다.
import { toSpoken } from '../../spoken';
import type { Lang } from '../../state';
import { LOCALE, synthAvailable } from './types';

const SPEECH_MS_PER_CHAR = 250; // 끝 이벤트가 오지 않을 때를 대비한 안전 시간
const SPEECH_MS_BASE = 3000;

export type SpeakMode = 'server' | 'browser';

export interface SpeakerEvents {
  onStart: () => void;
  onEnd: (id: number) => void;
}

function pickVoice(locale: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === locale) ?? voices.find((v) => v.lang.startsWith(locale.slice(0, 2)));
}

// 서버 TTS — 실패하면 null (브라우저 음성으로 돌아간다)
async function fetchTts(text: string, lang: Lang): Promise<string | null> {
  try {
    const res = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, lang }) });
    const env = (await res.json().catch(() => null)) as { ok: boolean; data: { audio: string } | null } | null;
    return env?.ok && env.data?.audio ? env.data.audio : null;
  } catch {
    return null;
  }
}

export class TutorSpeaker {
  private line = ''; // 지금(또는 방금) 말한 튜터 줄 — 메아리 판별용
  private endedAt = 0;
  private nextId = 0;
  private currentId = 0;
  private audio: HTMLAudioElement | null = null;
  private playMode: SpeakMode = 'server';
  private playStartedAt = 0;
  private safety: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly events: SpeakerEvents) {}

  get lastLine(): string { return this.line; }
  get spokeUntil(): number { return this.endedAt; } // 마지막 줄이 끝난 시각
  get mode(): SpeakMode { return this.playMode; }
  get startedAt(): number { return this.playStartedAt; }

  // 말할 줄의 번호 (빈 줄이면 0)
  speak(shown: string, lang: Lang): number {
    const text = toSpoken(shown, lang); // 화면은 "1문단", 소리는 "첫째 문단" — 메아리 대조도 소리로 낸 말로
    if (!text.trim()) return 0;
    this.stop();
    const id = ++this.nextId;
    this.currentId = id;
    this.line = text;
    this.playStartedAt = Date.now();
    this.events.onStart();
    clearTimeout(this.safety);
    this.safety = setTimeout(() => this.finish(id), SPEECH_MS_BASE + text.length * SPEECH_MS_PER_CHAR);
    void fetchTts(text, lang).then((audio) => {
      if (this.currentId !== id) return; // 그새 멈췄거나 다음 줄로 넘어갔다
      if (!audio) return this.speakWithBrowser(id, text, lang);
      this.playMode = 'server';
      const el = new Audio(`data:audio/mpeg;base64,${audio}`);
      this.audio = el;
      this.playStartedAt = Date.now();
      el.onended = () => this.finish(id);
      el.onerror = () => this.speakWithBrowser(id, text, lang);
      el.play().catch(() => this.speakWithBrowser(id, text, lang)); // 자동 재생이 막히면 브라우저 음성으로
    });
    return id;
  }

  // 튜터 말 멈추기 — 지금 줄을 끊긴 것으로 끝낸다
  stop(): void {
    const id = this.currentId;
    if (!id) return;
    this.audio?.pause();
    if (synthAvailable()) window.speechSynthesis.cancel();
    this.finish(id);
  }

  // 화면을 떠날 때 — 소리만 끈다
  dispose(): void {
    clearTimeout(this.safety);
    this.audio?.pause();
    if (synthAvailable()) window.speechSynthesis.cancel();
  }

  private finish(id: number): void {
    if (this.currentId !== id) return;
    this.currentId = 0;
    clearTimeout(this.safety);
    this.audio = null;
    this.endedAt = Date.now();
    this.events.onEnd(id);
  }

  private speakWithBrowser(id: number, text: string, lang: Lang): void {
    if (!synthAvailable()) return this.finish(id);
    this.playMode = 'browser';
    const locale = LOCALE[lang];
    const u = new SpeechSynthesisUtterance(text);
    u.lang = locale;
    const voice = pickVoice(locale);
    if (voice) u.voice = voice;
    u.onend = () => this.finish(id);
    u.onerror = () => this.finish(id);
    window.speechSynthesis.speak(u);
  }
}

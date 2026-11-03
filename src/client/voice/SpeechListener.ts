// 학생 말 듣기 — 브라우저 SpeechRecognition (실시간 자막 + 확정 결과). 한 번 켤 때마다 하나를 만들고 stop()으로 버린다.
// 튜터가 말하는 동안은 아예 켜지 않는다 (반이중, useVoice가 정한다).
// 튜터 말이 끝난 직후 늦게 들어온 메아리는 글자 겹침으로 한 번 더 거른다.
import type { Lang } from '../../state';
import type { TutorSpeaker } from './TutorSpeaker';
import { LOCALE, type Recognizer, type RecognizerCtor } from './types';

const SUBMIT_SILENCE_MS = 1200; // 확정된 말 뒤에 이만큼 조용하면 한 턴으로 보낸다
const RESTART_MS = 300; // 브라우저가 듣기를 스스로 끝내면 잠깐 쉬고 다시 켠다
const ECHO_TAIL_MS = 1500; // 튜터 말이 끝난 뒤에도 늦게 오는 메아리를 걸러 낸다
const ECHO_OVERLAP = 0.6; // 들은 말의 글자쌍이 이만큼 튜터 말에 있으면 메아리로 본다

const ERROR_TEXT: Record<string, string> = {
  'not-allowed': '마이크 사용이 막혀 있어요. 주소창 옆 마이크 권한을 허용하거나, 글자로 입력해 주세요.',
  'service-not-allowed': '이 브라우저에서 음성 인식을 쓸 수 없어요. 글자로 입력해 주세요.',
  'audio-capture': '마이크를 찾지 못했어요. 마이크를 연결하거나, 글자로 입력해 주세요.',
  network: '음성 인식 서버에 연결하지 못했어요. 인터넷 연결을 확인하거나, 글자로 입력해 주세요.',
};

const squash = (t: string) => t.toLowerCase().replace(/[\s.,?!'"“”‘’…·-]/g, '');

// 튜터 말이 스피커에서 마이크로 다시 들어온 것인가
export function isEcho(heard: string, line: string): boolean {
  const h = squash(heard);
  const l = squash(line);
  if (h.length < 2) return true; // 한 글자는 잡음으로 본다
  const pairs = Array.from({ length: h.length - 1 }, (_, i) => h.slice(i, i + 2));
  const hits = pairs.filter((p) => l.includes(p)).length;
  return hits / pairs.length >= ECHO_OVERLAP;
}

export interface ListenerEvents {
  onInterim: (text: string) => void; // 지금 말하는 중인 글자 (빈 글자 = 지움)
  onFinal: (text: string) => void; // 학생 한 턴
  onFatal: (message: string) => void; // 다시 들을 수 없는 오류 — 마이크를 끈다
}

export class SpeechListener {
  private readonly rec: Recognizer;
  private alive = true;
  private restart: ReturnType<typeof setTimeout> | undefined;
  private submitTimer: ReturnType<typeof setTimeout> | undefined;
  private pending = ''; // 확정됐지만 아직 보내지 않은 말

  constructor(Ctor: RecognizerCtor, lang: Lang, private readonly speaker: TutorSpeaker, private readonly events: ListenerEvents) {
    this.rec = new Ctor();
    this.rec.lang = LOCALE[lang];
    this.rec.continuous = true;
    this.rec.interimResults = true;
  }

  start(): void {
    this.rec.onresult = (e) => {
      let finals = '';
      let partial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (r.isFinal) finals += r[0]?.transcript ?? '';
        else partial += r[0]?.transcript ?? '';
      }
      this.onHeard(finals, partial);
    };
    this.rec.onerror = (e) => {
      const text = ERROR_TEXT[e.error];
      if (!text) return; // no-speech · aborted 는 그냥 다시 듣는다
      this.alive = false;
      this.events.onFatal(text);
    };
    this.rec.onend = () => {
      if (this.alive) this.restart = setTimeout(() => this.alive && this.tryStart(), RESTART_MS);
    };
    this.tryStart();
  }

  stop(): void {
    this.alive = false;
    clearTimeout(this.restart);
    clearTimeout(this.submitTimer);
    this.pending = '';
    this.events.onInterim('');
    this.rec.onresult = null;
    this.rec.onerror = null;
    this.rec.onend = null;
    this.rec.abort();
  }

  private onHeard(finals: string, partial: string): void {
    const heard = `${finals} ${partial}`.trim();
    if (!heard) return;
    const echoTail = Date.now() - this.speaker.spokeUntil < ECHO_TAIL_MS;
    if (echoTail && !this.pending && isEcho(heard, this.speaker.lastLine)) return;
    if (finals.trim()) this.pending = `${this.pending} ${finals.trim()}`.trim();
    this.events.onInterim(`${this.pending} ${partial.trim()}`.trim());
    clearTimeout(this.submitTimer);
    if (this.pending && !partial.trim()) this.submitTimer = setTimeout(() => this.submit(), SUBMIT_SILENCE_MS);
  }

  private submit(): void {
    const text = this.pending.trim();
    this.pending = '';
    this.events.onInterim('');
    if (text) this.events.onFinal(text);
  }

  private tryStart(): void {
    try {
      this.rec.start();
    } catch {
      // 이미 듣는 중이면 start()가 던진다 — 그대로 둔다
    }
  }
}

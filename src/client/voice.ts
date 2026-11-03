// shortcut: 브라우저 내장 음성 — 연구실 lab-server 엔진으로 바꿀 때 이 파일만 교체
// 학생 말 = SpeechRecognition(실시간 자막 + 확정 결과), 튜터 말 = speechSynthesis.
// 튜터가 말하는 동안 들은 것은 턴으로 보내지 않는다 — 다만 튜터 말의 메아리가 아닌 말이 들리면(끼어들기) 튜터 말을 바로 끊는다.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from '../state';

export type VoiceState = 'listening' | 'speaking' | 'thinking' | 'muted' | 'unsupported';

// 브라우저마다 타입 정의가 달라 필요한 만큼만 적는다
interface RecAlternative { transcript: string }
interface RecResult { readonly isFinal: boolean; readonly [index: number]: RecAlternative }
interface RecEvent { resultIndex: number; results: { readonly length: number; readonly [index: number]: RecResult } }
interface Recognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type RecognizerCtor = new () => Recognizer;

const LOCALE: Record<Lang, string> = { ko: 'ko-KR', en: 'en-US' };
const SUBMIT_SILENCE_MS = 1200; // 확정된 말 뒤에 이만큼 조용하면 한 턴으로 보낸다
const RESTART_MS = 300; // 브라우저가 듣기를 스스로 끝내면 잠깐 쉬고 다시 켠다
const ECHO_TAIL_MS = 1500; // 튜터 말이 끝난 뒤에도 늦게 오는 메아리를 걸러 낸다
const ECHO_OVERLAP = 0.6; // 들은 말의 글자쌍이 이만큼 튜터 말에 있으면 메아리로 본다
const SPEECH_MS_PER_CHAR = 250; // end 이벤트가 오지 않을 때를 대비한 안전 시간
const SPEECH_MS_BASE = 3000;

function recognizerCtor(): RecognizerCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ttsAvailable = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

const squash = (t: string) => t.toLowerCase().replace(/[\s.,?!'"“”‘’…·-]/g, '');

// 튜터 말이 스피커에서 마이크로 다시 들어온 것인가
function isEcho(heard: string, line: string): boolean {
  const h = squash(heard);
  const l = squash(line);
  if (h.length < 2) return true; // 한 글자는 잡음으로 본다
  const pairs = Array.from({ length: h.length - 1 }, (_, i) => h.slice(i, i + 2));
  const hits = pairs.filter((p) => l.includes(p)).length;
  return hits / pairs.length >= ECHO_OVERLAP;
}

const ERROR_TEXT: Record<string, string> = {
  'not-allowed': '마이크 사용이 막혀 있어요. 주소창 옆 마이크 권한을 허용하거나, 글자로 입력해 주세요.',
  'service-not-allowed': '이 브라우저에서 음성 인식을 쓸 수 없어요. 글자로 입력해 주세요.',
  'audio-capture': '마이크를 찾지 못했어요. 마이크를 연결하거나, 글자로 입력해 주세요.',
  network: '음성 인식 서버에 연결하지 못했어요. 인터넷 연결을 확인하거나, 글자로 입력해 주세요.',
};

function pickVoice(locale: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === locale) ?? voices.find((v) => v.lang.startsWith(locale.slice(0, 2)));
}

interface Options {
  lang: Lang;
  thinking: boolean; // 서버 답을 기다리는 중 — 듣지 않는다
  hold: boolean; // 문단을 고치는 중이거나 세션이 끝남 — 듣지 않는다
  onFinal: (text: string) => void; // 학생 한 턴
}

export interface Voice {
  state: VoiceState;
  canListen: boolean;
  canSpeak: boolean;
  micOn: boolean;
  held: boolean; // 마이크는 켜져 있지만 편집 때문에 잠시 멈춤
  toggleMic: () => void;
  interim: string; // 학생이 지금 말하는 중인 글자
  speak: (text: string) => number; // 말할 줄의 번호 (말하지 못하면 0)
  stop: () => void; // 튜터 말 멈추기
  endedId: number; // 끝까지 말했거나 끊긴 마지막 줄의 번호
  error: string;
}

export function useVoice({ lang, thinking, hold, onFinal }: Options): Voice {
  const [canListen] = useState(() => recognizerCtor() !== null);
  const [canSpeak] = useState(ttsAvailable);
  const [micOn, setMicOn] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState('');
  const [endedId, setEndedId] = useState(0);
  const [error, setError] = useState('');

  const lineRef = useRef(''); // 지금(또는 방금) 말한 튜터 줄 — 메아리 판별용
  const speakingRef = useRef(false);
  const spokeUntil = useRef(0);
  const nextId = useRef(0);
  const currentId = useRef(0);
  const safety = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef('');
  const submitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const finishLine = useCallback((id: number) => {
    if (currentId.current !== id) return;
    currentId.current = 0;
    clearTimeout(safety.current);
    speakingRef.current = false;
    spokeUntil.current = Date.now();
    setSpeaking(false);
    setEndedId(id);
  }, []);

  const stop = useCallback(() => {
    const id = currentId.current;
    if (!id || !ttsAvailable()) return;
    window.speechSynthesis.cancel();
    finishLine(id);
  }, [finishLine]);

  const speak = useCallback((text: string) => {
    if (!ttsAvailable() || !text.trim()) return 0;
    stop();
    const id = ++nextId.current;
    const locale = LOCALE[lang];
    const u = new SpeechSynthesisUtterance(text);
    u.lang = locale;
    const voice = pickVoice(locale);
    if (voice) u.voice = voice;
    u.onend = () => finishLine(id);
    u.onerror = () => finishLine(id);
    currentId.current = id;
    lineRef.current = text;
    speakingRef.current = true;
    setSpeaking(true);
    clearTimeout(safety.current);
    safety.current = setTimeout(() => finishLine(id), SPEECH_MS_BASE + text.length * SPEECH_MS_PER_CHAR);
    window.speechSynthesis.speak(u);
    return id;
  }, [lang, stop, finishLine]);

  // 화면을 떠나면 말을 멈춘다
  useEffect(() => () => {
    clearTimeout(safety.current);
    if (ttsAvailable()) window.speechSynthesis.cancel();
  }, []);

  const running = canListen && micOn && !hold && !thinking;

  useEffect(() => {
    const Ctor = recognizerCtor();
    if (!running || !Ctor) return;
    let alive = true;
    let restart: ReturnType<typeof setTimeout> | undefined;
    const rec = new Ctor();
    rec.lang = LOCALE[lang];
    rec.continuous = true;
    rec.interimResults = true;

    const submit = () => {
      const text = pending.current.trim();
      pending.current = '';
      setInterim('');
      if (text) onFinalRef.current(text);
    };

    rec.onresult = (e) => {
      let finals = '';
      let partial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (r.isFinal) finals += r[0]?.transcript ?? '';
        else partial += r[0]?.transcript ?? '';
      }
      const heard = `${finals} ${partial}`.trim();
      if (!heard) return;
      const echoWindow = speakingRef.current || Date.now() - spokeUntil.current < ECHO_TAIL_MS;
      if (echoWindow && !pending.current && isEcho(heard, lineRef.current)) return;
      if (speakingRef.current) stop(); // 끼어들기 — 학생이 말을 시작했다
      if (finals.trim()) pending.current = `${pending.current} ${finals.trim()}`.trim();
      setInterim(`${pending.current} ${partial.trim()}`.trim());
      clearTimeout(submitTimer.current);
      if (pending.current && !partial.trim()) submitTimer.current = setTimeout(submit, SUBMIT_SILENCE_MS);
    };

    rec.onerror = (e) => {
      const text = ERROR_TEXT[e.error];
      if (!text) return; // no-speech · aborted 는 그냥 다시 듣는다
      alive = false;
      setError(text);
      setMicOn(false);
    };

    rec.onend = () => {
      if (alive) restart = setTimeout(() => alive && tryStart(), RESTART_MS);
    };

    const tryStart = () => {
      try {
        rec.start();
      } catch {
        // 이미 듣는 중이면 start()가 던진다 — 그대로 둔다
      }
    };

    setError('');
    tryStart();
    return () => {
      alive = false;
      clearTimeout(restart);
      clearTimeout(submitTimer.current);
      pending.current = '';
      setInterim('');
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.abort();
    };
  }, [running, lang, stop]);

  const toggleMic = useCallback(() => {
    if (!canListen) return;
    setError('');
    setMicOn((on) => !on);
  }, [canListen]);

  const state: VoiceState = speaking
    ? 'speaking'
    : thinking
      ? 'thinking'
      : !canListen
        ? 'unsupported'
        : !micOn
          ? 'muted'
          : 'listening';

  return {
    state, canListen, canSpeak, micOn, held: canListen && micOn && hold,
    toggleMic, interim, speak, stop, endedId, error,
  };
}

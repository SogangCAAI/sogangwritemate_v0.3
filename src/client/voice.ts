// shortcut: 브라우저 내장 음성 인식 — 연구실 lab-server 엔진으로 바꿀 때 이 파일만 교체
// 학생 말 = SpeechRecognition(실시간 자막 + 확정 결과). 튜터 말 = 서버 TTS(/api/tts)를 <audio>로 재생,
// 서버 음성이 없으면 브라우저 내장 speechSynthesis.
//
// 메아리 제거 세 겹:
//  1. 튜터가 말하는 동안 음성 인식을 끈다 (반이중) — 튜터 목소리가 학생 말로 받아 적힐 길이 없다.
//  2. 끼어들기는 echoCancellation이 켜진 마이크의 소리 크기로 잡는다. 튜터 목소리를 <audio>로 재생해야
//     Chrome의 메아리 제거가 그 소리를 기준 신호로 삼아 걸러 낸다 (OS가 재생하는 speechSynthesis는 못 거른다
//     — 그때는 문턱을 높인다).
//  3. 튜터 말이 끝난 직후 늦게 들어온 메아리는 글자 겹침으로 한 번 더 거른다.
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
const SPEECH_MS_PER_CHAR = 250; // 끝 이벤트가 오지 않을 때를 대비한 안전 시간
const SPEECH_MS_BASE = 3000;
// 끼어들기: 메아리 제거된 마이크 소리(RMS)가 문턱을 이만큼 넘게 이어지면 학생이 말을 시작한 것으로 본다
const BARGE = { server: 0.03, browser: 0.1 } as const; // speechSynthesis는 메아리 제거가 안 돼 문턱을 높인다
const BARGE_HOLD_MS = 300;
const BARGE_ONSET_MS = 400; // 재생 시작 직후의 튀는 소리는 무시한다
const BARGE_POLL_MS = 50;

function recognizerCtor(): RecognizerCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const synthAvailable = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

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
  const [micOn, setMicOn] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState('');
  const [endedId, setEndedId] = useState(0);
  const [error, setError] = useState('');

  const lineRef = useRef(''); // 지금(또는 방금) 말한 튜터 줄 — 메아리 판별용
  const spokeUntil = useRef(0);
  const nextId = useRef(0);
  const currentId = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const modeRef = useRef<'server' | 'browser'>('server');
  const startedAt = useRef(0);
  const safety = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef('');
  const submitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const finishLine = useCallback((id: number) => {
    if (currentId.current !== id) return;
    currentId.current = 0;
    clearTimeout(safety.current);
    audioRef.current = null;
    spokeUntil.current = Date.now();
    setSpeaking(false);
    setEndedId(id);
  }, []);

  const stop = useCallback(() => {
    const id = currentId.current;
    if (!id) return;
    audioRef.current?.pause();
    if (synthAvailable()) window.speechSynthesis.cancel();
    finishLine(id);
  }, [finishLine]);

  const speakWithBrowser = useCallback((id: number, text: string) => {
    if (!synthAvailable()) return finishLine(id);
    modeRef.current = 'browser';
    const locale = LOCALE[lang];
    const u = new SpeechSynthesisUtterance(text);
    u.lang = locale;
    const voice = pickVoice(locale);
    if (voice) u.voice = voice;
    u.onend = () => finishLine(id);
    u.onerror = () => finishLine(id);
    window.speechSynthesis.speak(u);
  }, [lang, finishLine]);

  const speak = useCallback((text: string) => {
    if (!text.trim()) return 0;
    stop();
    const id = ++nextId.current;
    currentId.current = id;
    lineRef.current = text;
    startedAt.current = Date.now();
    setSpeaking(true);
    clearTimeout(safety.current);
    safety.current = setTimeout(() => finishLine(id), SPEECH_MS_BASE + text.length * SPEECH_MS_PER_CHAR);
    void fetchTts(text, lang).then((audio) => {
      if (currentId.current !== id) return; // 그새 멈췄거나 다음 줄로 넘어갔다
      if (!audio) return speakWithBrowser(id, text);
      modeRef.current = 'server';
      const el = new Audio(`data:audio/mpeg;base64,${audio}`);
      audioRef.current = el;
      startedAt.current = Date.now();
      el.onended = () => finishLine(id);
      el.onerror = () => speakWithBrowser(id, text);
      el.play().catch(() => speakWithBrowser(id, text)); // 자동 재생이 막히면 브라우저 음성으로
    });
    return id;
  }, [lang, stop, finishLine, speakWithBrowser]);

  // 화면을 떠나면 말을 멈춘다
  useEffect(() => () => {
    clearTimeout(safety.current);
    audioRef.current?.pause();
    if (synthAvailable()) window.speechSynthesis.cancel();
  }, []);

  // ── 끼어들기 감지: 튜터가 말하는 동안만, 메아리 제거된 마이크 소리 크기로 ──
  const micStream = useRef<Promise<MediaStream | null> | null>(null);
  useEffect(() => () => {
    void micStream.current?.then((s) => s?.getTracks().forEach((t) => t.stop()));
  }, []);

  useEffect(() => {
    if (!speaking || !micOn || !canListen || !navigator.mediaDevices?.getUserMedia) return;
    micStream.current ??= navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .catch(() => null); // 권한이 없으면 끼어들기 감지 없이 반이중으로만 — '튜터 말 멈추기' 버튼은 남는다
    let alive = true;
    let ctx: AudioContext | null = null;
    let poll: ReturnType<typeof setInterval> | undefined;
    void micStream.current.then((stream) => {
      if (!alive || !stream) return;
      ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      let loudSince = 0;
      poll = setInterval(() => {
        if (Date.now() - startedAt.current < BARGE_ONSET_MS) return;
        analyser.getFloatTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((sum, v) => sum + v * v, 0) / buf.length);
        if (rms < BARGE[modeRef.current]) { loudSince = 0; return; }
        loudSince ||= Date.now();
        if (Date.now() - loudSince >= BARGE_HOLD_MS) stop(); // 학생이 말을 시작했다 → 튜터 멈춤, 듣기 시작
      }, BARGE_POLL_MS);
    });
    return () => {
      alive = false;
      clearInterval(poll);
      void ctx?.close();
    };
  }, [speaking, micOn, canListen, stop]);

  // ── 음성 인식: 튜터가 말하는 동안은 끈다 (반이중) ──
  const running = canListen && micOn && !hold && !thinking && !speaking;

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
      const echoTail = Date.now() - spokeUntil.current < ECHO_TAIL_MS;
      if (echoTail && !pending.current && isEcho(heard, lineRef.current)) return;
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
  }, [running, lang]);

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
    state, canListen, canSpeak: true, micOn, held: canListen && micOn && hold,
    toggleMic, interim, speak, stop, endedId, error,
  };
}

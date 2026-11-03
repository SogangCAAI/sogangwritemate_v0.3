// 음성 모듈의 바깥 모양(Voice)과 브라우저 음성 인식 타입
import type { Lang } from '../../state';

export type VoiceState = 'listening' | 'speaking' | 'thinking' | 'muted' | 'unsupported';

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

export interface VoiceOptions {
  lang: Lang;
  thinking: boolean; // 서버 답을 기다리는 중 — 듣지 않는다
  hold: boolean; // 문단을 고치는 중이거나 세션이 끝남 — 듣지 않는다
  onFinal: (text: string) => void; // 학생 한 턴
}

// 브라우저마다 타입 정의가 달라 필요한 만큼만 적는다
interface RecAlternative { transcript: string }
interface RecResult { readonly isFinal: boolean; readonly [index: number]: RecAlternative }
export interface RecEvent { resultIndex: number; results: { readonly length: number; readonly [index: number]: RecResult } }
export interface Recognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
export type RecognizerCtor = new () => Recognizer;

export const LOCALE: Record<Lang, string> = { ko: 'ko-KR', en: 'en-US' };

export function recognizerCtor(): RecognizerCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const synthAvailable = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

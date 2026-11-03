// 결정적 사실 검사 — 길이 · 3번째 자리 · 인용 존재 · 시간 · 상투 표현 (LLM 없음)
import { SESSION_MS, type SessionState } from './state';

// 문장 경계: 마침표·물음표·느낌표(+닫는 따옴표) 뒤의 공백
const SENTENCE_END = /(?<=[.?!。？！]["”’']?)\s+/;

export function sentences(text: string): string[] {
  return text.split(SENTENCE_END).map((x) => x.trim()).filter(Boolean);
}

// 기본 2문장, 마무리 요약 파트는 3문장까지 (NCF 문서 6절)
export function capSentences(text: string, max = 2): string {
  return sentences(text).slice(0, max).join(' ');
}


// 튜터 말 안의 인용("…")이 글·공고·시범 문장 어디에도 없으면 돌려준다 — 지어낸 인용 기록용
export function missingQuotes(text: string, sources: string[]): string[] {
  const squash = (x: string) => x.replace(/\s+/g, ' ').trim();
  const pool = squash(sources.join('\n'));
  const quotes = [...text.matchAll(/["“]([^"”]{4,})["”]/g)].map((m) => squash(m[1]!));
  return quotes.filter((q) => !pool.includes(q.replace(/[.,]$/, '')));
}

// ── 시간 ──

export function elapsedMs(s: SessionState, now: number): number {
  return Math.max(0, now - s.startedAt);
}

export function sessionLeftMs(s: SessionState, now: number): number {
  return SESSION_MS - elapsedMs(s, now);
}

export function mmss(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

// ── 상투 표현 (v2 clicheDictionary.ts 이식 + '열정을 가지고') ──

interface Cliche { pattern: RegExp; label: string; paragraphEnd?: boolean }

const CLICHES: Cliche[] = [
  { pattern: /열심히\s*(노력|하겠|했)/, label: '열심히 노력' },
  { pattern: /최선을\s*다하/, label: '최선을 다하겠다' },
  { pattern: /열정을\s*(가지고|갖고)/, label: '열정을 가지고' },
  { pattern: /성실함?(을|이)\s*바탕/, label: '성실함을 바탕으로' },
  { pattern: /귀사의\s*(비전|발전|성장)/, label: '귀사의 비전/발전' },
  { pattern: /어려서부터|어렸을\s*때부터|어릴\s*적부터/, label: '어려서부터' },
  { pattern: /엄격한\s*아버지|자상한\s*어머니|화목한\s*가정/, label: '가정환경 상투구' },
  { pattern: /밑거름이\s*되/, label: '밑거름' },
  { pattern: /원동력이\s*되/, label: '원동력' },
  { pattern: /아낌없이/, label: '아낌없이' },
  { pattern: /글로벌\s*인재/, label: '글로벌 인재' },
  { pattern: /무한한\s*(가능성|잠재력)/, label: '무한한 가능성' },
  { pattern: /도전\s*정신/, label: '도전 정신' },
  { pattern: /책임감을\s*가지고/, label: '책임감을 가지고' },
  { pattern: /준비된\s*인재/, label: '준비된 인재' },
  { pattern: /(뽑|시켜)만?\s*주신다면/, label: '뽑아만 주신다면' },
  { pattern: /하면\s*된다/, label: '하면 된다' },
  { pattern: /누구보다/, label: '누구보다' },
  { pattern: /일취월장|괄목상대/, label: '사자성어 상투구' },
  { pattern: /소중한\s*경험/, label: '소중한 경험' },
  { pattern: /한\s*단계\s*성장/, label: '한 단계 성장' },
  { pattern: /[는은]\s*편입니다/, label: '어조: ~인 편입니다' },
  { pattern: /것\s*같습니다|듯합니다/, label: '어조: 판단 회피' },
  { pattern: /해\s*보(았|는\s*경험)/, label: '어조: 시도형 소극 서술' },
  { pattern: /할\s*수\s*있었습니다/, label: '어조: 가능형 소극 서술' },
  { pattern: /아니지만|부족하지만/, label: '어조: 자기 낮춤 역접' },
  { pattern: /했죠|인데요/, label: '어조: 구어체 어미' },
  // 문단 마지막 문장에서만 — 본문 중간의 "배웠습니다"는 정당한 서술
  { pattern: /(배웠습니다|깨달았습니다|느꼈습니다|알게\s*되었습니다)\.?$/, label: '어조: 학습자 프레임 마무리', paragraphEnd: true },
];

export interface ClicheHit { paragraph: number; label: string; text: string }

// paragraphs[0]이 1문단
export function findCliches(paragraphs: string[]): ClicheHit[] {
  return paragraphs.flatMap((p, i) => {
    const lastSentence = sentences(p).at(-1) ?? '';
    return CLICHES.flatMap((c) => {
      const m = (c.paragraphEnd ? lastSentence : p).match(c.pattern);
      return m ? [{ paragraph: i + 1, label: c.label, text: m[0] }] : [];
    });
  });
}

// 과제에 쓴 시간 — 끝나지 않았으면 지금까지
export function taskTimeMs(t: { startedAt?: number; endedAt?: number }, now: number): number {
  return t.startedAt === undefined ? 0 : (t.endedAt ?? now) - t.startedAt;
}

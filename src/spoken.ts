// 소리로 읽을 글 — 화면에는 "1문단"으로 두고, 음성으로는 "첫째 문단"으로 읽게 바꾼다.
// TTS는 "1문단"을 "일문단"으로 읽는다 (사용자 요청 2026-11-03).
import type { Lang } from './state';

const ORDINAL = [
  '', '첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째', '일곱째', '여덟째', '아홉째', '열째',
  '열한째', '열두째', '열셋째', '열넷째', '열다섯째', '열여섯째', '열일곱째', '열여덟째', '열아홉째', '스무째',
];

// "1문단" · "1번 문단" · "1 문단" → "첫째 문단". 문단은 20개까지라 그 밖의 숫자는 그대로 둔다
export function toSpoken(text: string, lang: Lang): string {
  if (lang !== 'ko') return text;
  return text.replace(/(\d{1,2})\s*(?:번\s*)?문단/g, (m, n: string) => {
    const word = ORDINAL[Number(n)];
    return word ? `${word} 문단` : m;
  });
}

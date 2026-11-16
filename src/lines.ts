// 코드가 직접 말하는 문장 — 글은 src/prompts.ts 5장에 있다 (모델을 부르지 않는 턴: 수리 기본값·B1·시간 제안·마무리 파트)
import type { Lang, Task } from './state';
import { lines } from './prompts';

export { lines };
export type { Lines } from './prompts';

// 마무리 A3 파트 — 과제 표에서만 만든다 (지어낸 성과가 없도록)
export function closingParts(lang: Lang, tasks: readonly Task[]): string[] {
  const L = lines(lang);
  const parts = tasks.map((t, i) => {
    const said = t.status === 'done' ? L.status.done : t.status === 'skipped' ? L.status.skipped : L.status.rest;
    return `${L.markers[Math.min(i, 2)]} ${t.goal} — ${said}`;
  });
  const lastIdx = parts.length - 1;
  return parts.map((p, i) => (i === lastIdx ? `${p} ${L.successCheck}` : p));
}

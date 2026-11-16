// 턴 프롬프트 조립 — src/prompts.ts 1장의 글에 코드가 아는 사실(공고·이력서·글·과제·열린 패턴·지금 과제·다음 칸·덧붙임 줄)을 채운다.
// 여기에는 모델이 읽는 글이 없다 — 글을 고치려면 src/prompts.ts로.
import { findCliches } from '../../checks';
import { activeTask, type Lang, type SessionState, type Task } from '../../state';
import { Tasks } from '../../conversation/Tasks';
import type { Context, Line } from '../parse/RequestParser';
import { essayText, fill, postingText, TURN } from '../../prompts';

// 다음 칸 — 지금 국면에서 모델이 할 일 한 줄
function slotFor(s: SessionState): string {
  const P = TURN[s.lang];
  if (s.open?.effect === 'startTask') return P.slot.start;
  if (s.open?.effect) return P.slot.timed;
  const t = activeTask(s);
  if (!t) return P.slot.idle;
  if (s.open?.pattern === 'A4') return P.slot.check(t.target.paragraph);
  // 결론이 확정됐으면 종류와 상관없이 고치기 칸 — 형식 과제가 합의를 되풀이하던 버그 (2026-11-16)
  if (Tasks.confirmed(t) || t.evidence) return P.slot.edit(t.target.paragraph);
  if (t.kind === 'structure') return P.slot.structure(Tasks.targets(t).map((n) => P.heads.para(n)).join('·'));
  if (t.kind === 'form') return P.slot.form(t.target.paragraph);
  return P.slot.listen;
}

// 이번 턴의 덧붙임 줄 — 못 알아들음 · 막힘 · 다른 요청 · 끼어들기
function extraFor(s: SessionState, short: boolean): string {
  const X = TURN[s.lang].extra;
  const inTask = !!activeTask(s);
  return [
    s.unclearStreak === 1 ? X.unclear : '',
    inTask && s.confusedStreak === 1 ? X.confused1 : '',
    inTask && s.confusedStreak === 2 ? X.confused2 : '',
    inTask && s.confusedStreak >= 3 ? X.confused3 : '',
    s.stage === 'closing' ? '' : s.offGoalCount === 0 ? X.offGoal0 : X.offGoal1,
    short ? X.short : '',
  ].filter(Boolean).join('\n');
}

function taskLine(t: Task, lang: Lang): string {
  const where = TURN[lang].heads.para(t.target.paragraph);
  return `${t.order}. [${t.status}] ${t.goal} (${t.kind}, ${where}${t.target.keyword ? `, '${t.target.keyword}'` : ''}) — doneWhen: ${t.doneWhen}`;
}

// 지금 과제의 완료 항목 — 재평가가 본 결과(✓/✗, ✓는 인용 구절까지). 모델이 힌트·질문을 못 채운 항목에 맞추고, 된 것을 다시 묻지 않게 한다
function criteriaLines(t: Task, lang: Lang): string {
  if (!t.criteria.length) return '';
  return `\n${TURN[lang].heads.criteria}:\n${t.criteria.map((c) => `  ${c.met ? '✓' : '✗'} ${c.text}${c.met && c.evidence ? ` — 「${c.evidence}」` : ''}`).join('\n')}`;
}

// 이미 정해진 것 — 결론 · 학생이 답하지 못한 질문 · 확인 질문에서 짚은 것. 같은 것을 다시 묻지 않게
function notesLines(t: Task, lang: Lang): string {
  if (!t.notes.length) return '';
  return `\n${TURN[lang].heads.settled}:\n${t.notes.map((n) => `  - ${n}`).join('\n')}`;
}

export class TurnPrompt {
  // short: 학생이 자주 끼어든다 (Interruption.shorten) — 한 문장으로
  system(s: SessionState, ctx: Context, short = false): string {
    const P = TURN[s.lang];
    const t = activeTask(s);
    const hits = findCliches(ctx.paragraphs);
    return fill(P.system, {
      posting: postingText(ctx.posting),
      essay: essayText(ctx.paragraphs),
      tasks: s.tasks.map((x) => taskLine(x, s.lang)).join('\n'),
      cliches: hits.length ? P.heads.cliches(hits.map((h) => `${P.heads.para(h.paragraph)} "${h.text}"`).join(', ')) : '',
      open: s.open ? `${s.open.pattern} — "${s.open.firstPair}"` : P.heads.none,
      resume: ctx.resume || P.heads.noResume,
      task: t ? `${taskLine(t, s.lang)}${t.experience.length ? ` / ${P.heads.heard}: ${t.experience.join(' ')}` : ''}${criteriaLines(t, s.lang)}${notesLines(t, s.lang)}` : P.heads.none,
      slot: slotFor(s),
      notes: extraFor(s, short),
    });
  }

  user(history: readonly Line[], text: string, lang: Lang): string {
    const R = TURN[lang].heads.roles;
    const lines = history.map((l) => `${l.who === 'tutor' ? R.tutor : R.student}: ${l.text}`).join('\n');
    return `${lines ? `${lines}\n\n` : ''}${R.now}: ${text}`;
  }
}

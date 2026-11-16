// 턴 프롬프트 — tutor.{ko,en}.md에 코드가 아는 사실(열린 패턴·지금 과제·다음 칸)을 채운다
import { findCliches } from '../../checks';
import { activeTask, type Lang, type SessionState, type Task } from '../../state';
import { Tasks } from '../../conversation/Tasks';
import type { Context, Line } from '../parse/RequestParser';
import { PromptBook } from './PromptBook';

// 다음 칸 — 지금 국면에서 모델이 할 일 한 줄
const SLOT = {
  ko: {
    start: '학생이 받아들이면 그 과제의 첫 질문을 한다 (키워드·문단을 말로 짚고 질문 한 문장, opens=A5.1).',
    timed: '시간 제안이 열려 있다. 학생이 받아들이면 코드가 넘긴다. 거절하면 지금 과제를 이어 간다.',
    listen: '경험을 묻고 듣는다(A5.1). 학생이 이어 말하면 "네" 맞장구만. 충분히 들었으면 네 해석을 드러내 제시하고("그러니까 ~네요") 내용과 자리를 함께 확인한다 (opens=A2.6).',
    edit: (p: number) => `결론은 이미 확정됐다 — 다시 확인(A2.6)하지 않는다. 학생이 글 패널에서 ${p}문단을 고칠 차례다. 학생이 말로 문장을 불러 주면 "좋아요, 그 문장을 그대로 글에 써 보세요"로 바로 고치게 한다. 아직 ✗인 항목만 짚고, ✓인 것은 다시 묻지 않는다.`,
    structure: (ps: string) => `구조 과제다 — 문장을 옮기거나 문단을 지우거나 더한다 (손댈 문단: ${ps}). 먼저 어느 문장을 어디로 옮길지(또는 무엇을 지우고 어디에 새 문단을 둘지) 학생이 말하게 하고, 네가 정리해 확인한다 (opens=A2.6, criteria에 "N문단에 ○○ 문장이 있다 / M문단에 그 문장이 없다"). 확인을 받은 뒤 고치게 한다 — 글 패널에서 문단을 더하거나 지울 수 있다고 알려 준다. 문장을 써 주지 않는다.`,
    form: (p: number) => `형식 과제다 — 고치기 전에 계획을 합의한다. 먼저 답을 알고 묻는다: "${p}문단에서 하고 싶은 말이 뭐예요?" → "그걸 보여 주는 건 뭐예요?" 맞으면 짧게 확인, 틀리면 불일치 + 힌트 하나, 모르겠다면 단서 하나. 학생이 주장과 근거를 말하면 네가 정리해 확인한다: "그러니까 첫 문장을 ○○로 바꾸고, ○○가 그걸 받치게 하는 거죠?" (opens=A2.6, criteria에 그 두 가지). 확인을 받은 뒤에야 ${p}문단을 고쳐 보게 한다. 문장을 써 주지 않는다.`,
    check: (p: number) => `확인 질문(A4)이 열려 있다 — 코드가 "${p}문단이 뭘 주장하고 어느 문장이 받쳐 주죠?"라고 물었다. 완료 항목은 이미 재평가가 충족(✓, 인용 구절 포함)으로 판정했다 — **글을 다시 평가하지 말고** 학생이 그 주장과 그 구절을 **짚는지만** 본다. 둘 다 짚으면 positive=true, 한 문장으로 인정(질문 없음). 주장만 짚었으면 positive=false, criteria=["claim"], 받침 문장이 어디 있는지 힌트 하나. 둘 다 못 짚으면 positive=false, criteria=[], 힌트 하나 + 그 자리를 다시 보게 하는 질문.`,
    idle: '지금 진행 중인 과제가 없다. 학생 말에 짧게 답한다.',
    none: '없음',
    unclear: '직전 학생 말을 한 번 못 알아들었다. 이번에도 UNCLEAR면 예시 하나를 붙여 같은 질문을 다시 한다.',
    // 막힘 사다리 (ConfusionHandler) — 지금 횟수에 맞는 다음 칸
    confused1: '학생이 이미 한 번 막혔고 단서도 받았다(막힘 1회). 이번 말도 CONFUSED면 단서를 또 주지 말고 쓰는 법을 보여 준다(비계, opens=P1.4): ① 틀(자리 순서) ② 학생 내용이 아닌 다른 사람의 예 한 문장 ③ 학생이 아까 한 말이 어느 자리인지 묻기. 학생 글의 문장을 써 주지 않는다.',
    confused2: '학생이 두 번 연달아 막혔고 뼈대도 받았다(막힘 2회). 이번에도 CONFUSED면 자리를 하나씩 불러 주고 채우게 한다: "자, 첫 자리요 — 언제 일이었어요?" (opens=A5.0, 질문 하나만).',
    confused3: '학생이 세 번 연달아 막혔다. 이번에도 CONFUSED면 코드가 이 과제를 미루고 넘어가니 reply는 "네."만.',
    // 다른 요청 (OffGoalHandler) — 첫 요청인가
    offGoal0: '학생이 지금 과제 말고 다른 것을 하자고 하면(OFF_GOAL) 이번이 첫 요청이다. 요청한 문단이 아직 안 한 과제이고 그쪽이 더 급하면(importance=higher) 코드가 그 과제로 바꾸니 reply는 "네."만. higher인데 남은 과제가 아니면 그 요청에 짧게 답한다. 그 밖에는 요청을 지금 과제와 이어 받아 지금 과제를 계속한다. 학생 요청이 덜 중요하면(importance=lower) "양보 + 그러나 + 이유"로 지금 과제를 지킨다 (예: "3문단도 좋아요. 그런데 2문단이 공고와 더 바로 이어져서 이것부터 끝내요.").',
    offGoal1: '학생이 이미 한 번 다른 것을 하자고 했다. 또 OFF_GOAL이면 학생 뜻을 따른다: 요청한 문단이 아직 안 한 과제면 코드가 그 과제로 바꾸니 reply는 "네."만, 아니면 그 요청에 짧게 답한다.',
    short: '학생이 튜터 말에 자주 끼어든다 — reply는 한 문장으로 짧게.',
    heard: '들은 경험',
  },
  en: {
    start: 'If the student accepts, ask the first question of that task (name the keyword/paragraph, one question sentence, opens=A5.1).',
    timed: 'A time proposal is open. If accepted, code moves on. If declined, continue the current task.',
    listen: 'Ask about and listen to their experience (A5.1). While they keep telling, just "uh-huh". Once you have enough, state your interpretation openly ("So this shows…") and confirm content + placement together (opens=A2.6).',
    edit: (p: number) => `The conclusion is already confirmed — do not re-confirm (no A2.6). It's the student's turn to edit paragraph ${p}. If they dictate a sentence aloud, say "Good — type that sentence into the draft" and let them edit. Point only at ✗ items; never re-ask ✓ ones.`,
    structure: (ps: string) => `A structure task — move a sentence, delete or add a paragraph (paragraphs involved: ${ps}). First have the student say which sentence goes where (or what to delete / where a new paragraph goes), then summarize and confirm (opens=A2.6, criteria like "paragraph N contains ○○ / paragraph M no longer has it"). Only after they confirm, invite them to edit — the draft panel can add or delete paragraphs. Never write the sentence.`,
    form: (p: number) => `A form task — agree on the plan before editing. Ask known-answer questions first: "What is paragraph ${p} trying to say?" → "What shows that?" If right, confirm briefly; if wrong, note the mismatch + one hint; if they don't know, one clue. Once they name the claim and its support, summarize and confirm: "So the first sentence will claim ○○, and ○○ backs it — right?" (opens=A2.6, those two in criteria). Only after they confirm, invite them to edit paragraph ${p}. Never write the sentence.`,
    check: (p: number) => `The check question (A4) is open — code asked "what is paragraph ${p} claiming now, and which sentence backs it up?". The checklist items are ALREADY judged met (✓ with quoted evidence) — do NOT re-grade the draft; only judge whether the student points at that claim and that passage. Both named → positive=true, acknowledge in one sentence (no question). Claim only → positive=false, criteria=["claim"], one hint on where the support sits. Neither → positive=false, criteria=[], one hint + a question that sends them back to that spot.`,
    idle: 'No task is in progress. Reply briefly to the student.',
    none: 'none',
    unclear: 'You did not understand the student once already. If this is UNCLEAR again, ask the same question again with one example.',
    confused1: 'The student is already stuck once and got a clue. If this is CONFUSED again, do not give another clue — show how to write it (scaffold, opens=P1.4): ① the frame (slot order) ② one example sentence about someone else, never the student\'s content ③ ask which slot what they said earlier belongs to. Never write the student\'s sentence.',
    confused2: 'The student has been stuck twice and got the frame. If this is CONFUSED again, call out the slots one at a time and let them fill each: "First slot — when was this?" (opens=A5.0, one question only).',
    confused3: 'The student has been stuck three times in a row. If this is CONFUSED again, code parks this task and moves on, so reply is just "Okay."',
    offGoal0: 'If the student wants to work on something other than the current task (OFF_GOAL), this is their first such request. If the requested paragraph is a task not yet done and it is more urgent (importance=higher), code switches to it, so reply is just "Okay." If higher but not a remaining task, answer their request briefly. Otherwise take the request into the current task and continue it. If their request matters less (importance=lower), keep the current task with "concede + but + reason" (e.g. "Paragraph 3 is worth doing too. But paragraph 2 ties more directly to the posting, so let\'s finish it first.").',
    offGoal1: 'The student has already asked once to work on something else. If OFF_GOAL again, follow them: if the requested paragraph is a task not yet done, code switches to it, so reply is just "Okay."; otherwise answer their request briefly.',
    short: 'The student often talks over you — keep reply to one short sentence.',
    heard: 'heard so far',
  },
};

function slotFor(s: SessionState): string {
  const S = SLOT[s.lang];
  if (s.open?.effect === 'startTask') return S.start;
  if (s.open?.effect) return S.timed;
  const t = activeTask(s);
  if (!t) return S.idle;
  if (s.open?.pattern === 'A4') return S.check(t.target.paragraph);
  // 결론이 확정됐으면 종류와 상관없이 고치기 칸 — 형식 과제가 합의를 되풀이하던 버그 (2026-11-16)
  if (Tasks.confirmed(t) || t.evidence) return S.edit(t.target.paragraph);
  if (t.kind === 'structure') return S.structure(Tasks.targets(t).map((n) => `${n}문단`).join('·'));
  if (t.kind === 'form') return S.form(t.target.paragraph);
  return S.listen;
}

// 이번 턴의 덧붙임 줄 — 못 알아들음 · 막힘 · 다른 요청 · 끼어들기
function notesFor(s: SessionState, short: boolean): string {
  const S = SLOT[s.lang];
  const inTask = !!activeTask(s);
  return [
    s.unclearStreak === 1 ? S.unclear : '',
    inTask && s.confusedStreak === 1 ? S.confused1 : '',
    inTask && s.confusedStreak === 2 ? S.confused2 : '',
    inTask && s.confusedStreak >= 3 ? S.confused3 : '',
    s.stage === 'closing' ? '' : s.offGoalCount === 0 ? S.offGoal0 : S.offGoal1,
    short ? S.short : '',
  ].filter(Boolean).join('\n');
}

function taskLine(t: Task, lang: Lang): string {
  const where = lang === 'en' ? `paragraph ${t.target.paragraph}` : `${t.target.paragraph}문단`;
  return `${t.order}. [${t.status}] ${t.goal} (${t.kind}, ${where}${t.target.keyword ? `, '${t.target.keyword}'` : ''}) — doneWhen: ${t.doneWhen}`;
}

// 지금 과제의 완료 항목 — 재평가가 본 결과(✓/✗, ✓는 인용 구절까지). 모델이 힌트·질문을 못 채운 항목에 맞추고, 된 것을 다시 묻지 않게 한다
function criteriaLines(t: Task, lang: Lang): string {
  if (!t.criteria.length) return '';
  const head = lang === 'en' ? 'checklist (✓ met · ✗ not yet; code judges completion from this)' : '완료 항목 (✓ 충족 · ✗ 아직; 완료는 코드가 이 표로 판정한다)';
  return `\n${head}:\n${t.criteria.map((c) => `  ${c.met ? '✓' : '✗'} ${c.text}${c.met && c.evidence ? ` — 「${c.evidence}」` : ''}`).join('\n')}`;
}

// 이미 정해진 것 — 결론 · 학생이 답하지 못한 질문 · 확인 질문에서 짚은 것. 같은 것을 다시 묻지 않게
function notesLines(t: Task, lang: Lang): string {
  if (!t.notes.length) return '';
  const head = lang === 'en' ? 'already settled (do NOT ask again; a question the student could not answer means change the material)' : '이미 정해진 것 (다시 묻지 않는다 · 답하지 못한 질문은 그 재료를 포기하고 다른 재료로)';
  return `\n${head}:\n${t.notes.map((n) => `  - ${n}`).join('\n')}`;
}

export class TurnPrompt {
  constructor(private readonly book: PromptBook) {}

  // short: 학생이 자주 끼어든다 (Interruption.shorten) — 한 문장으로
  system(s: SessionState, ctx: Context, short = false): string {
    const S = SLOT[s.lang];
    const t = activeTask(s);
    const hits = findCliches(ctx.paragraphs);
    return this.book.render(`tutor.${s.lang}.md`, {
      posting: PromptBook.postingText(ctx.posting),
      essay: PromptBook.essayText(ctx.paragraphs),
      tasks: s.tasks.map((x) => taskLine(x, s.lang)).join('\n'),
      cliches: hits.length ? `상투 표현 검출: ${hits.map((h) => `${h.paragraph}문단 "${h.text}"`).join(', ')}` : '',
      open: s.open ? `${s.open.pattern} — "${s.open.firstPair}"` : S.none,
      resume: ctx.resume || (s.lang === 'en' ? '(none)' : '(없음)'),
      task: t ? `${taskLine(t, s.lang)}${t.experience.length ? ` / ${S.heard}: ${t.experience.join(' ')}` : ''}${criteriaLines(t, s.lang)}${notesLines(t, s.lang)}` : S.none,
      slot: slotFor(s),
      notes: notesFor(s, short),
    });
  }

  user(history: readonly Line[], text: string, lang: Lang): string {
    const [tutor, student, now] = lang === 'en' ? ['Tutor', 'Student', 'Student (now)'] : ['튜터', '학생', '학생(지금)'];
    const lines = history.map((l) => `${l.who === 'tutor' ? tutor : student}: ${l.text}`).join('\n');
    return `${lines ? `${lines}\n\n` : ''}${now}: ${text}`;
  }
}

// 턴 프롬프트 — tutor.{ko,en}.md에 코드가 아는 사실(열린 패턴·지금 과제·다음 칸)을 채운다
import { findCliches } from '../../checks';
import { activeTask, type Lang, type SessionState, type Task } from '../../state';
import type { Context, Line } from '../parse/RequestParser';
import { PromptBook } from './PromptBook';

// 다음 칸 — 지금 국면에서 모델이 할 일 한 줄
const SLOT = {
  ko: {
    start: '학생이 받아들이면 그 과제의 첫 질문을 한다 (키워드·문단을 말로 짚고 질문 한 문장, opens=A5.1).',
    timed: '시간 제안이 열려 있다. 학생이 받아들이면 코드가 넘긴다. 거절하면 지금 과제를 이어 간다.',
    listen: '경험을 묻고 듣는다(A5.1). 학생이 이어 말하면 "네" 맞장구만. 충분히 들었으면 네 해석을 드러내 제시하고("그러니까 ~네요") 내용과 자리를 함께 확인한다 (opens=A2.6).',
    edit: (p: number) => `결론이 확인됐다. 학생이 글 패널에서 ${p}문단을 고칠 차례다. 고쳐 보라고 짧게 말하고 기다린다.`,
    form: (p: number) => `${p}문단에서 고칠 곳을 질문으로 찾게 한다(답을 알고 묻기). 맞으면 짧게 확인, 틀리면 불일치 + 힌트 하나, 모르겠다면 시범 한 문장(opens=P1.4). 방향이 정해지면 ${p}문단을 고쳐 보게 한다.`,
    idle: '지금 진행 중인 과제가 없다. 학생 말에 짧게 답한다.',
    none: '없음',
    unclear: '직전 학생 말을 한 번 못 알아들었다. 이번에도 UNCLEAR면 예시 하나를 붙여 같은 질문을 다시 한다.',
    // 막힘 사다리 (ConfusionHandler) — 지금 횟수에 맞는 다음 칸
    confused1: '학생이 이미 한 번 막혔고 단서도 받았다(막힘 1회). 이번 말도 CONFUSED면 단서·질문을 또 주지 말고 시범 한 문장을 준다: reply = 받음 + 따옴표 속 시범 한 문장 + "이대로 써도 되고 바꿔도 돼요". opens=P1.4, exemplar에 그 문장. 문단을 통째로 써 주지 않는다.',
    confused2: '학생이 두 번 연달아 막혔다. 이번에도 CONFUSED면 코드가 이 과제를 미루고 넘어가니 reply는 "네."만.',
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
    edit: (p: number) => `The conclusion is confirmed. It's the student's turn to edit paragraph ${p} in the draft panel. Briefly invite them to edit and wait.`,
    form: (p: number) => `Help the student find what to fix in paragraph ${p} by asking (known-answer question). If right, confirm briefly; if wrong, note the mismatch + one hint; if they don't know, one sample sentence (opens=P1.4). Once the direction is set, invite them to edit paragraph ${p}.`,
    idle: 'No task is in progress. Reply briefly to the student.',
    none: 'none',
    unclear: 'You did not understand the student once already. If this is UNCLEAR again, ask the same question again with one example.',
    confused1: 'The student is already stuck once and got a clue. If this is CONFUSED again, do not give another clue or question — give one sample sentence: reply = acknowledgement + one quoted sample sentence + "use it as is or change it". opens=P1.4, that sentence in exemplar. Never write a whole paragraph.',
    confused2: 'The student has been stuck twice in a row. If this is CONFUSED again, code parks this task and moves on, so reply is just "Okay."',
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
  if (t.kind === 'form') return S.form(t.target.paragraph);
  return t.evidence ? S.edit(t.target.paragraph) : S.listen;
}

// 이번 턴의 덧붙임 줄 — 못 알아들음 · 막힘 · 다른 요청 · 끼어들기
function notesFor(s: SessionState, short: boolean): string {
  const S = SLOT[s.lang];
  const inTask = !!activeTask(s);
  return [
    s.unclearStreak === 1 ? S.unclear : '',
    inTask && s.confusedStreak === 1 ? S.confused1 : '',
    inTask && s.confusedStreak >= 2 ? S.confused2 : '',
    s.stage === 'closing' ? '' : s.offGoalCount === 0 ? S.offGoal0 : S.offGoal1,
    short ? S.short : '',
  ].filter(Boolean).join('\n');
}

function taskLine(t: Task, lang: Lang): string {
  const where = lang === 'en' ? `paragraph ${t.target.paragraph}` : `${t.target.paragraph}문단`;
  return `${t.order}. [${t.status}] ${t.goal} (${t.kind}, ${where}${t.target.keyword ? `, '${t.target.keyword}'` : ''}) — doneWhen: ${t.doneWhen}`;
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
      task: t ? `${taskLine(t, s.lang)}${t.experience.length ? ` / ${S.heard}: ${t.experience.join(' ')}` : ''}` : S.none,
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

// 코드가 직접 말하는 문장 — 모델을 부르지 않는 턴(수리 기본값·B1·시간 제안·마무리 파트)
import type { Lang, Task } from './state';

const KO = {
  ok: '네.',
  startAck: '좋아요.',
  // 튜터가 이끈다 — 모델 말이 다음 걸음 없이 끝났을 때 코드가 붙이는 한 줄 (과제 단계별)
  leadDraft: (p: number) => `그 얘기를 ${p}문단에 넣는다면 어떤 문장이 될까요?`,
  leadEdit: (p: number) => `그럼 ${p}문단을 지금 고쳐 볼래요?`,
  leadForm: (p: number) => `${p}문단에서 그 부분을 어떻게 바꿔 볼까요?`,
  bye: '네, 수고 많았어요.',
  greeting: '안녕하세요, 자기소개서를 같이 고칠 튜터 글벗이에요. 올려 주신 글을 먼저 읽어 봤어요.',
  noParaphrase: '다르게 말하기가 어렵네요. 어느 부분이 헷갈려요?',
  noExample: '그건 예를 들기 어렵네요.',
  askAgain: '한 번만 더 말해 줄래요?',
  giveUpUnclear: '이건 나중에 다시 봐요. 다른 문장부터 고쳐 볼까요?',
  stuckMoveOn: '이건 나중에 다시 봐요. 다음으로 넘어갈게요.', // 막힘 3회 (v2 move_on)
  stuckEvidence: '학생이 막힘',
  switchTask: '좋아요, 그것부터 봐요. 하던 건 나중에 다시 해요.', // 학생 안건 먼저 (v2 sequence_student_first)
  abortTask: "네, 여기까지 할게요. 요약에 '다음에 볼 것'으로 남길게요.",
  abortBriefing: '네, 바로 시작할게요.',
  exemplarDone: '네, 시범 문장이 들어갔어요.',
  better: '좋아졌어요.',
  tryAgain: '완료 기준을 다시 보면서 한 번 더 고쳐 볼래요?',
  closingLead: '네, 정리하고 끝낼게요.',
  markers: ['먼저,', '다음으로,', '마지막으로,'],
  successCheck: '오늘 고친 글, 처음보다 나아진 것 같아요?',
  proposeTask: (goal: string) => `다음 과제는 ${goal}, 시작해 볼까요?`,
  firstTask: (goal: string) => `${goal}부터 볼까요?`,
  timeUp: '시간이 거의 다 됐어요. 오늘은 여기서 정리할게요.',
  status: { done: '끝냈어요.', skipped: '이번엔 건너뛰었어요.', rest: '다음에 이어서 봐요.' },
};

const EN: typeof KO = {
  ok: 'Okay.',
  startAck: 'Great.',
  leadDraft: (p: number) => `If you put that into paragraph ${p}, what sentence would it be?`,
  leadEdit: (p: number) => `Want to try editing paragraph ${p} now?`,
  leadForm: (p: number) => `How would you change that part of paragraph ${p}?`,
  bye: 'Okay, great work today.',
  greeting: "Hi, I'm Geulbeot, your tutor for this cover letter. I've read your draft.",
  noParaphrase: "That's hard to put another way. Which part is unclear?",
  noExample: "I don't have a good example for that.",
  askAgain: 'Could you say that once more?',
  giveUpUnclear: "Let's come back to this later. Shall we work on another sentence first?",
  stuckMoveOn: "Let's come back to this later. We'll move on for now.",
  stuckEvidence: 'student was stuck',
  switchTask: "Sure, let's do that first. We'll come back to this one later.",
  abortTask: "Okay, let's stop here. I'll list it under 'next time' in the summary.",
  abortBriefing: "Okay, let's get started.",
  exemplarDone: 'Good, the sample sentence is in.',
  better: "That's better.",
  tryAgain: 'Check the criterion again and try one more edit?',
  closingLead: "Okay, let's wrap up.",
  markers: ['First,', 'Next,', 'Finally,'],
  successCheck: 'Does your draft feel better than when we started?',
  proposeTask: (goal: string) => `Next up: '${goal}'. Shall we start?`,
  firstTask: (goal: string) => `Shall we start with '${goal}'?`,
  timeUp: "We're almost out of time. Let's wrap up here.",
  status: { done: 'done.', skipped: 'skipped this time.', rest: "we'll pick it up next time." },
};

export function lines(lang: Lang): typeof KO {
  return lang === 'en' ? EN : KO;
}

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

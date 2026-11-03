// 대본 목업(대본 목업 - NCF 패턴 1차.md)의 결과를 표로 검사한다 — 문장이 아니라 상태 이동
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editNeedsEval, next, wantsPause } from '../src/decide';
import { activeTask, type Judge, type Move, type Outcome, type SessionState, type Verdict } from '../src/state';
import { lines } from '../src/lines';
import { BRIEFING, fresh, j, MIN, T0 } from './fixture';

const L = lines('ko');

type Step =
  | { say: Move; text?: string; judge?: Partial<Judge>; at?: number }
  | { pause: true; at?: number }
  | { edit: number; after: string; verdict: Verdict | null; at?: number };

function run(s: SessionState, steps: Step[]): Outcome {
  let o: Outcome = { state: s, say: null, agentAction: 'none' };
  for (const st of steps) {
    const now = T0 + (st.at ?? 1) * MIN;
    if ('say' in st) o = next(o.state, j(st.say, st.judge), { kind: 'say', text: st.text ?? '네.', now });
    else if ('pause' in st) o = next(o.state, null, { kind: 'pause', now });
    else o = next(o.state, null, { kind: 'edit', paragraph: st.edit, after: st.after, verdict: st.verdict, now });
  }
  return o;
}

const task = (s: SessionState, id: string) => s.tasks.find((t) => t.id === id)!;
const statuses = (s: SessionState) => s.tasks.map((t) => t.status).join(',');

// 목업 M1 끝 상태: 과제 1 시작, 모델이 '협업' 열린 질문(A5.1)을 막 했다
const BRIEFED: Step[] = [
  { say: 'CONTINUER' }, { pause: true }, { say: 'CONTINUER', text: '음.' },
  { say: 'ACCEPT', text: '네 좋아요.', judge: { opens: 'A5.1', reply: "네. '협업' 얘기예요. 동아리에서 같이 해낸 일이 있었어요?" } },
];
const inTask1 = () => run(fresh(), BRIEFED).state;

// 과제 1 끝 → 과제 2 시작
const inTask2 = () =>
  run(inTask1(), [
    { edit: 2, after: '고침', verdict: { better: true, reason: '행동과 결과가 보여요.' } },
    { pause: true }, { say: 'ACCEPT' },
  ]).state;

// 과제 1·2 끝 → 과제 3 시작
const inTask3 = (at = 2) =>
  run(inTask2(), [
    { say: 'EXEMPLAR_REQ', judge: { opens: 'P1.4', exemplar: '물류 지연을 줄이고 싶어 지원합니다.' } },
    { edit: 1, after: '저는... 물류 지연을 줄이고 싶어 지원합니다.', verdict: null },
    { pause: true }, { say: 'ACCEPT', at, judge: { opens: 'A5.1', reply: '3문단 "열정을 가지고" 자리에 뭐가 들어가면 좋을까요?' } },
  ]).state;

interface Row { id: string; given: () => SessionState; steps: Step[]; expect: (o: Outcome) => void }

const TABLE: Row[] = [
  // M1 시작 + 브리핑
  { id: 'M1-2 브리핑 중 "네" = 맞장구 → 다음 파트, 과제 그대로', given: fresh, steps: [{ say: 'CONTINUER' }],
    expect: ({ state, say }) => {
      assert.equal(say, BRIEFING[0]); assert.equal(state.stage, 'briefing');
      assert.equal(state.open?.part, 1); assert.equal(statuses(state), 'pending,pending,pending');
    } },
  { id: 'M1-3 쉼 → 다음 파트 (학생 발화를 기다리지 않음)', given: fresh, steps: [{ say: 'CONTINUER' }, { pause: true }],
    expect: ({ state, say }) => { assert.equal(say, BRIEFING[1]); assert.equal(state.open?.part, 2); } },
  { id: 'M1-6 마지막 파트는 과제 1 시작 제안으로 끝난다', given: fresh, steps: BRIEFED.slice(0, 3),
    expect: ({ state, say }) => {
      assert.ok(say?.startsWith(BRIEFING[2]!)); assert.ok(say?.includes('2문단에 협업 경험 넣기'));
      assert.deepEqual([state.open?.effect, state.open?.taskId], ['startTask', 't1']);
    } },
  { id: 'M1-7 ACCEPT → T1 active, 튜터가 바로 과제의 첫 질문을 한다 (학생이 먼저 말할 필요 없음)', given: fresh, steps: BRIEFED,
    expect: ({ state, say }) => {
      assert.equal(say, `${L.startAck} ${task(state, 't1').opener}`);
      assert.equal(statuses(state), 'active,pending,pending'); assert.equal(state.stage, 'content');
      assert.equal(state.open?.pattern, 'A5.1'); assert.equal(state.topic.keyword, '협업');
    } },
  { id: 'A3.1 브리핑 중 "그만" → 바로 과제 1 제안', given: fresh, steps: [{ say: 'ABORT' }],
    expect: ({ state }) => assert.equal(state.open?.effect, 'startTask') },

  // M2 경험 묻고 듣기
  { id: 'M2-9·11·13 답이 원문 그대로 experience에 이어 붙는다', given: inTask1,
    steps: [{ say: 'ANSWER', text: '축제 때 부스를 했는데요,' }, { say: 'ANSWER', text: '예산표를 공유 시트로 만들었어요.' },
      { say: 'ANSWER', text: '예산을 안 넘겼어요. 그게 다예요.', judge: { opens: 'A5.0', reply: '또 있어요?' } }],
    expect: ({ state }) => {
      assert.deepEqual(task(state, 't1').experience, ['축제 때 부스를 했는데요,', '예산표를 공유 시트로 만들었어요.', '예산을 안 넘겼어요. 그게 다예요.']);
      assert.equal(state.open?.pattern, 'A5.0');
    } },
  { id: 'M2-11 학생이 이어 말하는 중의 CONTINUER 판정도 답으로 모은다 (골드 실측 오판 보정)', given: inTask1,
    steps: [{ say: 'ANSWER', text: '부스를 했는데요,' }, { say: 'CONTINUER', text: '공유 시트를 만들었어요.' }],
    expect: ({ state }) => assert.deepEqual(task(state, 't1').experience, ['부스를 했는데요,', '공유 시트를 만들었어요.']) },
  { id: 'M2-15 "또 있어요?"에 대한 답은 경험에 붙이지 않는다', given: inTask1,
    steps: [{ say: 'ANSWER', text: '부스', judge: { opens: 'A5.0', reply: '또 있어요?' } }, { say: 'ANSWER', text: '아니요 그거요.' }],
    expect: ({ state }) => assert.deepEqual(task(state, 't1').experience, ['부스']) },

  // M3 해석 제시 + 결론 확인
  { id: 'M3-17 A2.6 ACCEPT → 결론 기록, 아직 done 아님', given: inTask1,
    steps: [{ say: 'ANSWER', judge: { opens: 'A2.6', reply: '갈등을 데이터로 푼 경험이네요. 2문단에 넣는 거, 맞아요?' } }, { say: 'ACCEPT' }],
    expect: ({ state }) => {
      assert.equal(task(state, 't1').status, 'active');
      assert.equal(task(state, 't1').evidence, '갈등을 데이터로 푼 경험이네요. 2문단에 넣는 거, 맞아요?');
    } },
  { id: 'M3b-17 해석 거절 → 과제 유지, 다시 A2.6', given: inTask1,
    steps: [{ say: 'ANSWER', judge: { opens: 'A2.6' } }, { say: 'REJECT', judge: { opens: 'A2.6', reply: '예산을 지킨 게 핵심이군요. 그쪽으로 넣는 거죠?' } }],
    expect: ({ state }) => {
      assert.equal(task(state, 't1').status, 'active'); assert.equal(task(state, 't1').evidence, undefined);
      assert.equal(state.open?.pattern, 'A2.6');
    } },

  // M4 수정 → 재평가 → 완료
  { id: 'M4-19 재평가 false → active 유지, reason이 힌트', given: inTask1,
    steps: [{ edit: 2, after: '협업했습니다.', verdict: { better: false, reason: '공유 시트를 만든 것도 넣어 볼래요?' } }],
    expect: ({ state, say }) => {
      assert.equal(task(state, 't1').status, 'active'); assert.equal(task(state, 't1').edits, 1);
      assert.equal(say, '공유 시트를 만든 것도 넣어 볼래요?'); assert.equal(state.open?.pattern, 'P1');
    } },
  { id: 'M4-22 재평가 true → done, 수정 2회, 다음 질문 없이 쉼', given: inTask1,
    steps: [{ edit: 2, after: 'a', verdict: { better: false, reason: '힌트' } }, { say: 'ACCEPT', text: '아 네.' },
      { edit: 2, after: 'b', verdict: { better: true, reason: '직접 한 일과 결과가 둘 다 보여요.' } }],
    expect: ({ state, say }) => {
      assert.equal(task(state, 't1').status, 'done'); assert.equal(task(state, 't1').edits, 2);
      assert.equal(say, `${L.better} 직접 한 일과 결과가 둘 다 보여요.`);
      assert.equal(state.open, null); assert.ok(wantsPause(state));
    } },
  { id: 'M4-24 done 뒤 쉼 → 과제 2 제안', given: inTask1,
    steps: [{ edit: 2, after: 'b', verdict: { better: true, reason: 'r' } }, { pause: true }],
    expect: ({ state, say }) => {
      assert.equal(say, L.proposeTask('1문단에 지원 이유 넣기')); assert.equal(state.open?.taskId, 't2');
    } },
  { id: '대상이 아닌 문단 편집은 판정하지 않는다', given: inTask1, steps: [{ edit: 3, after: 'x', verdict: null }],
    expect: ({ state, say }) => { assert.equal(say, null); assert.equal(task(state, 't1').edits, 0); } },

  // M5 시범 문장 수락 — 재평가 없이 완료
  { id: 'M5-28 시범 문장 그대로 → done(fromExemplar), 재평가 없음', given: inTask2,
    steps: [{ say: 'EXEMPLAR_REQ', judge: { opens: 'P1.4', exemplar: '"물류 현장의 지연을 데이터로 줄이고 싶어 지원합니다."' } },
      { say: 'ACCEPT', text: '이거 그대로 쓸게요.' },
      { edit: 1, after: '저는 데이터로 문제를 해결합니다. 물류 현장의 지연을 데이터로 줄이고 싶어 지원합니다.', verdict: null }],
    expect: ({ state, say }) => {
      const t = task(state, 't2');
      assert.equal(t.status, 'done'); assert.equal(t.fromExemplar, true); assert.equal(say, L.exemplarDone);
    } },
  { id: 'M5 시범 문장을 고쳐 넣으면 재평가로 간다', given: inTask2,
    steps: [{ say: 'EXEMPLAR_REQ', judge: { opens: 'P1.4', exemplar: '물류 지연을 줄이고 싶어 지원합니다.' } }],
    expect: ({ state }) => {
      assert.equal(editNeedsEval(state, 1, '물류 지연을 줄이고 싶어 지원합니다.'), false);
      assert.equal(editNeedsEval(state, 1, '물류 지연을 꼭 줄이고 싶습니다.'), true);
      assert.equal(editNeedsEval(state, 2, '아무거나'), false);
    } },

  // M6 제안의 갈래
  { id: 'M6-31 내용 제안 거절 → 과제 그대로, 재설득 없음', given: () => inTask3(),
    steps: [{ say: 'ANSWER', judge: { opens: 'P1', reply: 'R로 뭘 분석했는지로 바꾸면 어때요?' } }, { say: 'REJECT', text: '음… 근데 그건 수업 과제라 좀…' }],
    expect: ({ state }) => { assert.equal(task(state, 't3').status, 'active'); assert.equal(state.open, null); } },
  { id: 'P1.1 과제 시작 제안 거절 → 그 과제 skipped + 다음 후보', given: inTask1,
    steps: [{ edit: 2, after: 'b', verdict: { better: true, reason: 'r' } }, { pause: true }, { say: 'REJECT', text: '그건 별로요.' }],
    expect: ({ state }) => {
      assert.equal(task(state, 't2').status, 'skipped'); assert.equal(state.open?.taskId, 't3');
    } },
  { id: 'M6-30b·32b 이유 질문 → 답 → "알겠어요"는 질문만 닫고 제안은 열린 채', given: () => inTask3(),
    steps: [{ say: 'ANSWER', judge: { opens: 'P1', reply: '바꾸면 어때요?' } }, { say: 'USER_INQUIRY', text: '왜요?' }, { say: 'CLOSER', text: '아 네 알겠어요.' }],
    expect: ({ state, agentAction }) => {
      assert.equal(state.open?.firstPair, '바꾸면 어때요?'); assert.equal(state.repaired, false); assert.equal(agentAction, 'B4.4');
    } },
  { id: 'M6-35 P1.5 사실 질문 뒤 "네"(ANSWER)는 제안 수락이 아니다', given: () => inTask3(),
    steps: [{ say: 'ANSWER', judge: { opens: 'A5.0', reply: 'R로 데이터를 직접 다뤄 봤어요?' } }, { say: 'ANSWER', text: '네.' }],
    expect: ({ state }) => { assert.equal(statuses(state), 'done,done,active'); assert.equal(task(state, 't3').evidence, undefined); } },

  // M7 학생이 여는 수리 + B4.4
  { id: 'M7 반복·바꿔 말하기·예시는 last에서 그대로, 고마워요는 제안을 닫지 않음', given: () => inTask3(),
    steps: [
      { say: 'ANSWER', judge: { opens: 'P1', reply: '끝 문장을 입사 후 할 일로 바꾸면 좋겠어요.', paraphrase: '처음 맡고 싶은 일을 쓰자는 뜻이에요.', example: '"배송 지연 분석부터 맡고 싶습니다" 같은 거요.' } },
      { say: 'REPEAT_REQ', text: '네?' },
    ],
    expect: ({ state, say }) => { assert.equal(say, '끝 문장을 입사 후 할 일로 바꾸면 좋겠어요.'); assert.equal(state.repaired, true); } },
  { id: 'M7-41·43 바꿔 말하기 → 예시 (둘 다 원래 말 기준)', given: () => inTask3(),
    steps: [
      { say: 'ANSWER', judge: { opens: 'P1', reply: 'P', paraphrase: 'PP', example: 'EX' } },
      { say: 'REPEAT_REQ' }, { say: 'PARAPHRASE_REQ' },
    ],
    expect: ({ state, say }) => { assert.equal(say, 'PP'); assert.equal(state.last.example, 'EX'); assert.equal(state.last.played, 'P'); } },
  { id: 'M7-44 수리 뒤 "감사합니다" → B4.4, 37번 제안 유지', given: () => inTask3(),
    steps: [
      { say: 'ANSWER', judge: { opens: 'P1', reply: 'P', paraphrase: 'PP', example: 'EX' } },
      { say: 'PARAPHRASE_REQ' }, { say: 'EXAMPLE_REQ' }, { say: 'CLOSER', text: '아 감사합니다.' },
    ],
    expect: ({ state, agentAction }) => {
      assert.equal(agentAction, 'B4.4'); assert.equal(state.open?.firstPair, 'P'); assert.equal(statuses(state), 'done,done,active');
    } },
  { id: '예시가 비어 있으면 기본 응답', given: () => inTask3(),
    steps: [{ say: 'ANSWER', judge: { opens: 'P1', reply: 'P' } }, { say: 'EXAMPLE_REQ' }],
    expect: ({ say }) => assert.equal(say, L.noExample) },

  // M8 UNCLEAR 1/2/3
  { id: 'M8-49 UNCLEAR 1회 → 다시 말해 달라(팁 없음)', given: () => inTask3(), steps: [{ say: 'UNCLEAR' }],
    expect: ({ state, say }) => { assert.equal(say, L.askAgain); assert.equal(state.unclearStreak, 1); } },
  { id: 'M8-51 UNCLEAR 2회 → 모델이 예시를 붙여 다시 묻는다', given: () => inTask3(), steps: [{ say: 'UNCLEAR' }, { say: 'UNCLEAR' }],
    expect: ({ state, agentAction }) => { assert.equal(agentAction, 'B1.2.1'); assert.equal(state.unclearStreak, 2); } },
  { id: 'M8-53 UNCLEAR 3회 → 방향을 바꾼다, 횟수 0', given: () => inTask3(), steps: [{ say: 'UNCLEAR' }, { say: 'UNCLEAR' }, { say: 'UNCLEAR' }],
    expect: ({ state, say }) => { assert.equal(say, L.giveUpUnclear); assert.equal(state.unclearStreak, 0); } },
  { id: 'M8 정상 답 뒤 unclearStreak 0', given: () => inTask3(), steps: [{ say: 'UNCLEAR' }, { say: 'ANSWER' }],
    expect: ({ state }) => assert.equal(state.unclearStreak, 0) },

  // M9 과제 중 학생 질문 → 원래 시퀀스로 복귀
  { id: 'M9-55·57 학생 질문 동안 A5.1 보존, "아 네"는 질문만 닫음', given: () => inTask3(),
    steps: [{ say: 'USER_INQUIRY', text: '글자 수 제한 있어요?', judge: { opens: 'A5.1', reply: '공고에는 제한이 없어요.' } }, { say: 'CLOSER', text: '아 네.' }],
    expect: ({ state }) => {
      assert.equal(state.open?.pattern, 'A5.1'); assert.equal(state.open?.firstPair, task(state, 't3').opener);
    } },

  // M10 그만두기 · 시간 초과
  { id: 'M10-59 ABORT → T3 skipped, 이유 기록, 설득 없음', given: () => inTask3(), steps: [{ say: 'ABORT', text: '3문단은 그냥 됐어요.' }],
    expect: ({ state, say }) => {
      assert.equal(task(state, 't3').status, 'skipped'); assert.equal(task(state, 't3').evidence, '3문단은 그냥 됐어요.');
      assert.equal(say, L.abortTask); assert.ok(wantsPause(state));
    } },
  // 시간 규칙 (사용자 결정 2026-11-03): 과제 1에 집중 · 2·3은 시간이 될 때만 · 20분 전에 반드시 마무리
  { id: '세션 17분(남은 3분) → 제안 없이 마무리 시작, 하던 과제는 timeout', given: () => inTask3(11), steps: [{ say: 'ANSWER', at: 17 }],
    expect: ({ state, say }) => {
      assert.equal(state.stage, 'closing'); assert.ok(say?.startsWith(L.timeUp));
      assert.equal(task(state, 't3').status, 'timeout');
    } },
  { id: '학생이 말이 없어도 — 남은 3분의 쉼 이벤트로 마무리 시작', given: inTask1, steps: [{ pause: true, at: 17 }],
    expect: ({ state, say }) => { assert.equal(state.stage, 'closing'); assert.ok(say?.startsWith(L.timeUp)); assert.equal(task(state, 't1').status, 'timeout'); } },
  { id: '과제 1이 오래 걸려도(9분) 다음으로 넘기자고 하지 않는다', given: inTask1, steps: [{ say: 'ANSWER', at: 9 }],
    expect: ({ state, say }) => { assert.equal(say, '(모델 응답:ANSWER)'); assert.equal(activeTask(state)?.id, 't1'); assert.equal(state.open?.effect, undefined); } },
  { id: '과제를 끝냈을 때 남은 시간이 7분보다 적으면 다음 과제 대신 마무리', given: inTask1,
    steps: [{ edit: 2, after: '고침', verdict: { better: true, reason: '행동과 결과가 보여요.' }, at: 14 }, { pause: true, at: 14 }],
    expect: ({ state }) => {
      assert.equal(task(state, 't1').status, 'done'); assert.equal(task(state, 't2').status, 'pending');
      assert.equal(state.stage, 'closing');
    } },
  { id: '과제를 끝냈을 때 시간이 충분하면(남은 7분 이상) 과제 2를 제안', given: inTask1,
    steps: [{ edit: 2, after: '고침', verdict: { better: true, reason: '행동과 결과가 보여요.' }, at: 12 }, { pause: true, at: 12 }],
    expect: ({ state }) => { assert.equal(state.open?.effect, 'startTask'); assert.equal(state.open?.taskId, 't2'); } },

  // M11 마무리
  { id: 'M11-61·62 PRE_CLOSING → 작별 전에 요약(A3)부터, 과제 표 그대로', given: () => inTask3(), steps: [{ say: 'PRE_CLOSING', text: '오늘은 여기까지 할게요.' }],
    expect: ({ state, say }) => {
      assert.equal(state.stage, 'closing'); assert.equal(state.open?.pattern, 'A3');
      assert.equal(say, `${L.closingLead} 먼저, 2문단에 협업 경험 넣기 — 끝냈어요.`);
    } },
  { id: 'M11-64 마지막 파트 = 다음에 볼 것 + 성공 확인(C4)', given: () => inTask3(),
    steps: [{ say: 'PRE_CLOSING' }, { pause: true }, { pause: true }],
    expect: ({ state, say }) => {
      assert.equal(say, `마지막으로, 3문단 표현 다듬기 — 다음에 이어서 봐요. ${L.successCheck}`); assert.equal(state.open?.pattern, 'C4');
    } },
  { id: 'M11-65 성공 확인 긍정 → 끝', given: () => inTask3(),
    steps: [{ say: 'PRE_CLOSING' }, { pause: true }, { pause: true }, { say: 'ANSWER', judge: { positive: true } }],
    expect: ({ state }) => { assert.equal(state.stage, 'ended'); assert.equal(state.helped, true); } },
  { id: 'M11-65\' 성공 확인 부정 → 한 번 더 듣고 끝', given: () => inTask3(),
    steps: [{ say: 'PRE_CLOSING' }, { pause: true }, { pause: true }, { say: 'ANSWER', text: '잘 모르겠어요.', judge: { opens: 'A5.1' } }],
    expect: ({ state }) => {
      assert.equal(state.stage, 'closing'); assert.equal(state.helped, false);
      assert.equal(next(state, j('ANSWER'), { kind: 'say', text: '2문단이요', now: T0 }).state.stage, 'ended');
    } },
  { id: '과제 셋 다 끝나면 쉼 뒤 마무리', given: () => inTask3(),
    steps: [{ edit: 3, after: 'x', verdict: { better: true, reason: 'r' } }, { pause: true }],
    expect: ({ state }) => assert.equal(state.stage, 'closing') },
  { id: '끝난 세션은 움직이지 않는다', given: () => inTask3(),
    steps: [{ say: 'PRE_CLOSING' }, { say: 'ABORT' }, { say: 'ANSWER' }],
    expect: ({ state, say }) => { assert.equal(state.stage, 'ended'); assert.equal(say, null); } },

  // M12 끼어들기 뒤 반복 — 재생된 부분만 (텍스트판: last.played 그대로)
  { id: 'M12-70 반복 요청은 last.played 그대로', given: () => ({ ...inTask3(), last: { played: '먼저, 2문단은 상황은 좋은데', paraphrase: '', example: '' } }),
    steps: [{ say: 'REPEAT_REQ', text: '뭐라고 하셨죠 아까?' }],
    expect: ({ say }) => assert.equal(say, '먼저, 2문단은 상황은 좋은데') },
];

for (const row of TABLE) {
  test(row.id, () => {
    const given = row.given();
    const frozen = structuredClone(given);
    row.expect(run(given, row.steps));
    assert.deepEqual(given, frozen, 'next()가 입력 상태를 바꿨다');
  });
}

test('과제 턴 수는 과제가 active일 때만 센다', () => {
  const s = run(inTask1(), [{ say: 'ANSWER' }, { say: 'CONTINUER' }]).state;
  assert.equal(task(s, 't1').turns, 2);
});

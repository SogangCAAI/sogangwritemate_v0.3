// 세션 상태와 판정 타입 — 근거: NCF 문서 5절, v3 제안서 2-1절
// 서버는 상태를 들고 있지 않는다. 클라이언트가 매 턴 이 객체를 보내고, 새 객체를 돌려받는다.

import type { RubricAxisKey } from './rubric';

export type Lang = 'ko' | 'en';

// 첫 진단의 평가(채점 루브릭)는 src/rubric.ts — 턴마다 오가는 상태에는 넣지 않는다 (화면만 들고 있다)

// 'ended'는 문서에 없다 — 성공 확인(C4.6)이 끝났다는 표시가 따로 필요해서 더했다
export type Stage = 'opening' | 'briefing' | 'content' | 'form' | 'structure' | 'closing' | 'ended';

// 과제 진행 중인 단계인가 (단계 이름 = 과제 종류)
export const TASK_STAGES: readonly Stage[] = ['content', 'form', 'structure'];
export const inTaskStage = (stage: Stage): boolean => TASK_STAGES.includes(stage);

export const MOVES = [
  'ANSWER', 'CONTINUER', 'ACCEPT', 'REJECT', 'EXEMPLAR_REQ',
  'REPEAT_REQ', 'PARAPHRASE_REQ', 'EXAMPLE_REQ', 'USER_INQUIRY',
  'CLOSER', 'ABORT', 'PRE_CLOSING', 'UNCLEAR',
  'CONFUSED', 'OFF_GOAL', // v2 caJudge에서 옮김 — 막힘 사다리(ConfusionHandler) · 다른 요청(OffGoalHandler)
] as const;
export type Move = (typeof MOVES)[number];

// 힌트 칩이 바로 보내는 라벨 — 이때는 판정 호출을 하지 않는다
export const CHIP_MOVES = ['REPEAT_REQ', 'PARAPHRASE_REQ', 'EXAMPLE_REQ', 'ABORT'] as const satisfies readonly Move[];

// 튜터가 연 첫째 짝의 종류 (= previous_node)
//   P1.4 = 쓰는 법 보여 주기(비계: 틀 + 다른 사람의 예 + 학생 재료) — 2026-11-16부터 문장을 써 주지 않는다
//   A4   = 완료 직전 확인 질문 ("이 문단이 뭘 주장하고 뭐가 받쳐 주죠?") — 항목을 다 채워도 학생이 설명해야 끝난다
export const PATTERNS = ['A3', 'A5.1', 'A5.0', 'A5.5', 'A2.6', 'P1', 'P1.4', 'A4', 'C4'] as const;
export type Pattern = (typeof PATTERNS)[number];

// 코드가 뜻을 정해 둔 제안 — 수락하면 next()가 상태를 옮긴다
export type Effect = 'startTask' | 'moveOn' | 'close';

// OFF_GOAL일 때 학생이 원하는 것이 지금 과제보다 중요한가 (v2 student_agenda_importance). OFF_GOAL이 아니면 none
export const IMPORTANCES = ['higher', 'equal', 'lower', 'none'] as const;
export type Importance = (typeof IMPORTANCES)[number];

// 끼어들기 집계 — 클라이언트가 세션 누적으로 매 턴 보낸다 (v2 CASummary)
//   botTurns = 소리가 실제로 시작된 튜터 줄 · bargeIns = 학생이 말을 덮어 끊은 줄
export interface CaCounts {
  readonly bargeIns: number;
  readonly botTurns: number;
}

export interface Open {
  readonly pattern: Pattern;
  readonly firstPair: string;
  readonly parts?: readonly string[]; // A3 전용: 브리핑·마무리 파트
  readonly part?: number;
  readonly effect?: Effect;
  readonly taskId?: string;
  readonly criteria?: readonly string[]; // A2.6 전용: 결론이 확인되면 과제의 완료 항목이 될 문장들 (모델이 해석과 함께 낸다)
}

export type TaskStatus = 'pending' | 'active' | 'done' | 'skipped' | 'timeout';
// content = 학생 경험을 새로 꺼내 넣기 · form = 있는 글을 고쳐 쓰기 · structure = 문장 이동·문단 추가·삭제 (문단 여럿, 새 내용을 요구하지 않는다, 2026-11-16)
export type TaskKind = 'content' | 'form' | 'structure';

// 과제 완료 항목 — 고친 문단 하나를 보고 "보인다 / 안 보인다"로 판정할 수 있는 관찰 항목 (2026-11-16, 체크리스트화)
//   check: 'llm' = 재평가(Haiku)가 본다 · 'noCliche' = 코드가 본다 (상투 표현 사전, checks.ts)
//   source: 'diagnosis' = 첫 진단의 초안 · 'conclusion' = A2.6 결론 확인에서 합의한 것 (초안을 대신한다) · 'code' = 코드가 넣은 것
export type CriterionCheck = 'llm' | 'noCliche';
export type CriterionSource = 'diagnosis' | 'conclusion' | 'code';

export interface Criterion {
  readonly id: string; // 과제 안에서 고유 (c1, c2, …)
  readonly text: string; // 학생에게 보일 한 문장 ("2문단에 학생이 직접 한 행동이 들어간다")
  readonly check: CriterionCheck;
  readonly source: CriterionSource;
  readonly met: boolean; // 마지막 재평가에서 충족했나
  readonly evidence?: string; // 충족으로 본 근거 구절 (재평가가 인용) — 확인 질문 때 모델이 글을 다시 평가하지 않게 보여 준다
  readonly needsNew?: boolean; // 원래 문단에 없던 정보(경험·이유·사실·연결)를 요구하는 항목 — 근거 인용이 원문에 이미 있으면 충족이 아니다
}

export interface Task {
  readonly id: string;
  readonly order: 1 | 2 | 3;
  readonly kind: TaskKind;
  readonly target: { readonly keyword?: string; readonly paragraph: number; readonly paragraphs?: readonly number[] }; // paragraph는 1부터 (주 문단). paragraphs = 이 과제가 손댈 수 있는 문단 전부 (구조 과제: 옮길 곳·지울 곳, 주 문단 포함)
  readonly axis?: RubricAxisKey; // 이 과제가 나온 루브릭 축 — 연결·주장 축은 재평가 때 앞뒤 문단을 함께 본다
  readonly goal: string; // 학생에게 보여 줄 짧은 명사구 ("2문단에 협업 경험 넣기")
  readonly doneWhen: string; // 완료 기준 한 문장 요약 (화면·프롬프트용). 판정은 criteria로 한다
  readonly criteria: readonly Criterion[]; // 완료 항목 — 전부 충족하면 done. 비어 있으면 doneWhen 한 문장으로 판정한다
  readonly opener: string; // 과제를 여는 첫 질문 — 진단이 만들고, 학생이 과제를 수락하면 코드가 그대로 말한다
  readonly status: TaskStatus;
  readonly evidence?: string;
  readonly startedAt?: number;
  readonly endedAt?: number;
  readonly turns: number;
  readonly edits: number;
  readonly experience: readonly string[]; // 학생 답 원문 (A5.1/A5.5)
  // ── 돌지 않기 위한 기억 (2026-11-16) ──
  readonly notes: readonly string[]; // 이미 정해진 것 — 결론 확정 · 학생이 답하지 못한 질문 · 확인 질문에서 맞게 짚은 것. 프롬프트에 "다시 묻지 않는다"로 들어간다
  readonly lastHint?: string; // 직전 재평가 힌트 — 같은 힌트를 되풀이하지 않게 재평가에 넘긴다
  readonly stuckOn?: string; // 직전 재평가에서 못 채운 항목 id 묶음 (같으면 stuckCount가 오른다)
  readonly stuckCount: number; // 같은 항목이 연달아 안 채워진 횟수 — 2: 뼈대 · 3: 다른 재료(이력서·다른 문단)
  readonly check: { readonly asked: number; readonly claimOk: boolean }; // 확인 질문(A4)을 몇 번 했나, 주장은 맞게 짚었나 — 두 번째는 빠진 반쪽만, 세 번째부터는 묻지 않는다
  readonly nudged: boolean; // 시간 초과 제안을 이미 했나
}

export interface Last {
  readonly played: string;
  readonly paraphrase: string;
  readonly example: string;
}

export interface SessionState {
  readonly id: string;
  readonly lang: Lang;
  readonly stage: Stage;
  readonly open: Open | null;
  readonly topic: { readonly keyword?: string; readonly paragraph?: number };
  readonly last: Last;
  readonly repaired: boolean; // 수리·학생 질문 직후 — 이때의 CLOSER는 그 곁가지만 닫는다 (B4.4)
  readonly unclearStreak: number;
  readonly confusedStreak: number; // 학생이 연달아 "모르겠어요"(CONFUSED)라고 한 횟수 — 다른 수가 오면 0 (수리는 제외)
  readonly offGoalCount: number; // 학생이 지금 과제 밖의 것을 하자고 한 횟수 (세션 누적)
  readonly tasks: readonly Task[];
  readonly startedAt: number;
  readonly helped: boolean | null;
  readonly closeOffered: boolean; // 세션 마감 제안을 이미 했나
}

// Haiku 한 번이 내는 것: 판정 + 튜터의 다음 말 + 수리용 콘텐츠
export interface Judge {
  readonly move: Move;
  readonly reply: string;
  readonly paraphrase: string;
  readonly example: string;
  readonly opens: Pattern | 'none';
  readonly positive: boolean; // 성공 확인(C4.6)에 대한 답이 긍정인가
  readonly criteria: readonly string[]; // opens=A2.6일 때 — 결론이 확인되면 과제의 완료 항목이 될 문장 1~3개 (아니면 빈 목록)
  readonly importance: Importance; // OFF_GOAL 전용 — 학생 안건 대 지금 과제
  readonly targetParagraph: number; // OFF_GOAL 전용 — 학생이 집은 문단 (1부터, 없으면 0)
}

// 재평가 결과 — 항목마다 절대 판정 ("고친 문단에 보이나"), 전부 충족이면 done. 원래 문단과의 상대 비교가 아니다
export interface Verdict {
  readonly done: boolean;
  readonly met: readonly string[]; // 충족한 항목 id (criteria가 비어 있으면 done일 때 ['doneWhen'])
  readonly reason: string; // 튜터가 학생에게 그대로 말할 문장 — done이면 칭찬, 아니면 못 채운 항목에 대한 힌트 하나
  readonly evidence?: Readonly<Record<string, string>>; // 충족 항목의 근거 인용 (id → 구절)
}

export type TurnEvent =
  | { kind: 'say'; text: string; now: number }
  | { kind: 'pause'; now: number }
  // verdict가 null이면 재평가하지 않은 편집 (시범 문장 그대로, 또는 대상 밖 문단)
  | { kind: 'edit'; paragraph: number; after: string; verdict: Verdict | null; now: number };

export interface Outcome {
  readonly state: SessionState;
  readonly say: string | null;
  readonly agentAction: string; // turns.agent_action 기록용
}

export const SESSION_MS = 20 * 60_000;
// 시간 규칙 (사용자 결정 2026-11-03): 과제 1에 집중하고, 시간이 남을 때만 과제 2·3, 20분 전에 반드시 마무리
export const CLOSE_AT_LEFT_MS = 3 * 60_000; // 남은 시간이 이만큼이면 마무리를 시작한다 (제안이 아니다)
export const NEXT_TASK_MIN_LEFT_MS = 7 * 60_000; // 과제를 끝냈을 때 이만큼 남아야 다음 과제를 제안한다

export function activeTask(s: SessionState): Task | undefined {
  return s.tasks.find((t) => t.status === 'active');
}

// 과제 진행도 — 충족한 항목 수 / 전체 (항목이 없으면 0/0)
export function criteriaProgress(t: Task): { met: number; total: number } {
  return { met: t.criteria.filter((c) => c.met).length, total: t.criteria.length };
}

export function emptyJudge(move: Move): Judge {
  return { move, reply: '', paraphrase: '', example: '', opens: 'none', positive: false, importance: 'none', targetParagraph: 0, criteria: [] };
}

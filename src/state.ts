// 세션 상태와 판정 타입 — 근거: NCF 문서 5절, v3 제안서 2-1절
// 서버는 상태를 들고 있지 않는다. 클라이언트가 매 턴 이 객체를 보내고, 새 객체를 돌려받는다.

export type Lang = 'ko' | 'en';

// 첫 진단의 평가(채점 루브릭)는 src/rubric.ts — 턴마다 오가는 상태에는 넣지 않는다 (화면만 들고 있다)

// 'ended'는 문서에 없다 — 성공 확인(C4.6)이 끝났다는 표시가 따로 필요해서 더했다
export type Stage = 'opening' | 'briefing' | 'content' | 'form' | 'closing' | 'ended';

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
export const PATTERNS = ['A3', 'A5.1', 'A5.0', 'A5.5', 'A2.6', 'P1', 'P1.4', 'C4'] as const;
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
}

export type TaskStatus = 'pending' | 'active' | 'done' | 'skipped' | 'timeout';
export type TaskKind = 'content' | 'form';

export interface Task {
  readonly id: string;
  readonly order: 1 | 2 | 3;
  readonly kind: TaskKind;
  readonly target: { readonly keyword?: string; readonly paragraph: number }; // paragraph는 1부터
  readonly goal: string; // 학생에게 보여 줄 짧은 명사구 ("2문단에 협업 경험 넣기")
  readonly doneWhen: string;
  readonly opener: string; // 과제를 여는 첫 질문 — 진단이 만들고, 학생이 과제를 수락하면 코드가 그대로 말한다
  readonly status: TaskStatus;
  readonly evidence?: string;
  readonly fromExemplar: boolean;
  readonly startedAt?: number;
  readonly endedAt?: number;
  readonly turns: number;
  readonly edits: number;
  readonly experience: readonly string[]; // 학생 답 원문 (A5.1/A5.5)
  readonly exemplar?: string; // 튜터가 준 시범 문장 — 그대로 들어가면 재평가 없이 done
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
  readonly exemplar: string;
  readonly positive: boolean; // 성공 확인(C4.6)에 대한 답이 긍정인가
  readonly importance: Importance; // OFF_GOAL 전용 — 학생 안건 대 지금 과제
  readonly targetParagraph: number; // OFF_GOAL 전용 — 학생이 집은 문단 (1부터, 없으면 0)
}

export interface Verdict {
  readonly better: boolean;
  readonly reason: string;
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

export function emptyJudge(move: Move): Judge {
  return { move, reply: '', paraphrase: '', example: '', opens: 'none', exemplar: '', positive: false, importance: 'none', targetParagraph: 0 };
}

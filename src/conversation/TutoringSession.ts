// 튜터링 세션 — 대화 흐름의 입구 (State 패턴의 Context). 근거: NCF 문서 2·5절, 대본 목업 M1–M12
// 받은 상태(JSON)로 만들고, 학생의 한 수마다 새 상태를 담은 Outcome을 돌려준다. 받은 상태는 바꾸지 않는다.
// LLM·시계·네트워크 없음 (시각은 인자로 받는다).
//
// ── 대화의 차례 (자세한 그림: FLOW.md) ──────────────────────────────────────────────
//  국면                파일                          튜터가 연 짝         나가는 길
//  BriefingPhase       phases/BriefingPhase.ts       A3 브리핑 파트       쉼·맞장구 → 다음 파트 → (마지막) 과제 1 제안
//  TaskProposalPhase   phases/TaskProposalPhase.ts   P1 (effect)          수락 → 과제 시작 A5.1 / timeout · 거절 → 건너뜀·계속
//  ExperiencePhase     phases/ExperiencePhase.ts     A5.1 · A5.5 · A5.0   답 → 경험 모음(A5.5) → 모델이 A2.6을 열면 결론 확인
//  ConclusionPhase     phases/ConclusionPhase.ts     A2.6                 수락 → evidence 기록 → 문단 고치기 / 거절 → 다시 A2.6
//  EditingPhase        phases/EditingPhase.ts        없음 · P1 · P1.4     편집 → 재평가 better·시범 그대로 → done / 아니면 힌트
//  IdlePhase           phases/IdlePhase.ts           없음 (과제 사이)      쉼 → 다음 과제 제안 (없으면 마무리)
//  ClosingPhase        phases/ClosingPhase.ts        A3 요약 → C4         파트 → 성공 확인 → 작별
//  EndedPhase          phases/EndedPhase.ts          —                    움직이지 않음
//
//  어느 국면에서든 먼저 (국면에 맡기지 않는 수):
//   REPEAT/PARAPHRASE/EXAMPLE_REQ → RepairHandler.replay (B2, last에서 코드가 답함)
//   UNCLEAR                       → RepairHandler.unclear (B1.2, 1·2·3회)
//   CONFUSED                      → ConfusionHandler (막힘 1회 단서 · 2회 시범 · 3회 과제 미루고 다음, v2 caJudge)
//   OFF_GOAL                      → OffGoalHandler (첫 요청 겹쳐 받기 · 더 급하거나 거듭 청하면 그 과제로, v2 sessionGoal)
//   PRE_CLOSING                   → Agenda.startClosing (요약부터)
//   남은 시간 3분                  → Agenda.closeForTime (제안 아님 — 20분 전에 마무리; 쉼·답 뒤에 확인)
//   과제를 끝냈을 때 남은 시간 < 7분 → 다음 과제 대신 마무리 (과제 2·3은 시간이 될 때만)
// ────────────────────────────────────────────────────────────────────────────────
import type { Judge, Lang, Outcome, SessionState, Task, TurnEvent } from '../state';
import { activeTask } from '../state';
import { lines } from '../lines';
import { Agenda } from './Agenda';
import { ConfusionHandler } from './ConfusionHandler';
import { OffGoalHandler } from './OffGoalHandler';
import type { Phase } from './Phase';
import { PhaseFactory } from './PhaseFactory';
import { EditingPhase, type EditEvent } from './phases/EditingPhase';
import { RepairHandler } from './RepairHandler';
import { Say } from './Say';
import { Tasks } from './Tasks';

export interface SessionSeed { id: string; lang: Lang; tasks: Task[]; briefing: string[]; now: number }

export class TutoringSession {
  private constructor(private readonly state: SessionState) {}

  static from(state: SessionState): TutoringSession {
    return new TutoringSession(state);
  }

  // 첫 상태 — 인사(C1)를 말한 채로, 브리핑 파트(A3)가 열려 있다. 마지막 파트 끝에 과제 1 제안이 붙는다
  static start(a: SessionSeed): TutoringSession {
    const L = lines(a.lang);
    const [b1 = '', b2 = '', b3 = ''] = a.briefing;
    const parts = [L.greeting, b1, b2, `${b3} ${L.firstTask(a.tasks[0]?.goal ?? '')}`.trim()];
    return new TutoringSession({
      id: a.id, lang: a.lang, stage: 'opening',
      open: { pattern: 'A3', firstPair: L.greeting, parts, part: 0 },
      topic: {}, last: { played: L.greeting, paraphrase: '', example: '' },
      repaired: false, unclearStreak: 0, confusedStreak: 0, offGoalCount: 0, tasks: a.tasks, startedAt: a.now, helped: null, closeOffered: false,
    });
  }

  toState(): SessionState {
    return this.state;
  }

  get phase(): Phase {
    return PhaseFactory.for(this.state);
  }

  // 클라이언트가 쉼(맞장구로 보는 침묵) 이벤트를 보내야 하는 상태인가
  get wantsPause(): boolean {
    return this.phase.awaitsPause;
  }

  // 학생이 대상 문단을 고쳤을 때 재평가(Haiku)를 불러야 하나 — 시범 문장을 그대로 넣었으면 부르지 않는다
  editNeedsEval(paragraph: number, after: string): boolean {
    const t = activeTask(this.state);
    return !!t && t.target.paragraph === paragraph && !Tasks.exemplarUsed(t, after);
  }

  // 이벤트 하나 → 결과 하나 (decide.next()가 이것을 부른다)
  handle(judge: Judge | null, ev: TurnEvent): Outcome {
    if (this.phase.isOver) return Say.nothing(this.state);
    if (ev.kind === 'pause') return this.onPause(ev.now);
    if (ev.kind === 'edit') return this.onEdit(ev);
    if (!judge) throw new Error('next(): 학생 발화에는 판정이 필요합니다');
    return this.onSay(judge, ev.text, ev.now);
  }

  // 학생의 말 — 국면과 상관없는 수를 먼저, 나머지는 지금 국면에 맡긴다
  onSay(j: Judge, text: string, now: number): Outcome {
    if (this.phase.isOver) return Say.nothing(this.state);
    const s = Tasks.countTurn(this.state);
    switch (j.move) {
      case 'REPEAT_REQ':
      case 'PARAPHRASE_REQ':
      case 'EXAMPLE_REQ': return new RepairHandler(s).replay(j.move);
      case 'UNCLEAR': return new RepairHandler(s).unclear(j);
      case 'CONFUSED': return new ConfusionHandler(s).onConfused(j, text, now);
      case 'OFF_GOAL': return new OffGoalHandler(s).onOffGoal(j, now);
    }
    const s0 = { ...s, confusedStreak: 0 }; // 막힘이 아닌 수 — 막힘 횟수는 0 (수리·못 알아들음은 세지 않고 건너뛴다)
    switch (j.move) {
      case 'PRE_CLOSING': return Agenda.startClosing(s0, true);
      case 'ABORT': return PhaseFactory.for(s0).onAbort(text, now);
    }
    const phase = PhaseFactory.for({ ...s0, unclearStreak: 0 }); // 알아들었다 — 못 알아들은 횟수는 0
    switch (j.move) {
      case 'ANSWER': return phase.onAnswer(j, text, now);
      case 'CONTINUER': return phase.onContinuer(j, text, now);
      case 'ACCEPT': return phase.onAccept(j, now);
      case 'REJECT': return phase.onReject(j, text, now);
      case 'CLOSER': return phase.onCloser(j, now);
      case 'USER_INQUIRY': return phase.onInquiry(j);
      case 'EXEMPLAR_REQ': return phase.onExemplarRequest(j);
    }
  }

  // 쉼 — 튜터 말이 끝나고 학생이 조용했다. 화면은 남은 시간이 3분이 되면 말이 없어도 쉼을 보낸다 → 마무리
  onPause(now: number): Outcome {
    if (Agenda.timeUp(this.state, now)) return Agenda.closeForTime(this.state, now);
    return this.phase.onPause(now);
  }

  // 학생이 문단을 고쳐 저장했다 — 어느 국면에서 와도 같은 규칙 (EditingPhase)
  onEdit(ev: EditEvent): Outcome {
    if (this.phase.isOver) return Say.nothing(this.state);
    return new EditingPhase(this.state).onEdit(ev);
  }
}

// 국면(Phase) — State 패턴의 '상태'. 지금 열린 첫째 짝(open)·단계(stage)·진행 중 과제로 정해진다 (PhaseFactory).
// 학생의 수(move) 하나에 템플릿 메서드 하나가 불린다:
//   ANSWER→onAnswer · CONTINUER→onContinuer · ACCEPT→onAccept · REJECT→onReject · CLOSER→onCloser
//   USER_INQUIRY→onInquiry · EXEMPLAR_REQ→onExemplarRequest · ABORT→onAbort · 쉼→onPause
// (수리·UNCLEAR·PRE_CLOSING은 국면과 상관없이 TutoringSession이 먼저 처리한다)
//
// 기본값 = '과제 진행 중의 일반 규칙'. 국면마다 다른 것만 덮어쓴다.
// 상태를 옮기는 것은 둘째 짝(학생의 답·수락·거절)뿐이고, 질문·인정은 열린 짝을 그대로 둔다 (NCF 문서 1절).
// 모든 메서드는 새 상태를 담은 Outcome을 돌려준다 — this.s는 바꾸지 않는다.
import { activeTask, type Judge, type Outcome, type SessionState } from '../state';
import { lines } from '../lines';
import { Agenda } from './Agenda';
import { RepairHandler } from './RepairHandler';
import { Say } from './Say';
import { Tasks } from './Tasks';

export abstract class Phase {
  abstract readonly name: string; // 문서·로그용 이름

  constructor(protected readonly s: SessionState) {}

  // 클라이언트가 쉼(맞장구로 보는 침묵) 이벤트를 보내야 하나
  get awaitsPause(): boolean {
    return false;
  }

  // 세션이 끝나 아무 수도 받지 않나
  get isOver(): boolean {
    return false;
  }

  // 답 — 모델이 다음 말을 하고, 열린 짝은 닫힌다 (모델이 새로 열면 그것)
  onAnswer(j: Judge, _text: string, now: number): Outcome {
    return Agenda.nudge(Say.model({ ...this.s, repaired: false, open: null }, j, false), now);
  }

  // 맞장구 — 튜터가 말하는 중의 것. 열린 짝은 그대로
  onContinuer(j: Judge, _text: string, _now: number): Outcome {
    return Say.model({ ...this.s, repaired: false }, j, true);
  }

  // 수락 — 일반 제안(P1)·시범(P1.4)을 받았다
  onAccept(j: Judge, now: number): Outcome {
    return Agenda.nudge(Say.model({ ...this.s, repaired: false, open: null }, j, false), now);
  }

  // 거절·정정 — 재설득하지 않는다. 모델이 다른 후보를 낸다
  onReject(j: Judge, _text: string, _now: number): Outcome {
    return Say.model({ ...this.s, repaired: false, open: null }, j, false);
  }

  // 인정·감사 — 수리 직후면 곁가지만(B4.4), 아니면 시퀀스를 닫는다
  onCloser(j: Judge, now: number): Outcome {
    const repair = new RepairHandler(this.s);
    if (repair.justRepaired) return repair.closeSideSequence(j);
    return Agenda.nudge(Say.model({ ...this.s, open: null }, j, false), now);
  }

  // 학생의 질문(A1) — 답하고 원래 열린 짝을 유지한다
  onInquiry(j: Judge): Outcome {
    return Say.model({ ...this.s, repaired: true }, j, true);
  }

  // 써 달라 — 시범 한 문장(P1.4, 대필 금지)
  onExemplarRequest(j: Judge): Outcome {
    return Say.model({ ...this.s, repaired: false }, j, false);
  }

  // 그만 — 지금 과제(또는 제안된 과제)를 건너뛴다. 설득하지 않는다 (B5)
  onAbort(text: string, now: number): Outcome {
    const L = lines(this.s.lang);
    const base = { ...this.s, repaired: false, unclearStreak: 0 };
    const o = this.s.open;
    const t = activeTask(this.s) ?? (o?.effect === 'startTask' ? Tasks.find(this.s, o.taskId) : undefined);
    if (!t) return Say.code({ ...base, open: null }, L.ok, null, 'B5');
    return Say.code({ ...Tasks.skip(base, t.id, text, now), open: null }, L.abortTask, null, 'B5');
  }

  // 쉼 — 기본은 아무 일도 없다
  onPause(): Outcome {
    return Say.nothing(this.s);
  }
}

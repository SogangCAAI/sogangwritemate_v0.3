// 수리(repair) — 어느 국면에서든 상태(열린 짝·과제)를 옮기지 않는 곁가지 (NCF B1·B2·B4.4)
//   B2.1 반복 · B2.4 바꿔 말하기 · B2.6 예시: 직전에 만들어 둔 last.*로 코드가 답한다 (모델의 reply는 버린다)
//   B1.2 못 알아들음: 1회 다시 말해 달라 · 2회 모델이 예시를 붙여 다시 묻기 · 3회 방향 바꾸기(B5.1)
//   B4.4 수리·질문 직후의 "고마워요"는 그 곁가지만 닫는다 — 원래 시퀀스는 열린 채
import type { Judge, Move, Outcome, SessionState } from '../state';
import { lines } from '../lines';
import { Say } from './Say';

type RepairRequest = Extract<Move, 'REPEAT_REQ' | 'PARAPHRASE_REQ' | 'EXAMPLE_REQ'>;

export class RepairHandler {
  constructor(private readonly s: SessionState) {}

  // last는 그대로 둬서 거듭 물어도 원래 말 기준으로 답한다
  replay(move: RepairRequest): Outcome {
    const s = { ...this.s, repaired: true };
    const L = lines(s.lang);
    if (move === 'REPEAT_REQ') return Say.line(s, s.last.played, 'B2.1');
    if (move === 'PARAPHRASE_REQ') return Say.line(s, s.last.paraphrase || L.noParaphrase, 'B2.4');
    return Say.line(s, s.last.example || L.noExample, 'B2.6');
  }

  unclear(j: Judge): Outcome {
    const L = lines(this.s.lang);
    const n = this.s.unclearStreak + 1;
    if (n === 1) return Say.line({ ...this.s, unclearStreak: 1 }, L.askAgain, 'B1.2.0'); // 팁은 첫 회부터 붙이지 않는다
    if (n === 2) return { ...Say.model({ ...this.s, unclearStreak: 2 }, j, true), agentAction: 'B1.2.1' }; // 모델이 예시를 붙여 다시 묻는다
    return Say.code({ ...this.s, unclearStreak: 0 }, L.giveUpUnclear, { pattern: 'P1', firstPair: L.giveUpUnclear }, 'B5.1');
  }

  // 수리 직후인가 — 이때의 CLOSER는 closeSideSequence로
  get justRepaired(): boolean {
    return this.s.repaired;
  }

  closeSideSequence(j: Judge): Outcome {
    return { ...Say.model({ ...this.s, repaired: false }, j, true), agentAction: 'B4.4' };
  }
}

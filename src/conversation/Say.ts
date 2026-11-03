// 튜터의 한 턴을 결과(Outcome)로 만드는 네 가지 방법 — 누가 말하나(코드 / 모델 / 아무도)와 세션 끝
// 모두 새 상태 객체를 만든다. 받은 상태는 바꾸지 않는다.
import { activeTask, type Judge, type Open, type Outcome, type SessionState } from '../state';
import { Tasks } from './Tasks';

export class Say {
  // 말 없이 상태만 (또는 아무 일도 없음)
  static nothing(state: SessionState, agentAction = 'none'): Outcome {
    return { state, say: null, agentAction };
  }

  // 정해진 말 — 수리 응답처럼 last를 바꾸지 않는다
  static line(state: SessionState, say: string, agentAction: string): Outcome {
    return { state, say, agentAction };
  }

  // 코드가 새로 말한 턴 — last를 이 말로 바꾼다 (바꿔 말하기·예시는 없음)
  static code(s: SessionState, say: string, open: Open | null, agentAction: string): Outcome {
    return Say.line({ ...s, open, last: { played: say, paraphrase: '', example: '' } }, say, agentAction);
  }

  // 모델이 새로 말한 턴 — keepOpen이면 모델이 무엇을 열었든 지금 open을 유지한다
  static model(s: SessionState, j: Judge, keepOpen: boolean): Outcome {
    const keeps = keepOpen || j.opens === 'none';
    const open: Open | null = keepOpen || j.opens === 'none' ? s.open : { pattern: j.opens, firstPair: j.reply };
    const t = activeTask(s);
    const s1 = j.exemplar && t ? Tasks.update(s, t.id, { exemplar: j.exemplar }) : s;
    const last = { played: j.reply, paraphrase: j.paraphrase, example: j.example };
    return Say.line({ ...s1, open, last }, j.reply, keeps ? 'reply' : j.opens);
  }

  // 세션 끝 — 열린 짝을 모두 닫는다
  static end(o: Outcome): Outcome {
    return { ...o, state: { ...o.state, stage: 'ended', open: null } };
  }
}

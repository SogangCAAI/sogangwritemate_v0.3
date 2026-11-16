// 완료 직전 확인 — NCF A4 Quiz (답을 알고 묻기): 항목을 다 채운 뒤 "이 문단이 뭘 주장하고, 어느 문장이 받쳐 주죠?"
// 튜터가 방금 한 일 (코드): 확인 질문 하나. 학생이 자기 글의 주장과 근거를 짚어야 과제가 끝난다 (2026-11-16, 교사 원칙).
// 나가는 길:
//   답이 맞음 (positive)   → done, 모델의 짧은 인정 → IdlePhase (쉼 뒤 다음 과제)
//   답이 틀리거나 못 짚음  → 모델이 어디가 비었는지 힌트 하나 + 다시 고쳐 보게 (A4.1), 과제는 active 그대로
//   다시 고쳐 저장         → EditingPhase.onEdit가 재평가하고, 다 채우면 확인 질문을 다시 연다
import type { Judge, Outcome } from '../../state';
import { activeTask } from '../../state';
import { Phase } from '../Phase';
import { Say } from '../Say';
import { Tasks } from '../Tasks';

export class CheckPhase extends Phase {
  readonly name = 'check';

  override onAnswer(j: Judge, _text: string, now: number): Outcome {
    return this.judge(j, now);
  }

  // "네 맞아요"처럼 수락으로 읽혀도 확인 질문의 답으로 본다
  override onAccept(j: Judge, now: number): Outcome {
    return this.judge(j, now);
  }

  private judge(j: Judge, now: number): Outcome {
    const s = { ...this.s, repaired: false };
    const t = activeTask(s);
    if (!t) return Say.model({ ...s, open: null }, j, false);
    if (j.positive) {
      const s1 = Tasks.update(s, t.id, { status: 'done', endedAt: now });
      return { ...Say.model({ ...s1, open: null }, j, true), agentAction: 'done:check' };
    }
    return { ...Say.model({ ...s, open: null }, j, false), agentAction: 'A4.1' };
  }
}

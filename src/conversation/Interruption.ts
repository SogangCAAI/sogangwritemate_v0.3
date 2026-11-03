// 끼어들기 비율 → 튜터 말 길이 — 학생이 튜터 말을 자주 덮어 끊으면 말이 길다고 보고 한 문장으로 줄인다.
//
// 근거 (v2, 읽기 전용 — pre-dashboard_code/src/domain/dialogue/caJudge.ts):
//   interruptionLevel · CA_ACTION_TABLE의 shorten 행 — 이요안 10/02 "끼어드는 빈도로 판단", 헤더가 아니라 응답 길이 상한 한 단계
//   임계는 사람 튜터 코퍼스(학생 턴 중 겹쳐 시작한 비율, 세션 n=34): some=0.10(p25) · high=0.25(p75 0.247 반올림)
//   표본 하한 5턴 — 사람 자료도 전환 5건 미만 세션은 뺐다 (0이 '없음'이 아니라 '못 잼')
// 분자·분모는 클라이언트가 센다 (TutorSpeaker): botTurns = 소리가 실제로 시작된 튜터 줄, bargeIns = 학생이 말을 덮어 끊은 줄.
// v2처럼 'some'은 기록만 한다. 'high'일 때만 말 길이를 한 단계 줄인다 (TurnPrompt 안내 + TurnResponder.tidy 상한).
import type { CaCounts } from '../state';

export const INTERRUPTION_SOME = 0.1;
export const INTERRUPTION_HIGH = 0.25;
export const INTERRUPTION_MIN_SAMPLE = 5;

export type InterruptionLevel = 'none' | 'some' | 'high';

export class Interruption {
  constructor(private readonly ca: CaCounts) {}

  get rate(): number {
    return this.ca.botTurns > 0 ? this.ca.bargeIns / this.ca.botTurns : 0;
  }

  get level(): InterruptionLevel {
    if (this.ca.botTurns < INTERRUPTION_MIN_SAMPLE) return 'none';
    if (this.rate >= INTERRUPTION_HIGH) return 'high';
    if (this.rate >= INTERRUPTION_SOME) return 'some';
    return 'none';
  }

  // 튜터 말을 한 문장 줄여야 하나
  get shorten(): boolean {
    return this.level === 'high';
  }

  // 로그(turns.judge jsonb)에 남길 모양
  toLog(): { bargeIns: number; botTurns: number; rate: number; level: InterruptionLevel } {
    return { ...this.ca, rate: Math.round(this.rate * 1000) / 1000, level: this.level };
  }
}

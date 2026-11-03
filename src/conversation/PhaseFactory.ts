// 지금 상태가 어느 국면인가 — 저장된 상태 필드(stage · open.pattern · open.effect · 진행 중 과제)에서만 고른다.
// 상태 모양(SessionState)은 바꾸지 않는다: 클라이언트와 서버가 매 턴 주고받는 JSON 그대로다.
// 위에서부터 처음 맞는 줄이 국면이다.
import { activeTask, type SessionState } from '../state';
import type { Phase } from './Phase';
import { BriefingPhase } from './phases/BriefingPhase';
import { ClosingPhase } from './phases/ClosingPhase';
import { ConclusionPhase } from './phases/ConclusionPhase';
import { EditingPhase } from './phases/EditingPhase';
import { EndedPhase } from './phases/EndedPhase';
import { ExperiencePhase } from './phases/ExperiencePhase';
import { IdlePhase } from './phases/IdlePhase';
import { TaskProposalPhase } from './phases/TaskProposalPhase';

export class PhaseFactory {
  static for(s: SessionState): Phase {
    const p = s.open?.pattern;
    if (s.stage === 'ended') return new EndedPhase(s);
    if (s.stage === 'closing') return new ClosingPhase(s); // 요약 파트(A3) · 성공 확인(C4) · 작별
    if (p === 'A3') return new BriefingPhase(s);
    if (s.open?.effect) return new TaskProposalPhase(s); // 과제 시작 · 넘어가기 · 마무리 제안
    if (p === 'A5.1' || p === 'A5.5' || p === 'A5.0') return new ExperiencePhase(s);
    if (p === 'A2.6') return new ConclusionPhase(s);
    if (activeTask(s)) return new EditingPhase(s); // 과제 중, 열린 짝이 없거나 P1·P1.4
    return new IdlePhase(s); // 과제 사이
  }
}

// 경험 묻고 듣기 — NCF A5.1 Open Inquiry · A5.5 Extended Answer · A5.0 Closed Inquiry (내용 과제, 상담형)
// 튜터가 방금 한 일: 과제의 첫 질문(opener, 코드) 또는 경험을 묻는 질문·"네" 맞장구(모델)를 했다.
// 나가는 길:
//   A5.1·A5.5에서 답 · 맞장구 → 학생 말 원문을 과제의 experience에 이어 붙이고 A5.5(계속 듣는 중)로.
//                               모델이 해석을 제시하며 A2.6을 열면 → ConclusionPhase
//   A5.0(닫힌 질문)의 답     → 경험에 붙이지 않는다 ("또 있어요?"에 "아니요"), 기본값
//   그 밖의 수               → 기본값 (Phase)
import type { Judge, Outcome } from '../../state';
import { activeTask } from '../../state';
import { Agenda } from '../Agenda';
import { Phase } from '../Phase';
import { Say } from '../Say';
import { Tasks } from '../Tasks';

export class ExperiencePhase extends Phase {
  readonly name = 'experience';

  // 학생이 경험을 이야기하는 중인가 (A5.0은 닫힌 질문이라 아니다)
  private get telling(): boolean {
    const p = this.s.open?.pattern;
    return p === 'A5.1' || p === 'A5.5';
  }

  override onAnswer(j: Judge, text: string, now: number): Outcome {
    return this.telling ? Agenda.nudge(this.collect(j, text), now) : super.onAnswer(j, text, now);
  }

  // 맞장구는 튜터가 말하는 중의 것 — 학생이 이어 말하는 중이면 답의 일부로 본다 (골드 실측 오판 보정)
  override onContinuer(j: Judge, text: string, now: number): Outcome {
    return this.telling ? Agenda.nudge(this.collect(j, text), now) : super.onContinuer(j, text, now);
  }

  // A5.5: 학생이 이어 말하는 동안 원문을 그대로 모은다
  private collect(j: Judge, text: string): Outcome {
    const s = { ...this.s, repaired: false };
    const t = activeTask(s);
    const s1 = t ? Tasks.update(s, t.id, { experience: [...t.experience, text] }) : s;
    return Say.model({ ...s1, open: { pattern: 'A5.5', firstPair: s.open!.firstPair } }, j, false);
  }
}

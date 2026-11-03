// 화면들이 함께 쓰는 모양
import type { Assessment, Move, SessionState } from '../state';

// 첫 진단 뒤 세션을 여는 데 필요한 것 — 시작 화면이 만들고 세션·요약 화면이 쓴다
export interface Start {
  state: SessionState;
  say: string;
  awaitPause: boolean;
  posting: string;
  paragraphs: readonly string[];
  assessment: Assessment; // 첫 진단의 평가 — 세션·요약 화면이 보여 준다
}

// 대화 기록 한 줄
export interface Line { readonly who: 'tutor' | 'student'; readonly text: string }

// 학생 쪽에서 /api/turn으로 보내는 일 — 말(힌트 칩이면 라벨 포함) 또는 쉼
export type StudentEvent = { kind: 'say'; text: string; move?: Move } | { kind: 'pause' };

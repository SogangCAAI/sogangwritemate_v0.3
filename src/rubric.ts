// 첫 진단의 채점 루브릭 — 교수님 부록 B의 5축 × 하/중/상. v2(pre-dashboard_code/src/domain/diagnosis/rubric.ts)와 같은 판정.
// 서버(파서·과제 순서)와 화면(진단 카드)이 같이 쓴다. 데이터는 부록 B 그대로, 화면만 학생의 말로 (쉬운말 레이어).
// 턴마다 오가는 SessionState에는 넣지 않는다 — 화면이 들고 있고, DB에는 sessions.rubric으로 남긴다.

export type RubricGrade = '하' | '중' | '상' | '판정불가';
export type RubricAxisKey = 'claim' | 'hierarchy' | 'alignment' | 'cohesion' | 'expression';
export type AlignmentSubKey = 'transfer' | 'consistency';

export interface RubricJudgement { readonly grade: RubricGrade; readonly evidence: string }

// 정합성(alignment)만 하위 판정 둘을 따로 낸다 — 축 등급은 판정할 수 있었던 하위 중 가장 나쁜 것
export interface RubricAxisResult extends RubricJudgement {
  readonly sub?: Readonly<Partial<Record<AlignmentSubKey, RubricJudgement>>>;
}

export type Rubric = Readonly<Record<RubricAxisKey, RubricAxisResult>>;

export interface RubricAxisSpec {
  readonly key: RubricAxisKey;
  readonly label: string; // 부록 B 원어 ("루브릭: 위계와 예증")
  readonly studentLabel: string; // 학생용 쉬운 이름 (화면 기본)
  readonly question: string; // 이 축이 학생 글에 묻는 것
  readonly help: string; // 판정 방식 한 줄
}

// 축 순서 = 근본성 순서 (부록 B 표 순서). 같은 등급이면 앞선 축이 먼저다.
export const RUBRIC_AXES: readonly RubricAxisSpec[] = [
  {
    key: 'claim', label: '주장과 두괄식', studentLabel: '주장이 먼저 보이나',
    question: '첫 문단만 읽어도 내가 어떤 사람인지 보이나요?',
    help: '각 문단의 첫 문장에 하고 싶은 말(주장)이 나오는지 봐요.',
  },
  {
    key: 'hierarchy', label: '위계와 예증', studentLabel: '경험 묶기',
    question: '경험들이 이름 붙은 강점으로 묶여 있나요?',
    help: '비슷한 경험을 하나의 강점으로 묶고, 강점마다 실제 사례가 붙는지 봐요.',
  },
  {
    key: 'alignment', label: '정합성', studentLabel: '지원 업무와의 연결',
    question: '글이 내 이력서, 그리고 공고가 찾는 사람과 맞아떨어지나요?',
    help: '글의 주장마다 이력서 근거가 있고, 공고의 요구와 닿는지 봐요.',
  },
  {
    key: 'cohesion', label: '연결', studentLabel: '매끄러운 흐름',
    question: '문장과 문단이 자연스럽게 이어지나요?',
    help: '앞 문장을 이어받아 다음 문장이 나오는지, 갑자기 튀는 얘기가 없는지 봐요.',
  },
  {
    key: 'expression', label: '표현', studentLabel: '과장 없이 분명하게',
    question: "'배운 사람'이 아니라 '갖춘 사람'으로 말하나요?",
    help: "'배웠습니다'로 끝나지 않고, 힘 있는 동사로 단단하게 말하는지 봐요.",
  },
];

export const RUBRIC_AXIS_KEYS: readonly RubricAxisKey[] = RUBRIC_AXES.map((a) => a.key);

// 정합성의 두 판단 — 화면에 따로 보인다
export const ALIGNMENT_SUBS: readonly (readonly [AlignmentSubKey, string])[] = [
  ['transfer', '지원 업무와의 연결'],
  ['consistency', '제공 자료와의 사실 일치'],
];

// 등급의 학생용 표시 — "하"는 성적표처럼 읽히므로 진행 상태의 말로 (데이터는 하/중/상 그대로)
export const GRADE_LABELS: Readonly<Record<RubricGrade, string>> = {
  하: '보완 필요',
  중: '거의 왔어요',
  상: '잘 갖췄어요',
  판정불가: '자료 없음',
};

export const RUBRIC_GRADES: readonly RubricGrade[] = ['하', '중', '상', '판정불가'];

// 판정할 수 있었던 것 중 가장 나쁜 것. 판정불가는 "나쁜 것"이 아니라 못 본 것 — 전부 판정불가면 null
export function worstJudged(grades: readonly (RubricGrade | undefined)[]): RubricGrade | null {
  const judged = grades.filter((g): g is RubricGrade => !!g && g !== '판정불가');
  for (const g of ['하', '중', '상'] as const) if (judged.includes(g)) return g;
  return null;
}

// 과제 순서의 열쇠 (v2 decideTargetStage): 하 → 중 → 상 → 판정불가, 같은 등급이면 축 순서
const GRADE_RANK: Readonly<Record<RubricGrade, number>> = { 하: 0, 중: 1, 상: 2, 판정불가: 3 };
export function axisRank(rubric: Rubric, key: RubricAxisKey): number {
  return GRADE_RANK[rubric[key].grade] * RUBRIC_AXES.length + RUBRIC_AXIS_KEYS.indexOf(key);
}

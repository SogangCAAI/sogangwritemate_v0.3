// 첫 진단 평가 카드 — 채점 루브릭 5축 (v2 RubricPanel과 같은 내용·상호작용, 학보 편집면의 튜터 남색 카드로)
// 데이터는 부록 B 그대로(하/중/상), 표시만 학생의 말로: 축은 쉬운 이름, 등급은 GRADE_LABELS.
// 축을 누르면 질문형 부제 · 판정 근거 · 한 줄 설명(원래 기준 이름 병기)이 펼쳐진다. 빨강은 쓰지 않는다 (지금 과제 전용).
import { useState } from 'react';
import { ALIGNMENT_SUBS, GRADE_LABELS, RUBRIC_AXES, type Rubric, type RubricAxisKey, type RubricGrade } from '../rubric';

const GRADE_CLASS: Record<RubricGrade, string> = { 상: 'gr-high', 중: 'gr-mid', 하: 'gr-low', 판정불가: 'gr-none' };

function Grade({ grade }: { grade: RubricGrade }) {
  return <span className={`grade ${GRADE_CLASS[grade]}`}>{GRADE_LABELS[grade]}</span>;
}

interface Props { rubric: Rubric; strengths: string; open?: boolean }

export function RubricCard({ rubric, strengths, open = true }: Props) {
  const [openAxis, setOpenAxis] = useState<RubricAxisKey | null>(null);

  return (
    <details className="diag" open={open}>
      <summary>
        <span className="diag-kicker">첫 진단 평가</span>
        <span className="diag-toggle" aria-hidden="true" />
      </summary>
      <p className="diag-intro">방금 받은 첫 진단 평가예요. 글을 다섯 가지 기준으로 살펴본 결과이고, 항목을 누르면 판정 이유가 보여요.</p>
      {strengths && <p className="diag-strengths"><b>잘한 점</b> {strengths}</p>}

      <ul className="axes">
        {RUBRIC_AXES.map((a) => {
          const entry = rubric[a.key];
          const isOpen = openAxis === a.key;
          const panelId = `axis-${a.key}`;
          return (
            <li key={a.key} className={`axis${isOpen ? ' is-open' : ''}`}>
              <button
                type="button"
                className="axis-row"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenAxis(isOpen ? null : a.key)}
              >
                <span className="axis-caret" aria-hidden="true" />
                <span className="axis-name">{a.studentLabel}</span>
                <Grade grade={entry.grade} />
              </button>
              {isOpen && (
                <div id={panelId} className="axis-body">
                  <p className="axis-q">{a.question}</p>
                  {entry.evidence && <p className="axis-ev">{entry.evidence}</p>}
                  {entry.sub && (
                    <dl className="axis-subs">
                      {ALIGNMENT_SUBS.map(([k, label]) => {
                        const v = entry.sub?.[k];
                        if (!v) return null;
                        return (
                          <div key={k} className="axis-sub">
                            <dt>{label} <Grade grade={v.grade} /></dt>
                            {v.evidence && <dd>{v.evidence}</dd>}
                          </div>
                        );
                      })}
                    </dl>
                  )}
                  <p className="axis-help">{a.help} <span className="axis-label">(루브릭: {a.label})</span></p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="diag-foot">이 카드는 세션 내내 바뀌지 않아요. 세션이 끝나면 요약 화면에서 다시 볼 수 있어요.</p>
    </details>
  );
}

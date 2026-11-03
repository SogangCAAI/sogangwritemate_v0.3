// 글 — 전체가 한 문서로 보인다. 지금 과제의 문단은 늘 고칠 수 있게 열려 있고, 다른 문단은 눌러서 그 자리에서 고친다.
// '수정 저장'을 누르면 재평가로 간다. 입력칸에 커서가 있는 동안 듣기는 멈춘다(onEditing).
import { useEffect, useState } from 'react';
import type { Rubric } from '../rubric';
import type { Task } from '../state';
import { RubricCard } from './RubricCard';
import { AutoTextarea } from './AutoTextarea';

interface Props {
  paragraphs: readonly string[];
  task?: Task; // 지금 과제
  busy: boolean;
  listenPaused: boolean; // 편집 때문에 듣기를 멈춘 상태 — 안내를 보인다
  onSave: (paragraph: number, text: string) => Promise<boolean>;
  onEditing: (editing: boolean) => void;
  rubric?: Rubric; // 첫 진단 — 글 위에 튜터의 평가 카드로
  strengths?: string;
}

const folio = (n: number) => String(n).padStart(2, '0');
const charCount = (ps: readonly string[]) => ps.reduce((sum, p) => sum + p.replace(/\s/g, '').length, 0);

export function EssayPanel({ paragraphs, task, busy, listenPaused, onSave, onEditing, rubric, strengths = '' }: Props) {
  const [drafts, setDrafts] = useState<readonly string[]>(paragraphs);
  const [open, setOpen] = useState<number | null>(null); // 과제 밖에서 고치는 문단 (1부터)
  const target = task?.target.paragraph;

  // 입력칸이 사라지면 blur가 오지 않을 수 있다 — 문단이 바뀔 때 포커스를 다시 확인한다
  useEffect(() => {
    if (!(document.activeElement instanceof HTMLTextAreaElement)) onEditing(false);
  }, [target, open, onEditing]);

  const setDraft = (i: number, text: string) => setDrafts((ds) => paragraphs.map((p, j) => (j === i ? text : ds[j] ?? p)));

  async function save(n: number) {
    const text = (drafts[n - 1] ?? '').trim();
    if (await onSave(n, text)) setOpen((o) => (o === n ? null : o));
  }

  function cancel(n: number) {
    setDraft(n - 1, paragraphs[n - 1] ?? '');
    setOpen(null);
  }

  const focusProps = {
    onFocus: () => onEditing(true),
    onBlur: () => onEditing(false),
  };

  return (
    <section className="desk" aria-labelledby="essay-h">
      <div className="desk-head">
        <h2 id="essay-h">내 자기소개서</h2>
        <p className="desk-meta">{paragraphs.length}문단 · {charCount(paragraphs)}자</p>
      </div>
      {/* 브리핑 동안 펼쳐 두고, 과제가 시작되면 접어 글이 보이게 (key로 다시 그려 기본 상태를 바꾼다) */}
      {rubric && <RubricCard key={task ? 'tasking' : 'briefing'} rubric={rubric} strengths={strengths} open={!task} />}

      {paragraphs.map((saved, i) => {
        const n = i + 1;
        const draft = drafts[i] ?? saved;
        const changed = draft.trim() !== saved;
        const isTarget = n === target;
        const editing = isTarget || open === n;
        const canSave = !busy && changed && draft.trim().length > 0;

        if (!editing) {
          return (
            <div key={n} className="para">
              <span className="folio" aria-hidden="true">{folio(n)}</span>
              <div className="para-body">
                <p className="para-text" onClick={() => !busy && setOpen(n)}>{saved}</p>
                <button type="button" className="link para-edit" disabled={busy} onClick={() => setOpen(n)}>
                  {n}문단 고치기
                </button>
              </div>
            </div>
          );
        }

        return (
          <div key={n} className={`para is-editing${isTarget ? ' is-target' : ''}`}>
            <span className="folio" aria-hidden="true">{folio(n)}</span>
            <div className="para-body">
              <label htmlFor={`p${n}`} className="para-label">
                <span className="sr-only">{n}문단, </span>
                {isTarget ? `지금 고치는 문단 · 과제 ${task!.order}` : `${n}문단 고치는 중`}
              </label>
              {isTarget && <p className="para-crit"><b>완료 기준</b> {task!.doneWhen}</p>}
              <AutoTextarea
                id={`p${n}`}
                value={draft}
                onChange={(e) => setDraft(i, e.target.value)}
                {...focusProps}
              />
              <div className="para-bar">
                <button type="button" className="btn solid" disabled={!canSave} onClick={() => void save(n)}>
                  수정 저장
                </button>
                {!isTarget && (
                  <button type="button" className="btn" onClick={() => cancel(n)}>
                    취소
                  </button>
                )}
                {listenPaused && (
                  <span className="para-pause" role="status">
                    <i aria-hidden="true" />고치는 동안 듣기는 잠시 멈춰요
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

// 글 패널 — 문단마다 고치고 '수정 저장'을 누르면 재평가로 간다
import { useState } from 'react';

interface Props {
  paragraphs: string[];
  target?: number; // 지금 과제의 문단 (1부터)
  busy: boolean;
  onSave: (paragraph: number, text: string) => void;
}

export function EssayPanel({ paragraphs, target, busy, onSave }: Props) {
  const [drafts, setDrafts] = useState<string[]>(paragraphs);
  return (
    <section aria-labelledby="essay-h" className="essay">
      <h2 id="essay-h">내 글</h2>
      {paragraphs.map((saved, i) => {
        const n = i + 1;
        const draft = drafts[i] ?? saved;
        const changed = draft.trim() !== saved;
        return (
          <div key={n} className={`para${n === target ? ' target' : ''}`}>
            <label htmlFor={`p${n}`}>{n}문단{n === target ? ' · 지금 과제' : ''}</label>
            <textarea
              id={`p${n}`} rows={4} value={draft}
              onChange={(e) => setDrafts(drafts.map((d, j) => (j === i ? e.target.value : d)))}
            />
            <button type="button" disabled={busy || !changed || !draft.trim()} onClick={() => onSave(n, draft.trim())}>
              수정 저장
            </button>
          </div>
        );
      })}
    </section>
  );
}

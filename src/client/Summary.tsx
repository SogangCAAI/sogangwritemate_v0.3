// 요약 화면 — 과제 표(코드가 센 사실) + Sonnet 요약 + 처음 글과 끝 글
import { useEffect, useState } from 'react';
import { mmss, taskTimeMs } from '../checks';
import type { SessionState } from '../state';
import { errorText, post, type SummaryResult } from './api';
import type { Start } from './Landing';
import { STATUS_LABEL } from './TaskList';

interface Props { start: Start; state: SessionState; final: string[]; onRestart: () => void }

export function Summary({ start, state, final, onRestart }: Props) {
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [error, setError] = useState('');
  const [now] = useState(Date.now());

  useEffect(() => {
    let live = true;
    post<SummaryResult>('/api/summary', { state, original: start.paragraphs, final, posting: start.posting })
      .then((r) => live && setSummary(r))
      .catch((e) => live && setError(errorText(e)));
    return () => { live = false; };
  }, [state, start, final]);

  return (
    <main className="summary">
      <h1>오늘의 요약</h1>
      <table>
        <caption>과제 표</caption>
        <thead>
          <tr><th scope="col">과제</th><th scope="col">결과</th><th scope="col">시간</th><th scope="col">턴</th><th scope="col">수정</th><th scope="col">근거</th></tr>
        </thead>
        <tbody>
          {state.tasks.map((t) => (
            <tr key={t.id}>
              <td>{t.goal}</td>
              <td>{STATUS_LABEL[t.status]}{t.fromExemplar ? ' (시범 문장)' : ''}</td>
              <td>{mmss(taskTimeMs(t, now))}</td>
              <td>{t.turns}</td>
              <td>{t.edits}</td>
              <td>{t.evidence ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section aria-live="polite">
        {error && <p className="error" role="alert">{error}</p>}
        {!summary && !error && <p>요약을 쓰고 있어요…</p>}
        {summary && (
          <>
            <p>{summary.report}</p>
            {summary.nextSteps.length > 0 && (
              <>
                <h2>다음에 할 것</h2>
                <ul>{summary.nextSteps.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </>
            )}
          </>
        )}
      </section>

      <div className="compare">
        <section aria-labelledby="orig-h"><h2 id="orig-h">처음 글</h2>{start.paragraphs.map((p, i) => <p key={i}>{p}</p>)}</section>
        <section aria-labelledby="final-h"><h2 id="final-h">끝 글</h2>{final.map((p, i) => <p key={i} className={p !== start.paragraphs[i] ? 'changed' : ''}>{p}</p>)}</section>
      </div>
      <button type="button" onClick={onRestart}>새 세션</button>
    </main>
  );
}

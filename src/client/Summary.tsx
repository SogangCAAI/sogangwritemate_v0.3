// 요약 화면 — 과제 표(코드가 센 사실, 도장) + 튜터 요약 + 처음 글과 끝 글 나란히
import { useEffect, useState } from 'react';
import { mmss, taskTimeMs } from '../checks';
import type { SessionState } from '../state';
import { errorText, post, type SummaryResult } from './api';
import type { Start } from './Landing';
import { Masthead } from './Masthead';
import { Stamp } from './Stamp';

interface Props { start: Start; state: SessionState; final: string[]; onRestart: () => void }

const folio = (n: number) => String(n).padStart(2, '0');

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
    <div className="shell summary">
      <Masthead>
        <button type="button" className="btn solid" onClick={onRestart}>새 세션</button>
      </Masthead>
      <main className="sum">
        <h1>오늘의 요약</h1>

        <table className="sum-table">
          <caption>과제 표</caption>
          <thead>
            <tr><th scope="col">과제</th><th scope="col">결과</th><th scope="col">시간</th><th scope="col">턴</th><th scope="col">수정</th><th scope="col">근거</th></tr>
          </thead>
          <tbody>
            {state.tasks.map((t) => (
              <tr key={t.id}>
                <td><span className="sum-no">과제 {t.order}</span>{t.goal}</td>
                <td><Stamp status={t.status} />{t.fromExemplar && <span className="sum-ex">시범 문장</span>}</td>
                <td className="num">{mmss(taskTimeMs(t, now))}</td>
                <td className="num">{t.turns}</td>
                <td className="num">{t.edits}</td>
                <td className="sum-ev">{t.evidence ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="report" aria-live="polite" aria-labelledby="report-h">
          <h2 id="report-h">튜터의 정리</h2>
          {error && <p className="error" role="alert">{error}</p>}
          {!summary && !error && <p className="pending">요약을 쓰고 있어요…</p>}
          {summary && (
            <>
              <p className="report-text">{summary.report}</p>
              {summary.nextSteps.length > 0 && (
                <>
                  <h3>다음에 할 것</h3>
                  <ul>{summary.nextSteps.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </>
              )}
            </>
          )}
        </section>

        <div className="compare">
          <section aria-labelledby="orig-h">
            <h2 id="orig-h">처음 글</h2>
            {start.paragraphs.map((p, i) => (
              <div key={i} className="cmp-para"><span className="folio" aria-hidden="true">{folio(i + 1)}</span><p>{p}</p></div>
            ))}
          </section>
          <section aria-labelledby="final-h">
            <h2 id="final-h">끝 글</h2>
            {final.map((p, i) => {
              const changed = p !== start.paragraphs[i];
              return (
                <div key={i} className={`cmp-para${changed ? ' is-changed' : ''}`}>
                  <span className="folio" aria-hidden="true">{folio(i + 1)}</span>
                  <p>{p}{changed && <span className="cmp-mark">고침</span>}</p>
                </div>
              );
            })}
          </section>
        </div>
      </main>
      <footer className="colophon">서강 글벗은 서강대학교 CAAI 연구실이 만든 연구용 튜터예요.</footer>
    </div>
  );
}

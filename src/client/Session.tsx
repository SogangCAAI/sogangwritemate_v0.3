// 세션 화면 — 대화 기록 · 입력 · 힌트 칩 · 글 패널 · 과제 목록
// 상태는 서버가 들고 있지 않다: 매 턴 지금 상태를 보내고 새 상태를 받는다.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { mmss, sessionLeftMs } from '../checks';
import { activeTask, type Move, type SessionState } from '../state';
import { errorText, post, type TurnResult } from './api';
import { EssayPanel } from './EssayPanel';
import type { Start } from './Landing';
import { TaskList } from './TaskList';

interface Line { who: 'tutor' | 'student'; text: string }

const CHIPS: { label: string; move: Move }[] = [
  { label: '뭐라고요?', move: 'REPEAT_REQ' },
  { label: '무슨 뜻이에요?', move: 'PARAPHRASE_REQ' },
  { label: '예를 들면요?', move: 'EXAMPLE_REQ' },
  { label: '그만할래요', move: 'ABORT' },
];

// 텍스트판의 '쉼' — 읽을 시간을 준 뒤 맞장구로 보고 다음으로 간다. 학생이 입력을 시작하면 멈춘다
const pauseDelay = (said: string) => 1500 + said.length * 45;

type TurnEvent = { kind: 'say'; text: string; move?: Move } | { kind: 'pause' };

export function Session({ start, onFinish }: { start: Start; onFinish: (s: SessionState, final: string[]) => void }) {
  const [state, setState] = useState(start.state);
  const [log, setLog] = useState<Line[]>(start.say ? [{ who: 'tutor', text: start.say }] : []);
  const [paragraphs, setParagraphs] = useState(start.paragraphs);
  const [awaitPause, setAwaitPause] = useState(start.awaitPause);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const logEnd = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => logEnd.current?.scrollIntoView({ block: 'end' }), [log]);

  function apply(r: TurnResult) {
    setState(r.state);
    setAwaitPause(r.awaitPause);
    if (r.say) setLog((l) => [...l, { who: 'tutor', text: r.say! }]);
  }

  async function send(event: TurnEvent) {
    setBusy(true);
    setError('');
    setAwaitPause(false);
    if (event.kind === 'say') setLog((l) => [...l, { who: 'student', text: event.text }]);
    try {
      apply(await post<TurnResult>('/api/turn', { state, context: { posting: start.posting, paragraphs }, history: log, event }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(paragraph: number, text: string) {
    setBusy(true);
    setError('');
    try {
      const r = await post<TurnResult>('/api/evaluate', {
        state, paragraph, original: start.paragraphs[paragraph - 1] ?? '', edited: text,
      });
      setParagraphs((ps) => ps.map((p, i) => (i === paragraph - 1 ? text : p)));
      apply(r);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const lastTutor = [...log].reverse().find((l) => l.who === 'tutor')?.text ?? '';
  useEffect(() => {
    if (!awaitPause || busy || draft) return;
    const id = setTimeout(() => void send({ kind: 'pause' }), pauseDelay(lastTutor));
    return () => clearTimeout(id);
    // send는 매 렌더 새로 만들어진다 — 상태가 바뀔 때만 타이머를 다시 건다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, awaitPause, busy, draft]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    void send({ kind: 'say', text });
  }

  const ended = state.stage === 'ended';
  const target = activeTask(state)?.target.paragraph;

  return (
    <main className="session">
      <header className="bar">
        <h1>서강 글벗</h1>
        <span className="clock" aria-label="남은 시간">남은 시간 {mmss(Math.max(0, sessionLeftMs(state, now)))}</span>
        <button type="button" className="ghost" onClick={() => onFinish(state, paragraphs)}>
          {ended ? '요약 보기' : '세션 끝내기'}
        </button>
      </header>

      <div className="cols">
        <section className="chat" aria-label="대화">
          <ol className="log" aria-live="polite">
            {log.map((l, i) => (
              <li key={i} className={l.who}>
                <span className="sr-only">{l.who === 'tutor' ? '튜터: ' : '나: '}</span>
                {l.text}
              </li>
            ))}
            {busy && <li className="tutor pending">…</li>}
            <li ref={logEnd} aria-hidden="true" />
          </ol>
          {error && <p className="error" role="alert">{error}</p>}
          {ended ? (
            <p className="ended">세션이 끝났어요. 위의 '요약 보기'를 눌러 주세요.</p>
          ) : (
            <>
              <div className="chips" role="group" aria-label="빠른 응답">
                {CHIPS.map((c) => (
                  <button key={c.move} type="button" disabled={busy} onClick={() => void send({ kind: 'say', text: c.label, move: c.move })}>
                    {c.label}
                  </button>
                ))}
              </div>
              <form className="say" onSubmit={submit}>
                <label htmlFor="say" className="sr-only">튜터에게 말하기</label>
                <input id="say" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="여기에 답을 적어요" autoComplete="off" />
                <button type="submit" disabled={busy || !draft.trim()}>보내기</button>
              </form>
            </>
          )}
        </section>

        <aside className="side">
          <TaskList tasks={state.tasks} />
          <EssayPanel paragraphs={paragraphs} target={target} busy={busy || ended} onSave={saveEdit} />
        </aside>
      </div>
    </main>
  );
}

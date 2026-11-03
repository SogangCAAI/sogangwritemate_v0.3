// 튜터 칸 — 지난 대화 · 튜터의 지금 자막 · 학생 실시간 자막 · 마이크 · 말해도 되는 말(칩) · 글자로 입력
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Move } from '../state';
import { MicDesk } from './MicDesk';
import type { Voice } from './voice';

export interface Line { who: 'tutor' | 'student'; text: string }

export const CHIPS: { label: string; move: Move }[] = [
  { label: '뭐라고요?', move: 'REPEAT_REQ' },
  { label: '무슨 뜻이에요?', move: 'PARAPHRASE_REQ' },
  { label: '예를 들면요?', move: 'EXAMPLE_REQ' },
  { label: '그만할래요', move: 'ABORT' },
];

interface Props {
  log: Line[];
  voice: Voice;
  busy: boolean;
  ended: boolean;
  error: string;
  draft: string;
  onDraft: (text: string) => void;
  onSay: (text: string, move?: Move) => void;
  onFinish: () => void;
}

const lastIndex = (log: Line[], who: Line['who']) => log.map((l) => l.who).lastIndexOf(who);

export function VoicePanel({ log, voice, busy, ended, error, draft, onDraft, onSay, onFinish }: Props) {
  const [typing, setTyping] = useState(false);
  const logEnd = useRef<HTMLLIElement>(null);
  const textOnly = !voice.canListen || !voice.micOn;
  const showForm = !ended && (typing || textOnly);

  const tutorAt = lastIndex(log, 'tutor');
  const studentAt = lastIndex(log, 'student');
  const latestStudent = studentAt > tutorAt ? log[studentAt]!.text : '';
  const past = log.filter((_, i) => i !== tutorAt && !(i === studentAt && studentAt > tutorAt));
  const caption = tutorAt >= 0 ? log[tutorAt]!.text : '';

  // 중괄호 필수 — 최신 Chrome의 scrollIntoView는 Promise를 돌려주고, effect가 그걸 반환하면 React가 정리 함수로 불러 화면이 죽는다
  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: 'end' });
  }, [past.length]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    onDraft('');
    onSay(text);
  }

  const tutorWho = busy ? '튜터 · 생각 중' : voice.state === 'speaking' ? '튜터 · 말하는 중' : '튜터 · 방금 말함';
  const you = voice.interim || latestStudent;
  const youWho = voice.interim ? '나 · 말하는 중' : '나 · 방금 말함';

  return (
    <aside className="side" aria-label="튜터와 음성 대화">
      <ol className="log" aria-label="지난 대화">
        {past.map((l, i) => (
          <li key={i} className={`ln ln-${l.who}`}>
            <b>{l.who === 'tutor' ? '튜터' : '나'}</b>{l.text}
          </li>
        ))}
        <li ref={logEnd} aria-hidden="true" className="log-end" />
      </ol>

      <div className={`now${busy ? ' is-thinking' : ''}`}>
        <p className="who">{tutorWho}</p>
        <p className="cap" aria-live="polite">{caption}</p>
      </div>

      <div className="you">
        {you ? (
          <>
            <p className="who">{youWho}</p>
            <p className="cap">
              {you}
              {voice.interim && <span className="caret" aria-hidden="true" />}
            </p>
          </>
        ) : (
          <p className="you-empty">{voice.canListen && voice.micOn ? '말하면 여기에 글자로 보여요' : ''}</p>
        )}
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {voice.error && <p className="error" role="alert">{voice.error}</p>}
      {!voice.canListen && (
        <p className="note" role="note">
          이 브라우저에서는 말로 답할 수 없어요. Chrome이나 Edge에서 열면 말로 대화할 수 있어요. 지금은 아래 칸에 글자로 답해 주세요.
        </p>
      )}

      {ended ? (
        <div className="ended">
          <p>세션이 끝났어요. 오늘 고친 것을 요약으로 볼 수 있어요.</p>
          <button type="button" className="btn solid" onClick={onFinish}>요약 보기</button>
        </div>
      ) : (
        <>
          <MicDesk voice={voice} />
          <div className="hints">
            <p className="hints-h" id="hints-h">이렇게 말해도 돼요</p>
            <div className="chips" role="group" aria-labelledby="hints-h">
              {CHIPS.map((c) => (
                <button key={c.move} type="button" className={`chip${c.move === 'ABORT' ? ' chip-quiet' : ''}`} disabled={busy} onClick={() => onSay(c.label, c.move)}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          {showForm ? (
            <form className="say" onSubmit={submit}>
              <label htmlFor="say" className="sr-only">튜터에게 글자로 말하기</label>
              <input id="say" value={draft} onChange={(e) => onDraft(e.target.value)} placeholder="여기에 답을 적어요" autoComplete="off" autoFocus={typing} />
              <button type="submit" className="btn solid" disabled={busy || !draft.trim()}>보내기</button>
            </form>
          ) : (
            <div className="fallback">
              <button type="button" className="link" onClick={() => setTyping(true)}>글자로 입력</button>
            </div>
          )}
        </>
      )}
    </aside>
  );
}

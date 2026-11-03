// 세션 화면 — 제호 띠(과제 세 꼭지) · 글 전체(기사 단) · 튜터 칸(말로 하는 대화)
// 상태는 서버가 들고 있지 않다: 매 턴 지금 상태를 보내고 새 상태를 받는다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { mmss, sessionLeftMs } from '../checks';
import { activeTask, type Move, type SessionState } from '../state';
import { errorText, post, type TurnResult } from './api';
import { EssayPanel } from './EssayPanel';
import type { Start } from './Landing';
import { Masthead } from './Masthead';
import { TaskStrip } from './TaskStrip';
import { useVoice } from './voice';
import { VoicePanel, type Line } from './VoicePanel';

// '쉼' — 브리핑 파트는 튜터 말이 끝나고 이만큼 조용하면 다음으로 간다
const AFTER_SPEECH_MS = 1000;
// 소리로 말하지 못했을 때(음성 합성 없음)의 쉼 — 읽을 시간을 준다
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
  const [editing, setEditing] = useState(false);
  const [sayId, setSayId] = useState(0); // 지금 튜터 줄의 음성 번호 (0 = 소리로 말하지 않음)
  const [now, setNow] = useState(Date.now());
  const busyRef = useRef(false);

  const ended = state.stage === 'ended';
  const voice = useVoice({
    lang: state.lang,
    thinking: busy,
    hold: editing || ended,
    onFinal: (text) => void send({ kind: 'say', text }),
  });
  const { speak, toggleMic } = voice;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const speakLine = useCallback((text: string) => setSayId(speak(text)), [speak]);

  // 첫 진단의 말을 소리로 — 시작하기를 누른 직후라 브라우저가 소리를 허용한다
  useEffect(() => {
    if (start.say) speakLine(start.say);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply(r: TurnResult) {
    setState(r.state);
    setAwaitPause(r.awaitPause);
    if (r.say) {
      setLog((l) => [...l, { who: 'tutor', text: r.say! }]);
      speakLine(r.say);
    }
  }

  async function send(event: TurnEvent) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setAwaitPause(false);
    if (event.kind === 'say') {
      voice.stop(); // 학생이 말하면 튜터는 말을 멈춘다
      setLog((l) => [...l, { who: 'student', text: event.text }]);
    }
    try {
      apply(await post<TurnResult>('/api/turn', { state, context: { posting: start.posting, paragraphs }, history: log, event }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function saveEdit(paragraph: number, text: string): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const r = await post<TurnResult>('/api/evaluate', {
        state, paragraph, original: start.paragraphs[paragraph - 1] ?? '', edited: text,
      });
      setParagraphs((ps) => ps.map((p, i) => (i === paragraph - 1 ? text : p)));
      apply(r);
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // 쉼: 튜터 말이 끝까지 재생된 뒤(또는 소리가 없으면 읽을 시간 뒤) 학생이 조용하면 다음 파트로
  const lastTutor = [...log].reverse().find((l) => l.who === 'tutor')?.text ?? '';
  useEffect(() => {
    if (!awaitPause || busy || draft || voice.interim) return;
    const spoken = sayId > 0;
    if (spoken && voice.endedId !== sayId) return; // 아직 말하는 중
    const id = setTimeout(() => void send({ kind: 'pause' }), spoken ? AFTER_SPEECH_MS : pauseDelay(lastTutor));
    return () => clearTimeout(id);
    // send는 매 렌더 새로 만들어진다 — 상태가 바뀔 때만 타이머를 다시 건다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, awaitPause, busy, draft, voice.interim, voice.endedId, sayId]);

  // Space = 마이크 켜고 끄기 (글을 입력하거나 버튼에 있을 때는 제외)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t?.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
      e.preventDefault();
      toggleMic();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleMic]);

  function finish() {
    voice.stop();
    onFinish(state, paragraphs);
  }

  const task = activeTask(state);

  return (
    <div className="shell session">
      <Masthead heading>
        <p className="timer"><span>남은 시간</span><b>{mmss(Math.max(0, sessionLeftMs(state, now)))}</b></p>
        <button type="button" className="btn" onClick={finish}>{ended ? '요약 보기' : '세션 끝내기'}</button>
      </Masthead>
      <TaskStrip tasks={state.tasks} />
      <main className="page">
        <EssayPanel
          paragraphs={paragraphs}
          task={task}
          busy={busy || ended}
          listenPaused={editing && voice.held}
          onSave={saveEdit}
          onEditing={setEditing}
        />
        <VoicePanel
          log={log}
          voice={voice}
          busy={busy}
          ended={ended}
          error={error}
          draft={draft}
          onDraft={setDraft}
          onSay={(text, move) => void send({ kind: 'say', text, move })}
          onFinish={finish}
        />
      </main>
    </div>
  );
}

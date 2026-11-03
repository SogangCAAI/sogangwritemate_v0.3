// 세션 화면의 훅 — SessionController를 화면 상태와 음성에 잇는다. 화면 컴포넌트는 이 결과로 그리기만 한다
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { sessionLeftMs } from '../../checks';
import { CLOSE_AT_LEFT_MS, type Move, type SessionState } from '../../state';
import { api } from '../ApiClient';
import type { Start } from '../types';
import { useVoice } from '../voice';
import { SessionController } from './SessionController';

const TICK_MS = 1000;

export function useSession(start: Start, onFinish: (s: SessionState, final: readonly string[]) => void) {
  const [ctl] = useState(() => new SessionController(start, api));
  const view = useSyncExternalStore(ctl.subscribe, ctl.snapshot);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const now = useClock();

  const ended = view.state.stage === 'ended';
  const voice = useVoice({
    lang: view.state.lang,
    thinking: view.busy,
    hold: editing || ended,
    onFinal: (text) => void ctl.send({ kind: 'say', text }),
  });
  const { speak, stop, toggleMic, ca } = voice;

  useEffect(() => ctl.attachVoice({ speak, stop, ca }), [ctl, speak, stop, ca]);
  useEffect(() => ctl.speakOpening(), [ctl]);

  // 쉼: 튜터 말이 끝난 뒤 조용하면 다음 파트로
  useEffect(() => {
    const delay = ctl.pauseDelay({ draft, interim: voice.interim, endedId: voice.endedId });
    if (delay === null) return;
    const id = setTimeout(() => void ctl.send({ kind: 'pause' }), delay);
    return () => clearTimeout(id);
    // 상태가 바뀔 때만 타이머를 다시 건다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.state, view.awaitPause, view.busy, draft, voice.interim, voice.endedId, view.sayId]);

  useSpaceToggle(toggleMic);

  const finish = useCallback(() => {
    stop();
    onFinish(view.state, view.paragraphs);
  }, [stop, onFinish, view.state, view.paragraphs]);

  // 20분 전에 반드시 마무리 — 남은 3분이면 학생이 말이 없어도 쉼을 보내 서버가 마무리를 시작하게 하고,
  // 0분이 되면 요약 화면으로 넘어간다
  const left = sessionLeftMs(view.state, now);
  const inTask = view.state.stage === 'content' || view.state.stage === 'form';
  const closeAsked = useRef(false);
  useEffect(() => {
    if (!inTask || left > CLOSE_AT_LEFT_MS || view.busy || closeAsked.current) return;
    closeAsked.current = true;
    void ctl.send({ kind: 'pause' });
  }, [inTask, left, view.busy, ctl]);
  useEffect(() => {
    if (left <= 0 && !ended) finish();
  }, [left, ended, finish]);

  return {
    view, voice, now, ended, draft, setDraft, editing, setEditing, finish,
    say: (text: string, move?: Move) => void ctl.send({ kind: 'say', text, move }),
    saveEdit: (paragraph: number, text: string) => ctl.saveEdit(paragraph, text),
  };
}

// 남은 시간 표시용 시계
function useClock(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

// Space = 마이크 켜고 끄기 (글을 입력하거나 버튼에 있을 때는 제외)
function useSpaceToggle(toggle: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t?.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);
}

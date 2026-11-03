// 방송 데스크 — 둥근 마이크(켜고 끄기), 지금 상태, 상태 범례, 튜터 말 멈추기
import type { Voice, VoiceState } from './voice';

const STATE_TEXT: Record<VoiceState, string> = {
  listening: '듣고 있어요',
  speaking: '튜터가 말하는 중',
  thinking: '생각 중',
  muted: '마이크 꺼짐',
  unsupported: '글자로 답해요',
};

const LEGEND: VoiceState[] = ['listening', 'speaking', 'thinking', 'muted'];

function MicIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

export function MicDesk({ voice }: { voice: Voice }) {
  const { state, micOn, canListen, held } = voice;
  const paused = held && state === 'listening';
  const label = paused ? '잠시 멈춤' : STATE_TEXT[state];
  const live = state === 'listening' && !held;
  return (
    <div className={`air is-${state}${paused ? ' is-held' : ''}`} role="group" aria-label="마이크">
      <button
        type="button"
        className="mic"
        aria-pressed={micOn && canListen}
        aria-describedby="air-state"
        disabled={!canListen}
        onClick={voice.toggleMic}
      >
        <MicIcon off={!micOn || !canListen} />
        <span className="sr-only">{micOn ? '마이크 끄기' : '마이크 켜기'}</span>
      </button>
      <div className="air-main">
        <div className="air-head">
          {live && <span className="onair">ON AIR</span>}
          <span id="air-state" className="air-state">{label}</span>
        </div>
        <ul className="legend" aria-hidden="true">
          {LEGEND.map((s) => <li key={s} className={s === state ? 'on' : ''}>{STATE_TEXT[s]}</li>)}
        </ul>
        <div className="air-foot">
          <span className="air-key">{canListen ? <>Space 키로 마이크를 켜고 꺼요</> : '이 브라우저는 음성 인식이 없어요'}</span>
          <button type="button" className="btn small" disabled={state !== 'speaking'} onClick={voice.stop}>
            튜터 말 멈추기
          </button>
        </div>
      </div>
    </div>
  );
}

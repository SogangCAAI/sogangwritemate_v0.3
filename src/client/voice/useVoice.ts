// 음성 훅 — 세 부품을 화면 상태에 잇는다. 연구실 lab-server 엔진으로 바꿀 때 이 폴더만 교체한다 (shortcut: 브라우저 내장 음성 인식)
//   TutorSpeaker      튜터 말 (서버 TTS <audio>, 없으면 speechSynthesis)
//   BargeInDetector   튜터가 말하는 동안 끼어들기 (메아리 제거 마이크 소리 크기)
//   SpeechListener    학생 말 (SpeechRecognition)
// 메아리 제거 세 겹: ① 튜터가 말하는 동안 인식을 끈다(반이중) ② 끼어들기는 메아리 제거 마이크로 ③ 끝난 직후 글자 겹침 거르기
import { useCallback, useEffect, useRef, useState } from 'react';
import { BargeInDetector } from './BargeInDetector';
import { SpeechListener } from './SpeechListener';
import { TutorSpeaker } from './TutorSpeaker';
import { recognizerCtor, type Voice, type VoiceOptions, type VoiceState } from './types';

export function useVoice({ lang, thinking, hold, onFinal }: VoiceOptions): Voice {
  const [canListen] = useState(() => recognizerCtor() !== null);
  const [micOn, setMicOn] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState('');
  const [endedId, setEndedId] = useState(0);
  const [error, setError] = useState('');
  const [speaker] = useState(() => new TutorSpeaker({
    onStart: () => setSpeaking(true),
    onEnd: (id) => { setSpeaking(false); setEndedId(id); },
  }));
  const [barge] = useState(() => new BargeInDetector());
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const stop = useCallback(() => speaker.stop(), [speaker]);
  const onBarge = useCallback(() => speaker.stop(true), [speaker]); // 학생이 말을 덮어 끊음 — 끼어들기로 센다
  const ca = useCallback(() => speaker.ca, [speaker]);
  const speak = useCallback((text: string) => speaker.speak(text, lang), [speaker, lang]);

  // 화면을 떠나면 말을 멈추고 마이크를 닫는다
  useEffect(() => () => speaker.dispose(), [speaker]);
  useEffect(() => () => barge.dispose(), [barge]);

  // 끼어들기 감지: 튜터가 말하는 동안만
  useEffect(() => {
    if (!speaking || !micOn || !canListen) return;
    return barge.watch(speaker, onBarge);
  }, [speaking, micOn, canListen, onBarge, barge, speaker]);

  // 음성 인식: 튜터가 말하는 동안은 끈다 (반이중)
  const running = canListen && micOn && !hold && !thinking && !speaking;
  useEffect(() => {
    const Ctor = recognizerCtor();
    if (!running || !Ctor) return;
    const listener = new SpeechListener(Ctor, lang, speaker, {
      onInterim: setInterim,
      onFinal: (text) => onFinalRef.current(text),
      onFatal: (text) => { setError(text); setMicOn(false); },
    });
    setError('');
    listener.start();
    return () => listener.stop();
  }, [running, lang, speaker]);

  const toggleMic = useCallback(() => {
    if (!canListen) return;
    setError('');
    setMicOn((on) => !on);
  }, [canListen]);

  const state: VoiceState = speaking
    ? 'speaking'
    : thinking
      ? 'thinking'
      : !canListen
        ? 'unsupported'
        : !micOn
          ? 'muted'
          : 'listening';

  return {
    state, canListen, canSpeak: true, micOn, held: canListen && micOn && hold,
    toggleMic, interim, speak, stop, endedId, error, ca,
  };
}

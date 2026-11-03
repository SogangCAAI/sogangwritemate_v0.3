// 끼어들기 감지 — 튜터가 말하는 동안만, 메아리 제거(echoCancellation)가 걸린 마이크의 소리 크기(RMS)로 잡는다.
// 문턱을 일정 시간 넘게 이어지면 학생이 말을 시작한 것으로 보고 onBarge (튜터 멈춤 → 듣기 시작).
// 서버 TTS는 <audio>라 메아리 제거가 잘 되고, speechSynthesis는 OS가 재생해 못 걸러서 문턱을 높인다.
import type { TutorSpeaker } from './TutorSpeaker';

const BARGE = { server: 0.03, browser: 0.1 } as const;
const BARGE_HOLD_MS = 300;
const BARGE_ONSET_MS = 400; // 재생 시작 직후의 튀는 소리는 무시한다
const BARGE_POLL_MS = 50;

export class BargeInDetector {
  private stream: Promise<MediaStream | null> | null = null; // 마이크는 처음 한 번만 연다

  // 지켜보기 시작 — 돌려준 함수로 멈춘다
  watch(speaker: TutorSpeaker, onBarge: () => void): () => void {
    if (!navigator.mediaDevices?.getUserMedia) return () => {};
    this.stream ??= navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .catch(() => null); // 권한이 없으면 끼어들기 감지 없이 반이중으로만 — '튜터 말 멈추기' 버튼은 남는다
    let alive = true;
    let ctx: AudioContext | null = null;
    let poll: ReturnType<typeof setInterval> | undefined;
    void this.stream.then((stream) => {
      if (!alive || !stream) return;
      ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      let loudSince = 0;
      poll = setInterval(() => {
        if (Date.now() - speaker.startedAt < BARGE_ONSET_MS) return;
        analyser.getFloatTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((sum, v) => sum + v * v, 0) / buf.length);
        if (rms < BARGE[speaker.mode]) { loudSince = 0; return; }
        loudSince ||= Date.now();
        if (Date.now() - loudSince >= BARGE_HOLD_MS) onBarge(); // 학생이 말을 시작했다 → 튜터 멈춤, 듣기 시작
      }, BARGE_POLL_MS);
    });
    return () => {
      alive = false;
      clearInterval(poll);
      void ctx?.close();
    };
  }

  // 화면을 떠날 때 마이크를 닫는다
  dispose(): void {
    void this.stream?.then((s) => s?.getTracks().forEach((t) => t.stop()));
  }
}

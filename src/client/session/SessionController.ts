// 세션 진행 — 화면 밖의 일: 턴·재평가 호출, 대화 기록, 튜터 말 읽어 주기, 쉼 이벤트를 보낼 때 고르기.
// 상태는 서버가 들고 있지 않다: 매 턴 지금 상태를 보내고 새 상태를 받는다.
// 화면 상태(SessionView)는 바뀔 때마다 새 객체로 바꿔 끼우고 구독자에게 알린다 (useSyncExternalStore).
import type { CaCounts, SessionState, Task } from '../../state';
import type { ApiClient, TurnResult } from '../ApiClient';
import { errorText } from '../ApiClient';
import type { Line, Start, StudentEvent } from '../types';

// '쉼' — 브리핑 파트는 튜터 말이 끝나고 이만큼 조용하면 다음으로 간다
const AFTER_SPEECH_MS = 1000;
// 소리로 말하지 못했을 때(음성 합성 없음)의 쉼 — 읽을 시간을 준다
const readingPause = (said: string) => 1500 + said.length * 45;

export interface SessionView {
  readonly state: SessionState;
  readonly log: readonly Line[];
  readonly paragraphs: readonly string[];
  readonly origin: readonly (number | null)[]; // 지금 문단 i가 처음 글의 몇 번째였나 (0부터) — 새로 더한 문단은 null. 문단을 더하거나 지우면 번호가 밀린다
  readonly awaitPause: boolean; // 서버가 쉼 이벤트를 기다린다
  readonly busy: boolean;
  readonly error: string;
  readonly sayId: number; // 지금 튜터 줄의 음성 번호 (0 = 소리로 말하지 않음)
}

// 컨트롤러가 쓰는 음성 쪽 — 말하기(줄 번호를 돌려줌)와 멈추기, 끼어들기 집계
export interface VoiceOut {
  speak: (text: string) => number;
  stop: () => void;
  ca?: () => CaCounts;
}

// 쉼을 보낼지 고를 때 화면에서 알아야 하는 것
export interface PauseInputs { draft: string; interim: string; endedId: number }

export class SessionController {
  private view: SessionView;
  private readonly listeners = new Set<() => void>();
  private voice: VoiceOut = { speak: () => 0, stop: () => {} };
  private inFlight = false; // 요청이 겹치지 않게 — 화면 상태(busy)보다 먼저 바뀐다

  constructor(private readonly start: Start, private readonly api: ApiClient) {
    this.view = {
      state: start.state,
      log: start.say ? [{ who: 'tutor', text: start.say }] : [],
      paragraphs: start.paragraphs,
      origin: start.paragraphs.map((_, i) => i),
      awaitPause: start.awaitPause,
      busy: false,
      error: '',
      sayId: 0,
    };
  }

  // ── 구독 (useSyncExternalStore) ──
  readonly subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  readonly snapshot = (): SessionView => this.view;

  attachVoice(voice: VoiceOut): void {
    this.voice = voice;
  }

  // 첫 진단의 말을 소리로 — 시작하기를 누른 직후라 브라우저가 소리를 허용한다
  speakOpening(): void {
    if (this.start.say) this.speakLine(this.start.say);
  }

  // 학생의 말(또는 쉼) → /api/turn
  async send(event: StudentEvent): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    const history = this.view.log; // 지금 말은 빼고 보낸다 (event.text로 따로 간다)
    this.set({ busy: true, error: '', awaitPause: false });
    if (event.kind === 'say') {
      this.voice.stop(); // 학생이 말하면 튜터는 말을 멈춘다
      this.set({ log: [...this.view.log, { who: 'student', text: event.text }] });
    }
    try {
      const { state, paragraphs } = this.view;
      const ca = this.voice.ca?.() ?? { bargeIns: 0, botTurns: 0 }; // 자주 끼어들면 서버가 튜터 말을 한 문장으로 줄인다
      this.apply(await this.api.turn({ state, context: this.context(paragraphs), history, event, ca }));
    } catch (e) {
      this.set({ error: errorText(e) });
    } finally {
      this.inFlight = false;
      this.set({ busy: false });
    }
  }

  // 학생이 문단을 고쳐 저장 → /api/evaluate. 저장되면 true
  async saveEdit(paragraph: number, text: string): Promise<boolean> {
    if (this.inFlight) return false;
    this.inFlight = true;
    this.set({ busy: true, error: '' });
    try {
      const originals = this.originals();
      const r = await this.api.evaluate({
        state: this.view.state, paragraph, original: originals[paragraph - 1] ?? '', edited: text,
        context: this.context(this.view.paragraphs), // 앞뒤 문단·이력서 참고용 (서버가 고친 문단을 바꿔 넣는다)
        originals, // 처음 글을 지금 번호에 맞춰 (더한 문단은 '')
      });
      this.set({ paragraphs: this.view.paragraphs.map((p, i) => (i === paragraph - 1 ? text : p)) });
      this.apply(r);
      return true;
    } catch (e) {
      this.set({ error: errorText(e) });
      return false;
    } finally {
      this.inFlight = false;
      this.set({ busy: false });
    }
  }

  // ── 문단 더하기·지우기 (구조 과제, 2026-11-16) — 서버 호출 없이 화면 상태와 과제의 문단 번호를 함께 민다 ──

  // after 뒤에 빈 문단을 하나 넣는다 (0 = 맨 앞). 그 뒤 문단을 가리키던 과제·화제의 번호가 1씩 밀린다
  insertParagraph(after: number): void {
    if (this.inFlight || this.view.paragraphs.length >= 20) return;
    const at = Math.max(0, Math.min(after, this.view.paragraphs.length));
    const paragraphs = [...this.view.paragraphs.slice(0, at), '', ...this.view.paragraphs.slice(at)];
    const origin = [...this.view.origin.slice(0, at), null, ...this.view.origin.slice(at)];
    this.set({ paragraphs, origin, state: SessionController.shiftState(this.view.state, (n) => (n > at ? n + 1 : n)) });
  }

  // 빈 문단만 지운다. 과제가 가리키는 문단이면 지우지 않는다 (버튼도 막는다 — canDelete)
  deleteParagraph(paragraph: number): void {
    if (this.inFlight || !this.canDelete(paragraph)) return;
    const i = paragraph - 1;
    const paragraphs = this.view.paragraphs.filter((_, k) => k !== i);
    const origin = this.view.origin.filter((_, k) => k !== i);
    this.set({ paragraphs, origin, state: SessionController.shiftState(this.view.state, (n) => (n > paragraph ? n - 1 : n)) });
  }

  // 지울 수 있나 — 문단이 둘 이상이고, 끝나지 않은 과제가 가리키는 문단이 아닐 때 (비웠는지는 화면이 본다)
  canDelete(paragraph: number): boolean {
    if (this.view.paragraphs[paragraph - 1] === undefined || this.view.paragraphs.length <= 1) return false;
    return !this.view.state.tasks.some((t) => t.status !== 'done' && t.status !== 'skipped' && (t.target.paragraphs ?? [t.target.paragraph]).includes(paragraph));
  }

  // 처음 글을 지금 문단 번호에 맞춰 (더한 문단은 '')
  private originals(): string[] {
    return this.view.origin.map((o) => (o === null ? '' : this.start.paragraphs[o] ?? ''));
  }

  private context(paragraphs: readonly string[]) {
    return { posting: this.start.posting, paragraphs, resume: this.start.resume };
  }

  private static shiftState(s: SessionState, f: (n: number) => number): SessionState {
    const task = (t: Task): Task => ({
      ...t,
      target: { ...t.target, paragraph: f(t.target.paragraph), ...(t.target.paragraphs ? { paragraphs: t.target.paragraphs.map(f) } : {}) },
    });
    return { ...s, tasks: s.tasks.map(task), topic: s.topic.paragraph === undefined ? s.topic : { ...s.topic, paragraph: f(s.topic.paragraph) } };
  }

  // 쉼을 보낼 때까지 기다릴 시간 (보내지 않을 때는 null):
  // 튜터 말이 끝까지 재생된 뒤(또는 소리가 없으면 읽을 시간 뒤) 학생이 조용하면
  pauseDelay({ draft, interim, endedId }: PauseInputs): number | null {
    const v = this.view;
    if (!v.awaitPause || v.busy || draft || interim) return null;
    const spoken = v.sayId > 0;
    if (spoken && endedId !== v.sayId) return null; // 아직 말하는 중
    const lastTutor = [...v.log].reverse().find((l) => l.who === 'tutor')?.text ?? '';
    return spoken ? AFTER_SPEECH_MS : readingPause(lastTutor);
  }

  private apply(r: TurnResult): void {
    this.set({ state: r.state, awaitPause: r.awaitPause });
    if (r.say) {
      this.set({ log: [...this.view.log, { who: 'tutor', text: r.say }] });
      this.speakLine(r.say);
    }
  }

  private speakLine(text: string): void {
    this.set({ sayId: this.voice.speak(text) });
  }

  private set(patch: Partial<SessionView>): void {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((fn) => fn());
  }
}

// 함수 호출 — 봉투 {ok, data, error}를 풀고, 실패는 사용자에게 보여 줄 문장으로 던진다
import type { Rubric } from '../rubric';
import type { CaCounts, Lang, SessionState } from '../state';
import type { Line, StudentEvent } from './types';

export interface TurnResult {
  state: SessionState;
  say: string | null;
  awaitPause: boolean;
}

export interface DiagnoseResult extends TurnResult {
  rubric: Rubric;
  strengths: string;
}

export interface SummaryResult {
  report: string;
  nextSteps: string[];
}

interface Context { posting: string; paragraphs: readonly string[] }

export class ApiClient {
  diagnose(body: { lang: Lang; posting: string; paragraphs: readonly string[]; resume?: string }): Promise<DiagnoseResult> {
    return this.post('/api/diagnose', body);
  }

  turn(body: { state: SessionState; context: Context; history: readonly Line[]; event: StudentEvent; ca?: CaCounts }): Promise<TurnResult> {
    return this.post('/api/turn', body);
  }

  evaluate(body: { state: SessionState; paragraph: number; original: string; edited: string }): Promise<TurnResult> {
    return this.post('/api/evaluate', body);
  }

  summary(body: { state: SessionState; original: readonly string[]; final: readonly string[]; posting: string }): Promise<SummaryResult> {
    return this.post('/api/summary', body);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    } catch {
      throw new Error('서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
    }
    const env = (await res.json().catch(() => null)) as { ok: boolean; data: T; error: string | null } | null;
    if (!env) throw new Error(`서버 응답을 읽지 못했어요 (${res.status}).`);
    if (!env.ok) throw new Error(env.error ?? '알 수 없는 오류가 났어요.');
    return env.data;
  }
}

export const api = new ApiClient();

export const errorText = (e: unknown) => (e instanceof Error ? e.message : '알 수 없는 오류가 났어요.');

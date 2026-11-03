// 함수 호출 — 봉투 {ok, data, error}를 풀고, 실패는 사용자에게 보여 줄 문장으로 던진다
import type { SessionState } from '../state';

export interface TurnResult {
  state: SessionState;
  say: string | null;
  awaitPause: boolean;
}

export interface SummaryResult {
  report: string;
  nextSteps: string[];
}

export async function post<T>(path: string, body: unknown): Promise<T> {
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

export const errorText = (e: unknown) => (e instanceof Error ? e.message : '알 수 없는 오류가 났어요.');

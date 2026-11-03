// Supabase 저장 — 서비스 키는 서버 환경 변수에서만. 설정이 없으면 경고 한 번 남기고 건너뛴다.
// 저장 실패는 대화를 막지 않는다 (로그만).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Move } from './state';

let client: SupabaseClient | null | undefined;

function db(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) console.warn('[db] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 없음 — 저장을 건너뜁니다');
  client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return client;
}

async function write(table: string, row: Record<string, unknown>, upsert = false): Promise<void> {
  const c = db();
  if (!c) return;
  const q = upsert ? c.from(table).upsert(row) : c.from(table).insert(row);
  const { error } = await q;
  if (error) console.error(`[db] ${table} 저장 실패:`, error.message);
}

export function saveSession(row: {
  id: string; lang: string; posting: string; essay: string[]; tasks: unknown;
  final_essay?: string[]; summary?: unknown; helped?: boolean | null; ended_at?: string;
}): Promise<void> {
  return write('sessions', row, true);
}

export type TurnRow = {
  session_id: string;
  kind: 'say' | 'pause' | 'edit';
  user_text: string | null;
  agent_text: string | null;
  user_action: Move | null;
  agent_action: string;
  apr: string | null;
  judge: unknown;
  task_id: string | null;
  latency_ms: number;
};

export function saveTurn(row: TurnRow): Promise<void> {
  return write('turns', row);
}

// 시퀀스 안의 자리 (NCF 9.1) — 로그가 스스로 라벨링되도록
export function aprOf(move: Move | null): string | null {
  if (!move) return null;
  if (move === 'REPEAT_REQ' || move === 'PARAPHRASE_REQ' || move === 'EXAMPLE_REQ' || move === 'UNCLEAR') return 'repair';
  if (move === 'USER_INQUIRY' || move === 'EXEMPLAR_REQ') return 'insert';
  if (move === 'ANSWER' || move === 'ACCEPT' || move === 'REJECT') return 'B2PP';
  if (move === 'CLOSER') return 'post';
  if (move === 'CONTINUER') return 'continuer';
  return 'manage';
}

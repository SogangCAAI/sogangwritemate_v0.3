// Supabase 저장 — 서비스 키는 서버 환경 변수에서만. 설정이 없으면 경고 한 번 남기고 건너뛴다.
// 저장 실패는 대화를 막지 않는다 — 로그를 남기고 오류 문장을 돌려준다 (진단 응답의 saved=false → 화면 띠, /api/health → 원인).
// 흔한 원인 (2026-11-16): sessions 표에 rubric·final_rubric 열이 없으면(마이그레이션 안 함) 세션 저장이 실패하고,
// 그러면 turns는 외래키(session_id) 때문에 전부 실패한다 — 한 열이 빠지면 기록이 통째로 안 남는다.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Move } from '../../state';

export interface SessionRow {
  id: string; lang: string; posting: string; essay: readonly string[]; tasks: unknown;
  final_essay?: readonly string[]; summary?: unknown; helped?: boolean | null; ended_at?: string;
  rubric?: unknown; // 첫 진단 {rubric, strengths} — 세션 시작 때만 쓴다
  final_rubric?: unknown; // 끝 재진단 {rubric, strengths} — 세션 끝에만 쓴다 (실패하면 null)
}

export type TurnRow = {
  session_id: string;
  kind: 'say' | 'pause' | 'edit';
  user_text: string | null;
  agent_text: string | null;
  user_action: Move | null;
  agent_action: string;
  apr: string | null;
  judge: unknown; // 판정 + unquoted(글에 없는 인용) + ca{bargeIns, botTurns, rate, level} (끼어들기, v2 caJudge 층1)
  task_id: string | null;
  latency_ms: number;
};

export class SessionStore {
  private client: SupabaseClient | null | undefined; // undefined = 아직 환경 변수를 읽지 않음

  /** 성공이면 null, 실패면 오류 문장 (설정이 없어 건너뛰면 'not configured') */
  saveSession(row: SessionRow): Promise<string | null> {
    return this.write('sessions', row, true);
  }

  saveTurn(row: TurnRow): Promise<string | null> {
    return this.write('turns', row);
  }

  /** /api/health — 환경 변수와 표·열이 갖춰졌나, 기록이 쌓이고 있나 */
  async health(): Promise<DbHealth> {
    const c = this.db();
    if (!c) return { configured: false, reachable: false, missing: [], sessions: null, lastSessionAt: null, error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 없음' };
    const missing: string[] = [];
    let error: string | null = null;
    // 코드가 쓰는 열을 하나씩 — 없는 열은 PostgREST가 "column … does not exist"로 알려 준다
    for (const [table, cols] of [['sessions', SESSION_COLS], ['turns', TURN_COLS]] as const) {
      const r = await c.from(table).select(cols.join(',')).limit(1);
      if (!r.error) continue;
      const m = /column\s+(?:\w+\.)?"?(\w+)"?\s+does not exist/i.exec(r.error.message);
      if (m) missing.push(`${table}.${m[1]}`);
      else if (/relation .* does not exist|Could not find the table/i.test(r.error.message)) missing.push(`${table} (표 없음)`);
      else error = r.error.message;
    }
    const count = await c.from('sessions').select('created_at', { count: 'exact', head: false }).order('created_at', { ascending: false }).limit(1);
    const reachable = !error && !count.error;
    if (count.error && !error) error = count.error.message;
    return {
      configured: true, reachable, missing, sessions: count.count ?? null,
      lastSessionAt: (count.data?.[0] as { created_at?: string } | undefined)?.created_at ?? null, error,
    };
  }

  // 시퀀스 안의 자리 (NCF 9.1) — 로그가 스스로 라벨링되도록
  static aprOf(move: Move | null): string | null {
    if (!move) return null;
    if (move === 'REPEAT_REQ' || move === 'PARAPHRASE_REQ' || move === 'EXAMPLE_REQ' || move === 'UNCLEAR') return 'repair';
    if (move === 'USER_INQUIRY' || move === 'EXEMPLAR_REQ') return 'insert';
    if (move === 'ANSWER' || move === 'ACCEPT' || move === 'REJECT' || move === 'CONFUSED') return 'B2PP'; // 막힘 = 비선호 둘째 짝
    // OFF_GOAL(다른 요청)은 진행 관리 — 아래 manage
    if (move === 'CLOSER') return 'post';
    if (move === 'CONTINUER') return 'continuer';
    return 'manage';
  }

  // 처음 쓸 때 한 번만 환경 변수를 읽는다
  private db(): SupabaseClient | null {
    if (this.client !== undefined) return this.client;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) console.warn('[db] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 없음 — 저장을 건너뜁니다');
    this.client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
    return this.client;
  }

  private async write(table: string, row: object, upsert = false): Promise<string | null> {
    const c = this.db();
    if (!c) return 'not configured';
    const q = upsert ? c.from(table).upsert(row) : c.from(table).insert(row);
    const { error } = await q;
    if (!error) return null;
    console.error(`[db] ${table} 저장 실패:`, error.message);
    return error.message;
  }
}

// 코드가 쓰는 열 — schema.sql · migrations와 짝. 열을 더하면 여기도 더한다 (health가 빠진 열을 찾아 준다)
const SESSION_COLS = ['id', 'lang', 'posting', 'essay', 'final_essay', 'tasks', 'summary', 'rubric', 'final_rubric', 'helped', 'ended_at'] as const;
const TURN_COLS = ['id', 'session_id', 'kind', 'user_text', 'agent_text', 'user_action', 'agent_action', 'apr', 'judge', 'task_id', 'latency_ms'] as const;

export interface DbHealth {
  configured: boolean; // 환경 변수가 있나
  reachable: boolean; // 연결·조회가 되나
  missing: string[]; // 없는 열·표 — 비어 있어야 정상
  sessions: number | null; // 쌓인 세션 수
  lastSessionAt: string | null; // 마지막 세션 시각
  error: string | null;
}

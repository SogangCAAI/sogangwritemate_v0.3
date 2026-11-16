// /api/health — 배포가 제대로 됐나 한눈에: 환경 변수(이름만, 값은 안 보임) · Supabase 표·열 · 쌓인 세션 수
// 브라우저에서 https://<사이트>/api/health 를 열면 된다. "기록이 안 남는다"의 첫 점검 자리 (2026-11-16)
import { Handler, ok } from '../http/Handler';
import type { SessionStore } from '../store/SessionStore';
import { MODELS } from '../llm/LlmClient';

export class HealthHandler extends Handler {
  constructor(private readonly store: SessionStore, private readonly version: string) {
    super('health');
  }

  protected async run(): Promise<Response> {
    const db = await this.store.health();
    const env = {
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      GOOGLE_TTS_API_KEY: !!process.env.GOOGLE_TTS_API_KEY,
    };
    return ok({ version: this.version, models: MODELS, env, db, fix: HealthHandler.advice(env, db) });
  }

  // 무엇을 하면 되는지 한 줄 — 비개발자가 읽는다
  static advice(env: Record<string, boolean>, db: Awaited<ReturnType<SessionStore['health']>>): string[] {
    const out: string[] = [];
    if (!env.ANTHROPIC_API_KEY) out.push('ANTHROPIC_API_KEY가 없습니다 — Netlify 환경 변수에 넣고 다시 배포하세요.');
    if (!db.configured) out.push('SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 없어 기록을 건너뜁니다 — Netlify 환경 변수에 둘 다 넣고 다시 배포하세요 (service_role 키, anon 키가 아닙니다).');
    else if (db.missing.length) out.push(`Supabase에 없는 열·표: ${db.missing.join(', ')} — Supabase SQL 편집기에서 supabase/migrations/*.sql을 날짜 순서로 실행하세요 (표가 없으면 supabase/schema.sql 전체). sessions 열이 하나라도 없으면 세션 저장이 실패하고 turns도 전부 외래키로 실패합니다.`);
    else if (!db.reachable) out.push(`Supabase 연결·조회 실패: ${db.error} — URL·키를 확인하세요.`);
    if (!out.length) out.push(db.sessions ? `정상 — 세션 ${db.sessions}개, 마지막 ${db.lastSessionAt}` : '정상 — 아직 세션이 없습니다. 한 세션을 돌리고 다시 열어 보세요.');
    return out;
  }
}

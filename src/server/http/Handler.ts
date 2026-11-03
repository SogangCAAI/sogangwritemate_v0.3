// 함수 공통 — 응답 봉투 {ok, data, error}와, 오류를 사용자용 문장으로 바꾸는 바탕 클래스. 자세한 내용은 서버 로그에만
import { LlmError } from '../llm/LlmClient';
import { ValidationError } from '../parse/fields';

export function ok(data: unknown): Response {
  return Response.json({ ok: true, data, error: null });
}

export function fail(status: number, error: string): Response {
  return Response.json({ ok: false, data: null, error }, { status });
}

export abstract class Handler {
  constructor(private readonly name: string) {}

  // Netlify 함수의 본문 — 어떤 오류도 봉투로 돌려준다
  async handle(req: Request): Promise<Response> {
    try {
      return await this.run(req);
    } catch (e) {
      if (e instanceof ValidationError) return fail(400, e.message);
      if (e instanceof LlmError) {
        console.error(`[${this.name}]`, e.message);
        return fail(502, e.userMessage);
      }
      console.error(`[${this.name}] 예상하지 못한 오류`, e);
      return fail(500, '서버에서 문제가 생겼어요. 잠시 뒤 다시 해 주세요.');
    }
  }

  protected abstract run(req: Request): Promise<Response>;
}

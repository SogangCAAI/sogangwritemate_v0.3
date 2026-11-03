// 함수 공통 — 응답 봉투 {ok, data, error}와 요청 본문 읽기
import { LlmError } from './llm';
import { ValidationError } from './validate';

export function ok(data: unknown): Response {
  return Response.json({ ok: true, data, error: null });
}

export function fail(status: number, error: string): Response {
  return Response.json({ ok: false, data: null, error }, { status });
}

export async function readBody(req: Request): Promise<unknown> {
  if (req.method !== 'POST') throw new ValidationError('POST만 받아요.');
  try {
    return await req.json();
  } catch {
    throw new ValidationError('요청 본문이 JSON이 아니에요.');
  }
}

// 함수 본문을 감싸 오류를 사용자용 문장으로 바꾼다. 자세한 내용은 서버 로그에만
export async function handle(name: string, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof ValidationError) return fail(400, e.message);
    if (e instanceof LlmError) {
      console.error(`[${name}]`, e.message);
      return fail(502, e.userMessage);
    }
    console.error(`[${name}] 예상하지 못한 오류`, e);
    return fail(500, '서버에서 문제가 생겼어요. 잠시 뒤 다시 해 주세요.');
  }
}

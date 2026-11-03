// Anthropic Messages 호출 하나 — 도구 사용을 강제해 구조화된 출력만 받는다. 서버 전용.
// temperature는 보내지 않는다 (5.x 모델은 기본값이 아니면 거절한다).

export const MODELS = {
  turn: 'claude-haiku-5-5',
  evaluate: 'claude-haiku-5-5',
  diagnose: 'claude-sonnet-5-5',
  summary: 'claude-sonnet-5-5',
} as const;

export interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export class LlmError extends Error {
  constructor(message: string, readonly userMessage: string) {
    super(message);
    this.name = 'LlmError';
  }
}

// Netlify 동기 함수 상한(26초) 안에서 끝나도록
const TIMEOUT_MS = { haiku: 12_000, sonnet: 22_000 };

export async function callTool(a: {
  model: string; system: string; user: string; tool: Tool; maxTokens: number;
}): Promise<unknown> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new LlmError('ANTHROPIC_API_KEY 없음', '서버 설정이 아직 안 됐어요. 관리자에게 알려 주세요.');
  const timeout = a.model.includes('haiku') ? TIMEOUT_MS.haiku : TIMEOUT_MS.sonnet;

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: a.model, max_tokens: a.maxTokens, system: a.system,
        tools: [a.tool], tool_choice: { type: 'tool', name: a.tool.name },
        messages: [{ role: 'user', content: a.user }],
      }),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === 'TimeoutError';
    throw new LlmError(`LLM ${timedOut ? '시간 초과' : '연결 실패'}: ${String(e)}`,
      timedOut ? '튜터가 생각이 길어졌어요. 다시 보내 주세요.' : '튜터에게 연결하지 못했어요. 잠시 뒤 다시 해 주세요.');
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    const busy = res.status === 429 || res.status === 529;
    throw new LlmError(`LLM HTTP ${res.status}: ${body}`,
      busy ? '지금 요청이 많아요. 잠시 뒤 다시 보내 주세요.' : '튜터가 답을 만들지 못했어요. 다시 보내 주세요.');
  }
  const data = (await res.json()) as { content?: { type: string; input?: unknown }[] };
  const block = data.content?.find((b) => b.type === 'tool_use');
  if (!block) throw new LlmError('tool_use 블록 없음', '튜터가 답을 만들지 못했어요. 다시 보내 주세요.');
  return block.input;
}

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
const THINKING_ROOM = 6000;

// 구조화된 출력은 모든 object에 additionalProperties:false를 요구하고 minItems 2 이상·maxItems를 받지 않는다.
// 스키마마다 고치지 않고 여기서 한 번에 — 개수는 validate.ts가 응답 뒤에 검사한다
const UNSUPPORTED = new Set(['minItems', 'maxItems']);
function closed(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(closed);
  if (!s || typeof s !== 'object') return s;
  const o = Object.fromEntries(Object.entries(s).filter(([k]) => !UNSUPPORTED.has(k)).map(([k, v]) => [k, closed(v)]));
  return o.type === 'object' ? { ...o, additionalProperties: false } : o;
}

export async function callTool(a: {
  model: string; system: string; user: string; tool: Tool; maxTokens: number;
}): Promise<unknown> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new LlmError('ANTHROPIC_API_KEY 없음', '서버 설정이 아직 안 됐어요. 관리자에게 알려 주세요.');
  const isHaiku = a.model.includes('haiku');
  const timeout = isHaiku ? TIMEOUT_MS.haiku : TIMEOUT_MS.sonnet;

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      // 강제 tool_choice는 Sonnet 5.5가 400으로 거절한다 — 구조화된 출력(json_schema)으로 모든 모델을 같은 길로
      body: JSON.stringify({
        // 5.5 모델은 생각(thinking)이 늘 켜져 있고 그 토큰도 max_tokens에 든다 — 출력 상한에 생각 몫을 더한다
        model: a.model, max_tokens: a.maxTokens + THINKING_ROOM, system: a.system,
        output_config: {
          effort: isHaiku ? 'low' : 'medium', // 대화 지연이 먼저 — 진단·요약만 한 단계 깊게
          format: { type: 'json_schema', schema: closed(a.tool.input_schema) },
        },
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
  const data = (await res.json()) as { stop_reason?: string; content?: { type: string; text?: string }[] };
  if (data.stop_reason === 'refusal') throw new LlmError('모델 거절(refusal)', '튜터가 이 요청에는 답하지 못해요. 다른 말로 다시 보내 주세요.');
  const text = data.content?.find((b) => b.type === 'text')?.text;
  if (!text) throw new LlmError(`text 블록 없음 (stop_reason=${data.stop_reason})`, '튜터가 답을 만들지 못했어요. 다시 보내 주세요.');
  try {
    return JSON.parse(text);
  } catch {
    throw new LlmError(`JSON 아님 (stop_reason=${data.stop_reason}): ${text.slice(0, 200)}`, '튜터가 답을 만들지 못했어요. 다시 보내 주세요.');
  }
}

// LlmClient — thinking은 끈다. 끄지 못하는 모델(400)만 adaptive로 다시 부르고 기억한다 (2026-11-16)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LlmClient, LlmError } from '../src/server/llm/LlmClient';

const TOOL = { name: 't', description: '', input_schema: { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } };
const okBody = JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"a":"x"}' }] });

function withFetch(handler: (body: Record<string, unknown>) => Response, run: () => Promise<void>): Promise<void> {
  const real = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => handler(JSON.parse(String(init?.body)))) as typeof fetch;
  return run().finally(() => { globalThis.fetch = real; });
}

test('Haiku 호출은 thinking disabled, max_tokens에 생각 몫을 더하지 않는다', () =>
  withFetch((b) => {
    assert.deepEqual(b.thinking, { type: 'disabled' });
    assert.equal(b.max_tokens, 700);
    assert.equal((b.output_config as { effort: string }).effort, 'low');
    return new Response(okBody, { status: 200 });
  }, async () => {
    const r = await new LlmClient(() => 'k').call({ model: 'claude-haiku-5-5', system: 's', user: 'u', tool: TOOL, maxTokens: 700 });
    assert.deepEqual(r, { a: 'x' });
  }));

test('모델이 thinking disabled를 400으로 거절하면 adaptive로 한 번 더 부르고, 다음부터는 바로 adaptive', () => {
  const seen: string[] = [];
  return withFetch((b) => {
    const t = (b.thinking as { type: string }).type; seen.push(t);
    if (t === 'disabled') return new Response(JSON.stringify({ error: { message: 'thinking.type: disabled is not supported' } }), { status: 400 });
    assert.equal(b.max_tokens, 3000 + 6000);
    return new Response(okBody, { status: 200 });
  }, async () => {
    const llm = new LlmClient(() => 'k');
    const call = { model: 'claude-sonnet-5-5', system: 's', user: 'u', tool: TOOL, maxTokens: 3000 };
    assert.deepEqual(await llm.call(call), { a: 'x' });
    assert.deepEqual(await llm.call(call), { a: 'x' });
    assert.deepEqual(seen, ['disabled', 'adaptive', 'adaptive']);
  });
});

test('thinking과 무관한 400은 그대로 오류', () =>
  withFetch(() => new Response(JSON.stringify({ error: { message: 'max_tokens too large' } }), { status: 400 }), async () => {
    await assert.rejects(new LlmClient(() => 'k').call({ model: 'claude-sonnet-5-5', system: 's', user: 'u', tool: TOOL, maxTokens: 10 }), (e: unknown) => e instanceof LlmError && /HTTP 400/.test(e.message));
  }));

// 학생이 대상 문단을 고쳐 저장했을 때 — 재평가(Haiku 1회, 시범 문장 그대로면 0회) → next()
import type { Config } from '@netlify/functions';
import { capSentences } from '../../src/checks';
import { saveTurn } from '../../src/db';
import { editNeedsEval, next, wantsPause } from '../../src/decide';
import { handle, ok, readBody } from '../../src/http';
import { callTool, MODELS, type Tool } from '../../src/llm';
import { fill, langName, loadPrompt } from '../../src/prompt';
import { fromLlm } from '../../src/respond';
import { activeTask, type Verdict } from '../../src/state';
import { num, obj, parseState, parseVerdict, str, ValidationError } from '../../src/validate';

const TOOL: Tool = {
  name: 'evaluate',
  description: '고친 문단이 기준을 원래 문단보다 더 충족하는지',
  input_schema: {
    type: 'object',
    properties: { better: { type: 'boolean' }, reason: { type: 'string' } },
    required: ['better', 'reason'],
  },
};

export default (req: Request) =>
  handle('evaluate', async () => {
    const t0 = Date.now();
    const b = obj(await readBody(req), 'body');
    const state = parseState(b.state);
    const paragraph = num(b.paragraph, 'paragraph');
    if (!Number.isInteger(paragraph) || paragraph < 1) throw new ValidationError('paragraph: 문단 번호가 잘못됐어요.');
    const original = str(b.original, 'original');
    const edited = str(b.edited, 'edited');

    let verdict: Verdict | null = null;
    const task = activeTask(state);
    if (task && editNeedsEval(state, paragraph, edited)) {
      const raw = await callTool({
        model: MODELS.evaluate, maxTokens: 400, tool: TOOL,
        system: 'You judge one paragraph revision against one criterion.',
        user: fill(loadPrompt('evaluate.md'), { doneWhen: task.doneWhen, original, edited, lang: langName(state.lang) }),
      });
      const v = fromLlm('evaluate', () => parseVerdict(raw));
      verdict = { ...v, reason: capSentences(v.reason, 2) };
    }

    const o = next(state, null, { kind: 'edit', paragraph, after: edited, verdict, now: Date.now() });
    await saveTurn({
      session_id: state.id, kind: 'edit', user_text: edited, agent_text: o.say,
      user_action: null, agent_action: o.agentAction, apr: null, judge: verdict,
      task_id: task?.id ?? null, latency_ms: Date.now() - t0,
    });
    return ok({ state: o.state, say: o.say, verdict, awaitPause: wantsPause(o.state) });
  });

export const config: Config = { path: '/api/evaluate' };

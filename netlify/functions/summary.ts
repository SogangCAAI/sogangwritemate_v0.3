// 세션 끝 — 과제 표(코드) + Sonnet 요약 한 번. 표에 없는 성과는 쓰지 않게 한다
import type { Config } from '@netlify/functions';
import { mmss, taskTimeMs } from '../../src/checks';
import { saveSession } from '../../src/db';
import { handle, ok, readBody } from '../../src/http';
import { callTool, MODELS, type Tool } from '../../src/llm';
import { essayText, fill, langName, loadPrompt } from '../../src/prompt';
import { fromLlm } from '../../src/respond';
import { obj, parseState, parseSummary, str, strList } from '../../src/validate';

const TOOL: Tool = {
  name: 'summarize',
  description: '세션 요약',
  input_schema: {
    type: 'object',
    properties: {
      report: { type: 'string' },
      nextSteps: { type: 'array', maxItems: 3, items: { type: 'string' } },
    },
    required: ['report', 'nextSteps'],
  },
};

export default (req: Request) =>
  handle('summary', async () => {
    const b = obj(await readBody(req), 'body');
    const state = parseState(b.state);
    const original = strList(b.original, 'original', 20);
    const final = strList(b.final, 'final', 20);
    const posting = str(b.posting ?? '', 'posting', 6000);
    const now = Date.now();

    const table = state.tasks
      .map((t) => `${t.order}. ${t.goal} | ${t.status} | ${mmss(taskTimeMs(t, now))} | ${t.turns}턴 | 수정 ${t.edits}회${t.fromExemplar ? ' | 시범 문장' : ''} | ${t.evidence ?? '-'}`)
      .join('\n');
    const raw = await callTool({
      model: MODELS.summary, maxTokens: 1000, tool: TOOL,
      system: 'You write an honest end-of-session summary for a student.',
      user: fill(loadPrompt('summary.md'), { lang: langName(state.lang), table, original: essayText(original), final: essayText(final) }),
    });
    const summary = fromLlm('summary', () => parseSummary(raw), raw);

    await saveSession({
      id: state.id, lang: state.lang, posting, essay: original, tasks: state.tasks,
      final_essay: final, summary, helped: state.helped, ended_at: new Date(now).toISOString(),
    });
    return ok(summary);
  });

export const config: Config = { path: '/api/summary' };

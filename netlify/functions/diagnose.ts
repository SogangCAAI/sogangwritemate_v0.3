// 세션 입구 — Sonnet이 과제 3개와 브리핑 3파트를 고르고, 코드가 첫 상태를 만든다
import type { Config } from '@netlify/functions';
import { randomUUID } from 'node:crypto';
import { findCliches } from '../../src/checks';
import { saveSession } from '../../src/db';
import { newSession, wantsPause } from '../../src/decide';
import { handle, ok, readBody } from '../../src/http';
import { callTool, MODELS, type Tool } from '../../src/llm';
import { essayText, fill, langName, loadPrompt, postingText } from '../../src/prompt';
import { fromLlm } from '../../src/respond';
import { LANGS, obj, oneOf, parseContext, parseDiagnosis, str } from '../../src/validate';

const TOOL: Tool = {
  name: 'diagnose',
  description: '과제 3개와 브리핑 3파트',
  input_schema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array', minItems: 3, maxItems: 3,
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['content', 'form'] },
            paragraph: { type: 'integer' },
            keyword: { type: 'string' },
            goal: { type: 'string' },
            doneWhen: { type: 'string' },
            opener: { type: 'string' },
          },
          required: ['kind', 'paragraph', 'keyword', 'goal', 'doneWhen', 'opener'],
        },
      },
      briefing: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string' } },
      assessment: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          claims: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                paragraph: { type: 'integer' },
                claim: { type: 'string' },
                evidence: { type: 'string', enum: ['strong', 'weak', 'none'] },
                note: { type: 'string' },
              },
              required: ['paragraph', 'claim', 'evidence', 'note'],
            },
          },
        },
        required: ['summary', 'claims'],
      },
    },
    required: ['tasks', 'briefing', 'assessment'],
  },
};

export default (req: Request) =>
  handle('diagnose', async () => {
    const b = obj(await readBody(req), 'body');
    const ctx = parseContext(b);
    const lang = oneOf(b.lang, LANGS, 'lang');
    const resume = b.resume === undefined ? '' : str(b.resume, 'resume', 6000);
    const hits = findCliches(ctx.paragraphs);

    const raw = await callTool({
      model: MODELS.diagnose, maxTokens: 1500, tool: TOOL,
      system: 'You plan a 20-minute cover-letter tutoring session.',
      user: fill(loadPrompt('diagnose.md'), {
        lang: langName(lang), posting: postingText(ctx.posting), essay: essayText(ctx.paragraphs), resume,
        cliches: hits.map((h) => `${h.paragraph}문단 "${h.text}" (${h.label})`).join('\n') || '-',
      }),
    });
    const d = fromLlm('diagnose', () => parseDiagnosis(raw, ctx.paragraphs.length), raw);
    const state = newSession({ id: randomUUID(), lang, tasks: d.tasks, briefing: d.briefing, now: Date.now() });

    await saveSession({ id: state.id, lang, posting: ctx.posting, essay: ctx.paragraphs, tasks: state.tasks });
    return ok({ state, say: state.last.played, awaitPause: wantsPause(state), assessment: d.assessment });
  });

export const config: Config = { path: '/api/diagnose' };

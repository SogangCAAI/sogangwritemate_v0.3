// 첫 진단 — Sonnet 한 번이 과제 3개 · 브리핑 3파트 · 평가를 고른다
import { findCliches } from '../../checks';
import type { Lang } from '../../state';
import { LlmClient, MODELS } from '../llm/LlmClient';
import { PromptBook } from '../llm/PromptBook';
import { DIAGNOSE_TOOL, LlmOutputParser, type Diagnosis } from '../parse/LlmOutputParser';
import type { Context } from '../parse/RequestParser';

export class Diagnoser {
  constructor(private readonly llm: LlmClient, private readonly prompts: PromptBook) {}

  async diagnose(ctx: Context, lang: Lang, resume: string): Promise<Diagnosis> {
    const hits = findCliches(ctx.paragraphs);
    const raw = await this.llm.call({
      model: MODELS.diagnose, maxTokens: 1500, tool: DIAGNOSE_TOOL,
      system: 'You plan a 20-minute cover-letter tutoring session.',
      user: this.prompts.render('diagnose.md', {
        lang: PromptBook.langName(lang), posting: PromptBook.postingText(ctx.posting), essay: PromptBook.essayText(ctx.paragraphs), resume,
        cliches: hits.map((h) => `${h.paragraph}문단 "${h.text}" (${h.label})`).join('\n') || '-',
      }),
    });
    return LlmOutputParser.diagnosis(raw, ctx.paragraphs.length);
  }
}

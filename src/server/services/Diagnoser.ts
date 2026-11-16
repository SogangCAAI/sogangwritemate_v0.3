// 첫 진단 — Sonnet 한 번이 채점 루브릭(5축) · 과제 3개 · 브리핑 3파트를 낸다
// 끝 재진단(regrade) — 세션이 끝난 뒤 끝 글을 같은 루브릭으로 다시 매긴다 (요약 화면의 처음/끝 비교, 2026-11-16)
// 글은 src/prompts.ts 2장 — 루브릭(DIAGNOSE.rubric)은 두 프롬프트가 같은 글자를 쓴다
import { findCliches } from '../../checks';
import type { Lang } from '../../state';
import { LlmClient, MODELS } from '../llm/LlmClient';
import { DIAGNOSE, essayText, fill, langName, postingText } from '../../prompts';
import { DIAGNOSE_TOOL, LlmOutputParser, REGRADE_TOOL, type Diagnosis, type Regrade } from '../parse/LlmOutputParser';
import type { Context } from '../parse/RequestParser';

export class Diagnoser {
  constructor(private readonly llm: LlmClient) {}

  async diagnose(ctx: Context, lang: Lang, resume: string): Promise<Diagnosis> {
    const raw = await this.llm.call({
      model: MODELS.diagnose, maxTokens: 3000, tool: DIAGNOSE_TOOL,
      system: DIAGNOSE.system,
      user: Diagnoser.prompt(ctx, lang, resume),
    });
    return LlmOutputParser.diagnosis(raw, ctx.paragraphs, lang);
  }

  // 끝 글만 다시 매긴다 — 과제·브리핑 없음. 처음 글은 주지 않아 비교가 아니라 같은 잣대의 독립 판정이 되게 한다
  async regrade(ctx: Context, lang: Lang, resume: string): Promise<Regrade> {
    const raw = await this.llm.call({
      model: MODELS.diagnose, maxTokens: 2000, tool: REGRADE_TOOL,
      system: DIAGNOSE.regradeSystem,
      user: Diagnoser.regradePrompt(ctx, lang, resume),
    });
    return LlmOutputParser.regrade(raw);
  }

  static prompt(ctx: Context, lang: Lang, resume: string): string {
    return fill(DIAGNOSE.user, Diagnoser.vars(ctx, lang, resume));
  }

  static regradePrompt(ctx: Context, lang: Lang, resume: string): string {
    return fill(DIAGNOSE.regradeUser, Diagnoser.vars(ctx, lang, resume));
  }

  // 두 프롬프트가 같이 쓰는 칸 — 루브릭은 정합성 안내(이력서나 공고가 있나)까지 채워서 넣는다
  private static vars(ctx: Context, lang: Lang, resume: string): Record<string, string> {
    const hits = findCliches(ctx.paragraphs);
    const alignmentNote = ctx.posting || resume ? DIAGNOSE.alignmentNote.withSources : DIAGNOSE.alignmentNote.noSources;
    return {
      lang: langName(lang), posting: postingText(ctx.posting), essay: essayText(ctx.paragraphs), resume,
      rubric: fill(DIAGNOSE.rubric, { alignmentNote }),
      cliches: hits.map((h) => DIAGNOSE.clicheLine(h.paragraph, h.text, h.label)).join('\n') || DIAGNOSE.noCliches,
    };
  }
}

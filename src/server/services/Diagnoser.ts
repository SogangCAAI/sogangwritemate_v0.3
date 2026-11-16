// 첫 진단 — Sonnet 한 번이 채점 루브릭(5축) · 과제 3개 · 브리핑 3파트를 낸다
// 끝 재진단(regrade) — 세션이 끝난 뒤 끝 글을 같은 루브릭으로 다시 매긴다 (요약 화면의 처음/끝 비교, 2026-11-16)
// 루브릭 본문은 src/prompts/rubric.md 하나다 — 두 프롬프트가 같은 글자를 쓴다
import { findCliches } from '../../checks';
import type { Lang } from '../../state';
import { LlmClient, MODELS } from '../llm/LlmClient';
import { PromptBook } from '../llm/PromptBook';
import { DIAGNOSE_TOOL, LlmOutputParser, REGRADE_TOOL, type Diagnosis, type Regrade } from '../parse/LlmOutputParser';
import type { Context } from '../parse/RequestParser';

// 축 3(정합성) 판정 안내 — v2 prompts.ts의 hasAlignmentSources 두 갈래 그대로 (이력서나 공고가 있나)
const ALIGNMENT_NOTE = {
  withSources: "※ 위 참고 자료와 대조하여 판정하십시오. 자료 중 **일부만** 있으면(예: 공고만) 있는 것으로 할 수 있는 판정은 **하고**, 못 한 부분은 그 근거 문면에 무엇을 못 했는지 적으십시오.",
  noSources: "※ 이번 진단에는 이력서와 공고가 모두 없습니다 — 3-b(consistency)는 원고↔대화만으로 볼 수 있는 만큼만 보고, 댈 근거가 없으면 \"판정불가\"로 두십시오. 3-a(transfer)는 **원고만으로도 판정합니다**(지원 업무가 글에 적혀 있으면 그것을 씁니다).",
};

export class Diagnoser {
  constructor(private readonly llm: LlmClient, private readonly prompts: PromptBook) {}

  async diagnose(ctx: Context, lang: Lang, resume: string): Promise<Diagnosis> {
    const raw = await this.llm.call({
      model: MODELS.diagnose, maxTokens: 3000, tool: DIAGNOSE_TOOL,
      system: 'You plan a 20-minute cover-letter tutoring session.',
      user: this.prompts.render('diagnose.md', this.vars(ctx, lang, resume)),
    });
    return LlmOutputParser.diagnosis(raw, ctx.paragraphs, lang);
  }

  // 끝 글만 다시 매긴다 — 과제·브리핑 없음. 처음 글은 주지 않아 비교가 아니라 같은 잣대의 독립 판정이 되게 한다
  async regrade(ctx: Context, lang: Lang, resume: string): Promise<Regrade> {
    const raw = await this.llm.call({
      model: MODELS.diagnose, maxTokens: 2000, tool: REGRADE_TOOL,
      system: 'You grade a revised cover letter with the same rubric used before the session.',
      user: this.prompts.render('regrade.md', this.vars(ctx, lang, resume)),
    });
    return LlmOutputParser.regrade(raw);
  }

  // 두 프롬프트가 같이 쓰는 칸 — 루브릭(rubric.md)은 정합성 안내까지 채워서 넣는다
  private vars(ctx: Context, lang: Lang, resume: string): Record<string, string> {
    const hits = findCliches(ctx.paragraphs);
    const alignmentNote = ctx.posting || resume ? ALIGNMENT_NOTE.withSources : ALIGNMENT_NOTE.noSources;
    return {
      lang: PromptBook.langName(lang), posting: PromptBook.postingText(ctx.posting), essay: PromptBook.essayText(ctx.paragraphs), resume,
      rubric: PromptBook.fill(this.prompts.load('rubric.md'), { alignmentNote }),
      cliches: hits.map((h) => `${h.paragraph}문단 "${h.text}" (${h.label})`).join('\n') || '-',
    };
  }
}

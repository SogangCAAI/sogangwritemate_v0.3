// 첫 진단 — Sonnet 한 번이 채점 루브릭(5축) · 과제 3개 · 브리핑 3파트를 낸다
import { findCliches } from '../../checks';
import type { Lang } from '../../state';
import { LlmClient, MODELS } from '../llm/LlmClient';
import { PromptBook } from '../llm/PromptBook';
import { DIAGNOSE_TOOL, LlmOutputParser, type Diagnosis } from '../parse/LlmOutputParser';
import type { Context } from '../parse/RequestParser';

// 축 3(정합성) 판정 안내 — v2 prompts.ts의 hasAlignmentSources 두 갈래 그대로 (이력서나 공고가 있나)
const ALIGNMENT_NOTE = {
  withSources: "※ 위 참고 자료와 대조하여 판정하십시오. 자료 중 **일부만** 있으면(예: 공고만) 있는 것으로 할 수 있는 판정은 **하고**, 못 한 부분은 그 근거 문면에 무엇을 못 했는지 적으십시오.",
  noSources: "※ 이번 진단에는 이력서와 공고가 모두 없습니다 — 3-b(consistency)는 원고↔대화만으로 볼 수 있는 만큼만 보고, 댈 근거가 없으면 \"판정불가\"로 두십시오. 3-a(transfer)는 **원고만으로도 판정합니다**(지원 업무가 글에 적혀 있으면 그것을 씁니다).",
};

export class Diagnoser {
  constructor(private readonly llm: LlmClient, private readonly prompts: PromptBook) {}

  async diagnose(ctx: Context, lang: Lang, resume: string): Promise<Diagnosis> {
    const hits = findCliches(ctx.paragraphs);
    const raw = await this.llm.call({
      model: MODELS.diagnose, maxTokens: 3000, tool: DIAGNOSE_TOOL,
      system: 'You plan a 20-minute cover-letter tutoring session.',
      user: this.prompts.render('diagnose.md', {
        lang: PromptBook.langName(lang), posting: PromptBook.postingText(ctx.posting), essay: PromptBook.essayText(ctx.paragraphs), resume,
        alignmentNote: ctx.posting || resume ? ALIGNMENT_NOTE.withSources : ALIGNMENT_NOTE.noSources,
        cliches: hits.map((h) => `${h.paragraph}문단 "${h.text}" (${h.label})`).join('\n') || '-',
      }),
    });
    return LlmOutputParser.diagnosis(raw, ctx.paragraphs.length);
  }
}

// 세션 요약 — 과제 표(코드가 센 사실) + Sonnet 한 번. 표에 없는 성과는 쓰지 않게 한다. 글: src/prompts.ts 4장
import { mmss, taskTimeMs } from '../../checks';
import type { SessionState } from '../../state';
import { LlmClient, MODELS } from '../llm/LlmClient';
import { essayText, fill, langName, SUMMARY } from '../../prompts';
import { LlmOutputParser, SUMMARY_TOOL, type Summary } from '../parse/LlmOutputParser';

export class Summarizer {
  constructor(private readonly llm: LlmClient) {}

  async summarize(state: SessionState, original: readonly string[], final: readonly string[], now: number): Promise<Summary> {
    const raw = await this.llm.call({
      model: MODELS.summary, maxTokens: 1000, tool: SUMMARY_TOOL,
      system: SUMMARY.system,
      user: Summarizer.prompt(state, original, final, now),
    });
    return LlmOutputParser.summary(raw);
  }

  static prompt(state: SessionState, original: readonly string[], final: readonly string[], now: number): string {
    return fill(SUMMARY.user, {
      lang: langName(state.lang), table: Summarizer.table(state, now),
      original: essayText(original), final: essayText(final),
    });
  }

  static table(state: SessionState, now: number): string {
    return state.tasks
      .map((t) => `${t.order}. ${t.goal} | ${t.status} | ${mmss(taskTimeMs(t, now))} | ${t.turns}턴 | 수정 ${t.edits}회 | ${t.evidence ?? '-'}`)
      .join('\n');
  }
}

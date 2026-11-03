// 재평가 — Haiku 한 번: "고친 문단이 doneWhen을 원래보다 더 채우나?" → {better, reason(2문장까지)}
import { capSentences } from '../../checks';
import type { Lang, Task, Verdict } from '../../state';
import { LlmClient, MODELS } from '../llm/LlmClient';
import { PromptBook } from '../llm/PromptBook';
import { EVALUATE_TOOL, LlmOutputParser } from '../parse/LlmOutputParser';

export class Evaluator {
  constructor(private readonly llm: LlmClient, private readonly prompts: PromptBook) {}

  async evaluate(task: Task, original: string, edited: string, lang: Lang): Promise<Verdict> {
    const raw = await this.llm.call({
      model: MODELS.evaluate, maxTokens: 400, tool: EVALUATE_TOOL,
      system: 'You judge one paragraph revision against one criterion.',
      user: this.prompts.render('evaluate.md', { doneWhen: task.doneWhen, original, edited, lang: PromptBook.langName(lang) }),
    });
    const v = LlmOutputParser.verdict(raw);
    return { ...v, reason: capSentences(v.reason, 2) };
  }
}

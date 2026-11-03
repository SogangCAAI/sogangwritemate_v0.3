// 프롬프트 .md를 읽어 두고 {{칸}}을 채운다
// Netlify에서는 netlify.toml의 included_files로 함께 묶인 파일을 cwd 기준으로 읽는다
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Lang } from '../../state';

export class PromptBook {
  private readonly cache = new Map<string, string>();

  // dir을 주지 않으면 읽을 때의 cwd 기준 src/prompts
  constructor(private readonly dir?: string) {}

  load(name: string): string {
    const hit = this.cache.get(name);
    if (hit) return hit;
    const text = readFileSync(join(this.dir ?? join(process.cwd(), 'src', 'prompts'), name), 'utf8');
    this.cache.set(name, text);
    return text;
  }

  // 이름의 .md를 읽고 칸을 채운다
  render(name: string, vars: Record<string, string>): string {
    return PromptBook.fill(this.load(name), vars);
  }

  static fill(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');
  }

  static essayText(paragraphs: readonly string[]): string {
    return paragraphs.map((p, i) => `${i + 1}문단: ${p}`).join('\n');
  }

  static langName(lang: Lang): string {
    return lang === 'en' ? 'English' : '한국어';
  }

  // 공고는 선택 — 비어 있으면 모델이 공고를 지어내지 않도록 없다고 분명히 쓴다
  static postingText(posting: string): string {
    return posting || '(공고 없음 — 지원 분야를 모르는 일반 자기소개서로 본다. 공고 요구를 지어내지 않는다.)';
  }
}

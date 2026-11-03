// 모델 출력 읽기 — 신뢰 경계. 형식이 틀리면 사용자에게는 '다시 보내 주세요' + 어느 칸인지 짧게 (원인을 화면에서 바로 알 수 있게),
// 모델 출력 앞부분은 서버 로그에만 남긴다. 고칠 수 있는 것(넘친 목록·긴 글·범위 밖 문단·빈 말)은 실패 대신 보정한다.
// 출력마다 스키마와 파서를 한 파일에 둔다 (outputs/).
import { LlmError } from '../llm/LlmClient';
import { ValidationError } from './fields';
import { parseDiagnosis } from './outputs/diagnosis';
import { parseJudge } from './outputs/judge';
import { parseSummary } from './outputs/summary';
import { parseVerdict } from './outputs/verdict';

export { ValidationError } from './fields';
export { DIAGNOSE_TOOL, parseDiagnosis, parseRubric, type Diagnosis } from './outputs/diagnosis';
export { parseJudge, TURN_TOOL } from './outputs/judge';
export { parseSummary, SUMMARY_TOOL, type Summary } from './outputs/summary';
export { EVALUATE_TOOL, parseVerdict } from './outputs/verdict';

export class LlmOutputParser {
  // name은 사용자에게 보이는 꼬리표 (respond · diagnose · evaluate · summary)
  static read<T>(name: string, raw: unknown, parse: (raw: unknown) => T): T {
    try {
      return parse(raw);
    } catch (e) {
      if (e instanceof ValidationError) {
        console.error(`[${name}] 형식 밖 출력:`, e.message, JSON.stringify(raw ?? null).slice(0, 1500));
        throw new LlmError(`${name} 형식 밖 출력: ${e.message}`, `튜터가 답을 잘못 만들었어요. 다시 보내 주세요. (${name} · ${e.message})`);
      }
      throw e;
    }
  }

  static judge(raw: unknown) { return LlmOutputParser.read('respond', raw, parseJudge); }
  static verdict(raw: unknown) { return LlmOutputParser.read('evaluate', raw, parseVerdict); }
  static summary(raw: unknown) { return LlmOutputParser.read('summary', raw, parseSummary); }
  static diagnosis(raw: unknown, paragraphCount: number) {
    return LlmOutputParser.read('diagnose', raw, (r) => parseDiagnosis(r, paragraphCount));
  }
}

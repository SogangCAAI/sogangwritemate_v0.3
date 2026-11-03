// 서버 부품 조립 — 함수 묶음 하나 안에서 한 벌만 만든다 (프롬프트 캐시 · DB 연결 · '저장 건너뜀' 경고를 함께 쓴다)
import { LlmClient } from './llm/LlmClient';
import { PromptBook } from './llm/PromptBook';
import { TurnPrompt } from './llm/TurnPrompt';
import { Diagnoser } from './services/Diagnoser';
import { Evaluator } from './services/Evaluator';
import { Summarizer } from './services/Summarizer';
import { TtsService } from './services/TtsService';
import { TurnResponder } from './services/TurnResponder';
import { SessionStore } from './store/SessionStore';

const llm = new LlmClient();
const prompts = new PromptBook();

export const services = {
  store: new SessionStore(),
  responder: new TurnResponder(llm, new TurnPrompt(prompts)),
  diagnoser: new Diagnoser(llm, prompts),
  evaluator: new Evaluator(llm, prompts),
  summarizer: new Summarizer(llm, prompts),
  tts: new TtsService(),
};

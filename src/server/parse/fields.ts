// 신뢰 경계의 작은 손 검사 — 요청 본문과 모델 출력이 같이 쓴다. 틀리면 ValidationError (사용자에게 400으로)
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export type Obj = Record<string, unknown>;

export const MAX_TEXT = 4000;

export function fail(msg: string): never {
  throw new ValidationError(msg);
}

export function obj(x: unknown, name: string): Obj {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Obj) : fail(`${name}: 객체가 아니에요.`);
}

export function str(x: unknown, name: string, max = MAX_TEXT): string {
  if (typeof x !== 'string') fail(`${name}: 글자가 아니에요.`);
  if (x.length > max) fail(`${name}: 너무 길어요 (${max}자까지).`);
  return x;
}

export const optStr = (x: unknown, name: string): string | undefined => (x === undefined ? undefined : str(x, name));

export function num(x: unknown, name: string): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : fail(`${name}: 숫자가 아니에요.`);
}

export const optNum = (x: unknown, name: string): number | undefined => (x === undefined ? undefined : num(x, name));

export function oneOf<T extends string>(x: unknown, allowed: readonly T[], name: string): T {
  return allowed.includes(x as T) ? (x as T) : fail(`${name}: 허용되지 않는 값이에요.`);
}

export function bool(x: unknown, name: string): boolean {
  return typeof x === 'boolean' ? x : fail(`${name}: 참/거짓이 아니에요.`);
}

export function strList(x: unknown, name: string, maxItems: number, maxLen = MAX_TEXT): string[] {
  if (!Array.isArray(x) || x.length > maxItems) fail(`${name}: 목록이 아니거나 너무 길어요.`);
  return x.map((v, i) => str(v, `${name}[${i}]`, maxLen));
}

// ── 모델 출력 전용: 실패시키지 않고 보정한다 ──

// 모델이 쓴 글은 상한을 넘어도 실패시키지 않고 자른다 (클라이언트 입력에는 쓰지 않는다 — 그쪽은 str로 거절)
export const clip = (x: unknown, name: string, max: number): string => str(x, name, MAX_TEXT).trim().slice(0, max);

// 모델이 목록을 넘치게 내면 실패시키지 않고 앞에서부터 쓴다 — 구조화된 출력이 maxItems를 받지 않아 개수는 여기서 맞춘다
export const firstN = (x: unknown, n: number): unknown => (Array.isArray(x) ? x.slice(0, n) : x);

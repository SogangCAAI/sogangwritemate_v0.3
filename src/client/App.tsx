// 화면 셋: 시작 → 세션 → 요약. 라우터 없이 상태 하나로 고른다
import { useState } from 'react';
import type { SessionState } from '../state';
import { Landing, type Start } from './Landing';
import { Session } from './Session';
import { Summary } from './Summary';

type Page =
  | { name: 'landing' }
  | { name: 'session'; start: Start }
  | { name: 'summary'; start: Start; state: SessionState; final: string[] };

export function App() {
  const [page, setPage] = useState<Page>({ name: 'landing' });
  if (page.name === 'landing') return <Landing onStart={(start) => setPage({ name: 'session', start })} />;
  if (page.name === 'session') {
    return <Session start={page.start} onFinish={(state, final) => setPage({ name: 'summary', start: page.start, state, final })} />;
  }
  return <Summary start={page.start} state={page.state} final={page.final} onRestart={() => setPage({ name: 'landing' })} />;
}

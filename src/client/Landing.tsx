// 시작 화면 — 글·공고·(선택) 이력을 붙여 넣고 언어를 고른다 → 첫 진단
import { useState, type FormEvent } from 'react';
import type { Lang, SessionState } from '../state';
import { errorText, post, type TurnResult } from './api';

export interface Start {
  state: SessionState;
  say: string;
  awaitPause: boolean;
  posting: string;
  paragraphs: string[];
}

const MAX_PARAGRAPHS = 20;

// 빈 줄로 문단을 나눈다
const toParagraphs = (text: string) => text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);

export function Landing({ onStart }: { onStart: (s: Start) => void }) {
  const [essay, setEssay] = useState('');
  const [posting, setPosting] = useState('');
  const [resume, setResume] = useState('');
  const [lang, setLang] = useState<Lang>('ko');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const paragraphs = toParagraphs(essay);
    if (!posting.trim()) return setError('공고 내용을 붙여 넣어 주세요.');
    if (paragraphs.length === 0) return setError('자기소개서를 붙여 넣어 주세요.');
    if (paragraphs.length > MAX_PARAGRAPHS) return setError(`문단은 ${MAX_PARAGRAPHS}개까지예요. 빈 줄로 문단을 나눠 주세요.`);
    setBusy(true);
    setError('');
    try {
      const r = await post<TurnResult>('/api/diagnose', { lang, posting: posting.trim(), paragraphs, resume: resume.trim() || undefined });
      onStart({ state: r.state, say: r.say ?? '', awaitPause: r.awaitPause, posting: posting.trim(), paragraphs });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <main className="landing">
      <h1>서강 글벗</h1>
      <p className="lede">자기소개서를 대화로 함께 고쳐요. 20분 동안 과제 세 개를 같이 해요.</p>
      <form onSubmit={submit}>
        <label>
          자기소개서 <span className="hint">(문단 사이에 빈 줄)</span>
          <textarea value={essay} onChange={(e) => setEssay(e.target.value)} rows={10} required />
        </label>
        <label>
          지원 공고
          <textarea value={posting} onChange={(e) => setPosting(e.target.value)} rows={5} required />
        </label>
        <label>
          이력·경험 메모 <span className="hint">(선택)</span>
          <textarea value={resume} onChange={(e) => setResume(e.target.value)} rows={3} />
        </label>
        <fieldset className="lang">
          <legend>대화 언어</legend>
          <label><input type="radio" name="lang" checked={lang === 'ko'} onChange={() => setLang('ko')} /> 한국어</label>
          <label><input type="radio" name="lang" checked={lang === 'en'} onChange={() => setLang('en')} /> English</label>
        </fieldset>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? '글을 읽고 있어요… (30초쯤)' : '시작하기'}</button>
      </form>
    </main>
  );
}

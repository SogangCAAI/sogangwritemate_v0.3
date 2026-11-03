// 시작 화면 — 글(필수)·공고(선택)·이력(선택)을 붙여 넣고 언어를 고른다 → 첫 진단
import { useState, type FormEvent } from 'react';
import type { Lang } from '../state';
import { api, errorText } from './ApiClient';
import { Masthead } from './Masthead';
import type { Start } from './types';

const MAX_PARAGRAPHS = 20;
const PREVIEW_CHARS = 28;

// 빈 줄로 문단을 나눈다. 빈 줄이 하나도 없으면 줄바꿈 한 번을 문단 경계로 본다 (자소서를 그렇게 붙여 넣는 경우가 많다)
const toParagraphs = (text: string) => {
  const clean = (ps: string[]) => ps.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const byBlank = clean(text.split(/\n\s*\n/));
  return byBlank.length > 1 ? byBlank : clean(text.split(/\n/));
};
const folio = (n: number) => String(n).padStart(2, '0');
const clip = (p: string) => (p.length > PREVIEW_CHARS ? `${p.slice(0, PREVIEW_CHARS)}…` : p);

export function Landing({ onStart }: { onStart: (s: Start) => void }) {
  const [essay, setEssay] = useState('');
  const [posting, setPosting] = useState('');
  const [resume, setResume] = useState('');
  const [lang, setLang] = useState<Lang>('ko');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const paragraphs = toParagraphs(essay);
  const chars = paragraphs.reduce((sum, p) => sum + p.replace(/\s/g, '').length, 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (paragraphs.length === 0) return setError('자기소개서를 붙여 넣어 주세요.');
    if (paragraphs.length > MAX_PARAGRAPHS) return setError(`문단은 ${MAX_PARAGRAPHS}개까지예요. 빈 줄로 문단을 나눠 주세요.`);
    setBusy(true);
    setError('');
    try {
      const r = await api.diagnose({ lang, posting: posting.trim(), paragraphs, resume: resume.trim() || undefined });
      onStart({ state: r.state, say: r.say ?? '', awaitPause: r.awaitPause, posting: posting.trim(), paragraphs, rubric: r.rubric, strengths: r.strengths });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="shell landing">
      <Masthead />
      <main className="land">
        <div className="land-head">
          <h1>자기소개서를 말로 함께 고쳐요</h1>
          <p className="lede">20분 동안 튜터와 이야기하며 과제 세 개를 정하고, 문단은 내 손으로 고쳐요. 튜터는 대신 써 주지 않아요.</p>
        </div>

        <form className="land-form" onSubmit={submit} aria-busy={busy}>
          <section className="land-essay" aria-labelledby="essay-l">
            <div className="field-head">
              <label id="essay-l" htmlFor="essay">내 자기소개서</label>
              <span className="field-meta" aria-live="polite">
                {paragraphs.length > 0 ? `${paragraphs.length}문단 · ${chars}자` : '문단 사이에 빈 줄'}
              </span>
            </div>
            <textarea
              id="essay"
              className="essay-input"
              value={essay}
              onChange={(e) => setEssay(e.target.value)}
              rows={14}
              required
              aria-describedby="essay-help"
              placeholder={'첫 문단을 여기에 붙여 넣어요.\n\n빈 줄을 두고 다음 문단을 이어요.'}
            />
            <p id="essay-help" className="field-help">빈 줄로 나눈 덩어리가 한 문단이에요. 튜터는 "2문단"처럼 번호로 불러요.</p>
            {paragraphs.length > 0 && (
              <ol className="folios" aria-label="문단 나눔 미리보기">
                {paragraphs.map((p, i) => (
                  <li key={i}><span className="folio">{folio(i + 1)}</span><span className="folio-text">{clip(p)}</span></li>
                ))}
              </ol>
            )}
          </section>

          <div className="land-side">
            <label className="field">
              <span className="field-head"><span>지원 공고</span><span className="field-meta">선택</span></span>
              <textarea value={posting} onChange={(e) => setPosting(e.target.value)} rows={5} placeholder="회사·직무·요구 역량을 붙여 넣으면 공고에 맞춰 봐요" />
            </label>
            <label className="field">
              <span className="field-head"><span>이력·경험 메모</span><span className="field-meta">선택</span></span>
              <textarea value={resume} onChange={(e) => setResume(e.target.value)} rows={3} placeholder="활동·수업·경험을 짧게" />
            </label>
            <fieldset className="lang">
              <legend>대화 언어</legend>
              <label><input type="radio" name="lang" checked={lang === 'ko'} onChange={() => setLang('ko')} /> 한국어</label>
              <label><input type="radio" name="lang" checked={lang === 'en'} onChange={() => setLang('en')} /> English</label>
            </fieldset>

            <div className="mic-note">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
              <p>세션은 <b>말로</b> 진행돼요. 마이크가 필요하고, Chrome이나 Edge를 권해요. 시작하면 브라우저가 마이크 권한을 물어요. 마이크가 없으면 글자로도 할 수 있어요.</p>
            </div>

            {error && <p className="error" role="alert">{error}</p>}
            <button type="submit" className="btn solid big" disabled={busy}>
              {busy ? '글을 읽고 있어요… (30초쯤)' : '시작하기'}
            </button>
          </div>
        </form>
      </main>
      <footer className="colophon">서강 글벗은 서강대학교 CAAI 연구실이 만든 연구용 튜터예요.</footer>
    </div>
  );
}

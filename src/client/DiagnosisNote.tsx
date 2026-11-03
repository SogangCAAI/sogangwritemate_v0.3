// 첫 진단의 평가 — 편집 메모. 글 전체 한 줄 평 + 주장마다 근거가 있는지. 빨강은 쓰지 않는다 (지금 과제 전용)
import type { Assessment, Evidence } from '../state';

const LABEL: Record<Evidence, string> = { strong: '근거 충분', weak: '근거 약함', none: '근거 없음' };
const folio = (n: number) => String(n).padStart(2, '0');

export function DiagnosisNote({ assessment, open = true }: { assessment: Assessment; open?: boolean }) {
  return (
    <details className="diag" open={open}>
      <summary>
        <span className="diag-kicker">편집 메모 · 첫 진단</span>
        <span className="diag-toggle" aria-hidden="true" />
      </summary>
      <p className="diag-summary">{assessment.summary}</p>
      {assessment.claims.length > 0 && (
        <ol className="diag-claims">
          {assessment.claims.map((c, i) => (
            <li key={i} className={`diag-claim ev-${c.evidence}`}>
              <span className="folio" aria-label={`${c.paragraph}문단`}>{folio(c.paragraph)}</span>
              <div>
                <p className="diag-line"><b>{c.claim}</b><span className="ev">{LABEL[c.evidence]}</span></p>
                <p className="diag-note">{c.note}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}

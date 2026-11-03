// 제호 띠 — 서강 글벗 · 연구실 표기(필수) · 오른쪽 자리 + 겹괘선
import type { ReactNode } from 'react';

interface Props {
  heading?: boolean; // 이 화면의 h1이 제호인가
  children?: ReactNode; // 오른쪽: 남은 시간·버튼 등
}

export function Masthead({ heading = false, children }: Props) {
  const Brand = heading ? 'h1' : 'p';
  return (
    <header className="mast">
      <div className="mast-row">
        <Brand className="brand">서강 글벗</Brand>
        <p className="org"><b>서강대학교 CAAI 연구실</b> · 연구용 튜터</p>
        {children && <div className="mast-end">{children}</div>}
      </div>
      <div className="rules" aria-hidden="true" />
    </header>
  );
}

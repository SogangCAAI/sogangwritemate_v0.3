// 과제 세 꼭지 — 제호 띠 아래 한 줄. 지금 과제만 빨강
import type { Task } from '../state';
import { Stamp } from './Stamp';

export function TaskStrip({ tasks }: { tasks: readonly Task[] }) {
  return (
    <nav className="strip" aria-label="오늘의 과제">
      <ol>
        {tasks.map((t) => (
          <li key={t.id} className={`strip-task is-${t.status}`} aria-current={t.status === 'active' ? 'step' : undefined}>
            <span className="strip-no">과제 {t.order}</span>
            <span className="strip-goal" title={t.goal}>{t.goal}</span>
            <Stamp status={t.status} />
          </li>
        ))}
      </ol>
    </nav>
  );
}

// 과제 세 꼭지 — 제호 띠 아래 한 줄. 지금 과제만 빨강, 아직 시작 안 한 2·3은 '시간 되면'
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
            {/* 과제 1에 집중 — 2·3은 시간이 될 때만 한다 */}
            {t.status === 'pending' && t.order > 1 ? <span className="stamp-wait">시간 되면</span> : <Stamp status={t.status} />}
          </li>
        ))}
      </ol>
    </nav>
  );
}

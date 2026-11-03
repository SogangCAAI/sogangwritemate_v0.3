// 과제 3개와 상태 — 학생이 지금 무엇을 하는지, 무엇이 끝나야 완료인지 본다
import type { Task, TaskStatus } from '../state';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: '대기', active: '진행 중', done: '완료', skipped: '건너뜀', timeout: '시간 초과',
};

export function TaskList({ tasks }: { tasks: Task[] }) {
  return (
    <section aria-labelledby="tasks-h" className="tasks">
      <h2 id="tasks-h">오늘의 과제</h2>
      <ol>
        {tasks.map((t) => (
          <li key={t.id} className={`task ${t.status}`}>
            <span className="badge">{STATUS_LABEL[t.status]}</span>
            <strong>{t.goal}</strong>
            <span className="done-when">완료 기준: {t.doneWhen}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

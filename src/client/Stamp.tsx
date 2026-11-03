// 과제 상태 도장 — 끝난·건너뛴 과제는 사라지지 않고 도장으로 남는다
import type { TaskStatus } from '../state';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: '대기', active: '진행 중', done: '완료', skipped: '건너뜀', timeout: '시간 초과',
};

export function Stamp({ status }: { status: TaskStatus }) {
  if (status === 'pending') return <span className="stamp-wait">{STATUS_LABEL.pending}</span>;
  return <span className={`stamp stamp-${status}`}>{STATUS_LABEL[status]}</span>;
}

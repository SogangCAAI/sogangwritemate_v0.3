// 세션 화면 — 제호 띠(과제 세 꼭지) · 글 전체(기사 단) · 튜터 칸(말로 하는 대화)
// 진행(턴·재평가·쉼·음성)은 session/useSession · SessionController가 한다. 여기서는 그리기만.
import { mmss, sessionLeftMs } from '../checks';
import { activeTask, type SessionState } from '../state';
import { EssayPanel } from './EssayPanel';
import { Masthead } from './Masthead';
import { useSession } from './session/useSession';
import { TaskStrip } from './TaskStrip';
import type { Start } from './types';
import { VoicePanel } from './VoicePanel';

interface Props { start: Start; onFinish: (s: SessionState, final: readonly string[]) => void }

export function Session({ start, onFinish }: Props) {
  const { view, voice, now, ended, draft, setDraft, editing, setEditing, finish, say, saveEdit, insertParagraph, deleteParagraph, canDelete } = useSession(start, onFinish);
  const { state, log, paragraphs, busy, error } = view;

  return (
    <div className="shell session">
      <Masthead heading>
        <p className="timer"><span>남은 시간</span><b>{mmss(Math.max(0, sessionLeftMs(state, now)))}</b></p>
        <button type="button" className="btn" onClick={finish}>{ended ? '요약 보기' : '세션 끝내기'}</button>
      </Masthead>
      <TaskStrip tasks={state.tasks} />
      {start.saved === false && (
        <p className="unsaved" role="status">이 세션은 기록이 저장되지 않아요 — 대화는 그대로 할 수 있어요. 관리자: <code>/api/health</code>에서 원인을 확인하세요.</p>
      )}
      <main className="page">
        <EssayPanel
          paragraphs={paragraphs}
          task={activeTask(state)}
          busy={busy || ended}
          listenPaused={editing && voice.held}
          onSave={saveEdit}
          onEditing={setEditing}
          onInsert={insertParagraph}
          onDelete={deleteParagraph}
          canDelete={canDelete}
          rubric={start.rubric}
          strengths={start.strengths}
        />
        <VoicePanel
          log={log}
          voice={voice}
          busy={busy}
          ended={ended}
          error={error}
          draft={draft}
          onDraft={setDraft}
          onSay={say}
          onFinish={finish}
        />
      </main>
    </div>
  );
}

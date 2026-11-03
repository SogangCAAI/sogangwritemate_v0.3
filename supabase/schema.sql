-- 서강 글벗 v3 — 새 Supabase 프로젝트용
-- 서버(Netlify 함수)가 service_role 키로만 쓴다. RLS를 켜고 정책을 두지 않아 anon/authenticated는 읽기·쓰기 모두 막힌다.

create table if not exists sessions (
  id           uuid primary key,
  lang         text not null check (lang in ('ko', 'en')),
  posting      text not null default '',
  essay        jsonb not null,            -- 처음 글 (문단 배열)
  final_essay  jsonb,                     -- 끝 글
  tasks        jsonb not null,            -- 과제 3개 (상태·시간·턴·수정 횟수·근거)
  summary      jsonb,                     -- {report, nextSteps}
  rubric       jsonb,                     -- 첫 진단 {rubric: 5축 {grade, evidence}, strengths} (부록 B 루브릭)
  helped       boolean,                   -- 마무리 성공 확인 (C4.6)
  created_at   timestamptz not null default now(),
  ended_at     timestamptz
);

create table if not exists turns (
  id            bigint generated always as identity primary key,
  session_id    uuid not null references sessions(id) on delete cascade,
  kind          text not null check (kind in ('say', 'pause', 'edit')),
  user_text     text,
  agent_text    text,
  user_action   text,                     -- judge.move (13 라벨)
  agent_action  text not null,            -- B2.1 · A3 · P1 · B4.4 · done:eval …
  apr           text,                     -- 시퀀스 안의 자리: B2PP · repair · insert · post …
  judge         jsonb,                    -- 판정 전체 또는 재평가 결과
  task_id       text,
  latency_ms    integer not null,
  created_at    timestamptz not null default now()
);

create index if not exists turns_session_idx on turns (session_id, created_at);

alter table sessions enable row level security;
alter table turns enable row level security;

-- 이미 만든 DB에 더할 때: supabase/migrations/20261103010000_rubric.sql

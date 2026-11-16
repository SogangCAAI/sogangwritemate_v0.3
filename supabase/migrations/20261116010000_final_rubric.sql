-- 세션 끝에 끝 글을 처음과 같은 루브릭으로 다시 매긴 결과 (요약 화면의 처음/끝 비교). 재진단이 실패하면 null
-- 값: {"rubric": {claim|hierarchy|alignment|cohesion|expression: {grade, evidence, sub?}}, "strengths": "..."}
alter table sessions add column if not exists final_rubric jsonb;

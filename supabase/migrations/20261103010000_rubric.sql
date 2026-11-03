-- 첫 진단을 v2와 같은 채점 루브릭(부록 B 5축)으로 바꾸며 sessions에 그 결과를 남긴다
-- 값: {"rubric": {claim|hierarchy|alignment|cohesion|expression: {grade, evidence, sub?}}, "strengths": "..."}
alter table sessions add column if not exists rubric jsonb;

-- Novos tipos de ocorrência: requirement, ihc, product

ALTER TABLE public.bugs DROP CONSTRAINT IF EXISTS bugs_type_check;

ALTER TABLE public.bugs
  ADD CONSTRAINT bugs_type_check
  CHECK (type IN (
    'bug',
    'requirement',
    'ihc',
    'product',
    'improvement',
    'ui_adjustment',
    'performance',
    'security'
  ));

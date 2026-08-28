-- ForceQA: sala/projeto herda a org de quem criou, não a org padrão da coluna.
-- O DEFAULT de organization_id carimba ForceQA; o trigger antigo só preenchia se fosse NULL,
-- então admin de outro tenant recebia 403 no INSERT (RLS exige a org corrente).
-- Rode no SQL Editor depois de migration_create_organization_admin.sql.

CREATE OR REPLACE FUNCTION public.set_war_room_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  creator_org UUID;
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    SELECT organization_id INTO creator_org
    FROM public.users
    WHERE id = NEW.created_by;
    IF creator_org IS NOT NULL THEN
      NEW.organization_id := creator_org;
    END IF;
  END IF;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.default_organization_id();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_project_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  source_org UUID;
BEGIN
  IF NEW.war_room_id IS NOT NULL THEN
    SELECT organization_id INTO source_org
    FROM public.war_rooms
    WHERE id = NEW.war_room_id;
  END IF;
  IF source_org IS NULL AND NEW.created_by IS NOT NULL THEN
    SELECT organization_id INTO source_org
    FROM public.users
    WHERE id = NEW.created_by;
  END IF;
  IF source_org IS NOT NULL THEN
    NEW.organization_id := source_org;
  END IF;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.default_organization_id();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_board_view_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  source_org UUID;
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    SELECT organization_id INTO source_org
    FROM public.projects
    WHERE id = NEW.project_id;
  END IF;
  IF source_org IS NOT NULL THEN
    NEW.organization_id := source_org;
  END IF;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.default_organization_id();
  END IF;
  RETURN NEW;
END;
$$;

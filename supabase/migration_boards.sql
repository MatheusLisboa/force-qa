-- Migração: Boards permanentes + War Rooms por período
-- Execute no SQL Editor se o schema já foi aplicado antes desta mudança.

ALTER TABLE public.war_rooms
  ADD COLUMN IF NOT EXISTS period_end TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS room_type TEXT NOT NULL DEFAULT 'war_room';

ALTER TABLE public.war_rooms
  DROP CONSTRAINT IF EXISTS war_rooms_room_type_check;

ALTER TABLE public.war_rooms
  ADD CONSTRAINT war_rooms_room_type_check
  CHECK (room_type IN ('war_room', 'board'));

CREATE INDEX IF NOT EXISTS idx_war_rooms_room_type ON public.war_rooms(room_type);

-- Atualiza policy de insert para incluir scrum_master
DROP POLICY IF EXISTS "war_rooms_insert" ON public.war_rooms;
CREATE POLICY "war_rooms_insert" ON public.war_rooms FOR INSERT TO authenticated
  WITH CHECK (
    (
      public.is_admin()
      OR public.current_user_role() IN ('qa', 'scrum_master')
    )
    AND created_by = auth.uid()
  );

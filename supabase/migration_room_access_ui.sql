-- Membership managed in the UI: staff cannot self-join by ID.
-- Guests still join rooms with guest access enabled.
-- QA / Scrum Master who already belong to a room can remove other members.
--
-- Rode de novo se aparecer deadlock (40P01). A function e o DROP POLICY
-- não podem ficar na mesma transação: o app em uso trava war_rooms + room_members.

CREATE OR REPLACE FUNCTION public.can_guest_join_room(p_room_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_guest_user()
    AND EXISTS (
      SELECT 1 FROM public.war_rooms wr
      WHERE wr.id = p_room_id
        AND NOT COALESCE(wr.guest_access_disabled, false)
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_guest_join_room(TEXT) TO authenticated;

COMMIT;

SET lock_timeout = '15s';

LOCK TABLE public.room_members IN ACCESS EXCLUSIVE MODE;

DROP POLICY IF EXISTS "room_members_insert" ON public.room_members;
CREATE POLICY "room_members_insert" ON public.room_members
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid() AND public.can_guest_join_room(war_room_id))
    OR public.is_admin()
    OR (
      public.current_user_role() IN ('qa', 'scrum_master')
      AND public.is_room_member(war_room_id)
    )
  );

DROP POLICY IF EXISTS "room_members_delete" ON public.room_members;
CREATE POLICY "room_members_delete" ON public.room_members
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR user_id = auth.uid()
    OR (
      public.current_user_role() IN ('qa', 'scrum_master')
      AND public.is_room_member(war_room_id)
    )
  );

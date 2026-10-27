import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useStaff } from '@/lib/api';
import {
  canManage,
  resolveSignedIn,
  storedStaffId,
  storeStaffId,
  subscribeStaffId,
} from '@/lib/session';

/** The signed-in staff member and the demo's "sign in as" switch (ADR 0009). */
export function useSession() {
  const staff = useStaff();
  const queryClient = useQueryClient();
  const storedId = useSyncExternalStore(subscribeStaffId, storedStaffId);
  const current = staff.data ? resolveSignedIn(staff.data, storedId) : null;
  const currentId = current?.id ?? null;

  // Remember the fallback, so requests carry it from now on.
  useEffect(() => {
    if (currentId && currentId !== storedId) storeStaffId(currentId);
  }, [currentId, storedId]);

  const signInAs = useCallback(
    (id: string) => {
      storeStaffId(id);
      void queryClient.invalidateQueries();
    },
    [queryClient],
  );

  return { current, staff: staff.data ?? [], signInAs, canManage: canManage(current) };
}

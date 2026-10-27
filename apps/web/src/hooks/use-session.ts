import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';
import { useStaff } from '@/lib/api';
import {
  canManage,
  clearStaffId,
  resolveSignedIn,
  storedStaffId,
  storeStaffId,
  subscribeStaffId,
} from '@/lib/session';

/** The signed-in staff member, and signing in and out of the demo (ADR 0009). */
export function useSession() {
  const staff = useStaff();
  const queryClient = useQueryClient();
  const storedId = useSyncExternalStore(subscribeStaffId, storedStaffId);
  const current = staff.data ? resolveSignedIn(staff.data, storedId) : null;

  const signInAs = useCallback(
    (id: string) => {
      storeStaffId(id);
      void queryClient.invalidateQueries();
    },
    [queryClient],
  );

  return {
    current,
    /** True once the team is loaded, so `current: null` really means signed out. */
    ready: staff.data !== undefined,
    storedId,
    staff: staff.data ?? [],
    staffError: staff.error,
    signInAs,
    signOut: clearStaffId,
    canManage: canManage(current),
  };
}

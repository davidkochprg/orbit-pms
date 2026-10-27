import {
  apiErrorSchema,
  auditLogListSchema,
  bookingDetailSchema,
  bookingSchema,
  type BookingAction,
  type BookingListQuery,
  dayOverviewSchema,
  guestSchema,
  healthSchema,
  inquiryListSchema,
  inquirySchema,
  type NewMessageBody,
  pendingActionSchema,
  roomSchema,
} from '@orbit/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<S extends z.ZodType>(
  path: string,
  schema: S,
  init?: RequestInit,
): Promise<z.infer<S>> {
  const res = await fetch(path, {
    ...init,
    headers: { accept: 'application/json', ...init?.headers },
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw new ApiRequestError(
      res.status,
      parsed.success ? parsed.data.error.code : 'http_error',
      parsed.success ? parsed.data.error.message : `Request failed with ${res.status}`,
    );
  }
  return schema.parse(body);
}

/** Fetches JSON from the API and validates it against a shared schema. */
export function apiGet<S extends z.ZodType>(path: string, schema: S) {
  return request(path, schema);
}

export function apiPost<S extends z.ZodType>(path: string, body: unknown, schema: S) {
  return request(path, schema, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function toSearch(params: Record<string, string | string[] | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, Array.isArray(value) ? value.join(',') : value);
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet('/health', healthSchema),
    refetchInterval: 30_000,
  });
}

export function useDayOverview(date?: string) {
  return useQuery({
    queryKey: ['day', date ?? 'today'],
    queryFn: () => apiGet(`/api/day${toSearch({ date })}`, dayOverviewSchema),
  });
}

export function useRooms() {
  return useQuery({
    queryKey: ['rooms'],
    queryFn: () => apiGet('/api/rooms', z.array(roomSchema)),
  });
}

export function useGuests() {
  return useQuery({
    queryKey: ['guests'],
    queryFn: () => apiGet('/api/guests', z.array(guestSchema)),
  });
}

export function useGuest(id: string) {
  return useQuery({
    queryKey: ['guest', id],
    queryFn: () => apiGet(`/api/guests/${encodeURIComponent(id)}`, guestSchema),
  });
}

export function useBookings(query: BookingListQuery) {
  return useQuery({
    queryKey: ['bookings', query],
    queryFn: () => apiGet(`/api/bookings${toSearch({ ...query })}`, z.array(bookingSchema)),
  });
}

export function useBookingDetail(id: string | null) {
  return useQuery({
    queryKey: ['booking', id],
    queryFn: () => apiGet(`/api/bookings/${encodeURIComponent(id ?? '')}`, bookingDetailSchema),
    enabled: id !== null,
  });
}

export function useAuditLog(subjectId: string | null) {
  return useQuery({
    queryKey: ['audit', subjectId],
    queryFn: () =>
      apiGet(
        `/api/audit-log${toSearch({ subjectId: subjectId ?? undefined })}`,
        auditLogListSchema,
      ),
    enabled: subjectId !== null,
  });
}

export function useBookingAction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: BookingAction) =>
      apiPost(`/api/bookings/${encodeURIComponent(id)}/actions`, { action }, bookingDetailSchema),
    // Data sets are small, so refreshing everything keeps every view consistent.
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export function usePendingAction(id: string) {
  return useQuery({
    queryKey: ['pending-action', id],
    queryFn: () => apiGet(`/api/pending-actions/${encodeURIComponent(id)}`, pendingActionSchema),
  });
}

export function useResolvePendingAction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (decision: 'confirm' | 'reject') => {
      const res = await fetch(`/api/pending-actions/${encodeURIComponent(id)}/${decision}`, {
        method: 'POST',
        headers: { accept: 'application/json' },
      });
      // A failed confirm comes back as 409 with the action (status "failed") as the body.
      const body: unknown = await res.json().catch(() => null);
      const action = pendingActionSchema.safeParse(body);
      if (action.success) return action.data;
      const error = apiErrorSchema.safeParse(body);
      throw new ApiRequestError(
        res.status,
        error.success ? error.data.error.code : 'http_error',
        error.success ? error.data.error.message : `Request failed with ${res.status}`,
      );
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export function useInbox() {
  return useQuery({ queryKey: ['inbox'], queryFn: () => apiGet('/api/inbox', inquiryListSchema) });
}

export function useInquiry(id: string | undefined) {
  return useQuery({
    queryKey: ['inquiry', id],
    queryFn: () => apiGet(`/api/inbox/${encodeURIComponent(id ?? '')}`, inquirySchema),
    enabled: id !== undefined,
  });
}

function useInboxMutation<T>(fn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries() });
}

export function useCreateMessage() {
  return useInboxMutation((body: Partial<NewMessageBody> & { rawText: string }) =>
    apiPost('/api/inbox', body, inquirySchema),
  );
}

/** Lets the agent prepare the message. Already prepared messages come back without a model call. */
export function useProcessInquiry(id: string) {
  return useInboxMutation((force: boolean) =>
    apiPost(`/api/inbox/${encodeURIComponent(id)}/process`, { force }, inquirySchema),
  );
}

export function useInboxHold(id: string) {
  return useInboxMutation((roomId: string) =>
    apiPost(`/api/inbox/${encodeURIComponent(id)}/hold`, { roomId }, bookingDetailSchema),
  );
}

export function useMarkReplied(id: string) {
  return useInboxMutation((reply: string) =>
    apiPost(`/api/inbox/${encodeURIComponent(id)}/replied`, { reply }, inquirySchema),
  );
}

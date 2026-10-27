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

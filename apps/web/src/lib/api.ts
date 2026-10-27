import {
  apiErrorSchema,
  auditLogListSchema,
  bookingDetailSchema,
  type BookingPatch,
  bookingPreviewSchema,
  bookingSchema,
  type BookingAction,
  type BookingListQuery,
  type CreateBookingInput,
  dailyBriefSchema,
  dayOverviewSchema,
  folioSchema,
  type GuestPatch,
  guestSchema,
  housekeepingBoardSchema,
  housekeepingNoteResultSchema,
  housekeepingTaskSchema,
  type HousekeepingTaskStatus,
  type NewTaskBody,
  healthSchema,
  hotelProfileSchema,
  type HotelProfile,
  inquiryListSchema,
  inquirySchema,
  type NewChargeBody,
  type NewGuestBody,
  type NewPaymentBody,
  type NewMessageBody,
  pendingActionSchema,
  type PricingConfig,
  pricingConfigSchema,
  type RoomBody,
  type RoomTypeBody,
  roomSchema,
  type RoomStatus,
  roomOptionSchema,
  type RoomOptionsQuery,
  roomTypeSchema,
  type ReportQuery,
  type RegistrationBody,
  registrationSchema,
  registrationViewSchema,
  reportSchema,
  type NewStaffBody,
  STAFF_HEADER,
  staffMemberSchema,
  type UpdateStaffBody,
} from '@orbit/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { storedStaffId } from '@/lib/session';

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
  const staffId = storedStaffId();
  const res = await fetch(path, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(staffId && { [STAFF_HEADER]: staffId }),
      ...init?.headers,
    },
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

export function apiPost<S extends z.ZodType>(
  path: string,
  body: unknown,
  schema: S,
  method: 'POST' | 'PUT' | 'PATCH' = 'POST',
) {
  return request(path, schema, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Multipart upload, e.g. a recording. The browser sets the content type with its boundary. */
export function apiPostForm<S extends z.ZodType>(path: string, form: FormData, schema: S) {
  return request(path, schema, { method: 'POST', body: form });
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

export function useDailyBrief(date?: string) {
  return useQuery({
    queryKey: ['brief', date ?? 'today'],
    queryFn: () => apiGet(`/api/brief${toSearch({ date })}`, dailyBriefSchema),
  });
}

export function useRooms() {
  return useQuery({
    queryKey: ['rooms'],
    queryFn: () => apiGet('/api/rooms', z.array(roomSchema)),
  });
}

export function useRoomTypes() {
  return useQuery({
    queryKey: ['room-types'],
    queryFn: () => apiGet('/api/room-types', z.array(roomTypeSchema)),
    staleTime: Infinity,
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

/** The report for a period of nights; waits until the period is known. */
export function useReport(query: ReportQuery | null) {
  return useQuery({
    queryKey: ['report', query],
    queryFn: () => apiGet(`/api/reports${toSearch({ ...query })}`, reportSchema),
    enabled: query !== null,
    placeholderData: (previous) => previous,
  });
}

export function useRegistration(bookingId: string, enabled = true) {
  return useQuery({
    queryKey: ['registration', bookingId],
    queryFn: () =>
      apiGet(`/api/bookings/${encodeURIComponent(bookingId)}/registration`, registrationViewSchema),
    enabled,
  });
}

export function useSaveRegistration(bookingId: string) {
  return useRefreshingMutation((body: RegistrationBody) =>
    apiPost(
      `/api/bookings/${encodeURIComponent(bookingId)}/registration`,
      body,
      registrationSchema,
      'PUT',
    ),
  );
}

export function useFolio(bookingId: string) {
  return useQuery({
    queryKey: ['folio', bookingId],
    queryFn: () => apiGet(`/api/bookings/${encodeURIComponent(bookingId)}/folio`, folioSchema),
  });
}

export function useAddCharge(bookingId: string) {
  return useRefreshingMutation((body: NewChargeBody) =>
    apiPost(`/api/bookings/${encodeURIComponent(bookingId)}/charges`, body, folioSchema),
  );
}

export function useRemoveCharge(bookingId: string) {
  return useRefreshingMutation((chargeId: string) =>
    request(
      `/api/bookings/${encodeURIComponent(bookingId)}/charges/${encodeURIComponent(chargeId)}`,
      folioSchema,
      { method: 'DELETE' },
    ),
  );
}

export function useRecordPayment(bookingId: string) {
  return useRefreshingMutation((body: NewPaymentBody) =>
    apiPost(`/api/bookings/${encodeURIComponent(bookingId)}/payments`, body, folioSchema),
  );
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

/** Tape chart drag: new room and/or dates in one step. */
export function useRescheduleBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      roomId: string;
      checkIn: string;
      checkOut: string;
    }) => apiPost(`/api/bookings/${encodeURIComponent(id)}/reschedule`, body, bookingDetailSchema),
    onSettled: () => queryClient.invalidateQueries(),
  });
}

/** Tape chart edge drag: new departure date. */
export function useChangeBookingDates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; checkIn: string; checkOut: string }) =>
      apiPost(`/api/bookings/${encodeURIComponent(id)}/dates`, body, bookingDetailSchema),
    onSettled: () => queryClient.invalidateQueries(),
  });
}

export function useHousekeeping() {
  return useQuery({
    queryKey: ['housekeeping'],
    queryFn: () => apiGet('/api/housekeeping', housekeepingBoardSchema),
  });
}

function useRefreshingMutation<T, R>(fn: (input: T) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => queryClient.invalidateQueries() });
}

export function useSetRoomStatus() {
  return useRefreshingMutation(({ roomId, status }: { roomId: string; status: RoomStatus }) =>
    apiPost(`/api/rooms/${encodeURIComponent(roomId)}/status`, { status }, roomSchema),
  );
}

export function useCreateTask() {
  return useRefreshingMutation((body: NewTaskBody) =>
    apiPost('/api/housekeeping/tasks', body, housekeepingTaskSchema),
  );
}

export function useSetTaskStatus() {
  return useRefreshingMutation(({ id, status }: { id: string; status: HousekeepingTaskStatus }) =>
    apiPost(
      `/api/housekeeping/tasks/${encodeURIComponent(id)}/status`,
      { status },
      housekeepingTaskSchema,
    ),
  );
}

/** A housekeeping note, typed or recorded (WAV). The agent applies it right away. */
export function useHousekeepingNote() {
  return useRefreshingMutation((note: { text: string } | { audio: Blob }) => {
    if ('text' in note) {
      return apiPost('/api/housekeeping/notes', note, housekeepingNoteResultSchema);
    }
    const form = new FormData();
    form.append('audio', note.audio, 'note.wav');
    return apiPostForm('/api/housekeeping/voice', form, housekeepingNoteResultSchema);
  });
}

export function useHotelProfile() {
  return useQuery({
    queryKey: ['hotel-profile'],
    queryFn: () => apiGet('/api/settings/profile', hotelProfileSchema),
  });
}

export function useSaveHotelProfile() {
  return useRefreshingMutation((profile: HotelProfile) =>
    apiPost('/api/settings/profile', profile, hotelProfileSchema, 'PUT'),
  );
}

export function usePricing() {
  return useQuery({
    queryKey: ['pricing'],
    queryFn: () => apiGet('/api/settings/pricing', pricingConfigSchema),
  });
}

export function useSavePricing() {
  return useRefreshingMutation((pricing: PricingConfig) =>
    apiPost('/api/settings/pricing', pricing, pricingConfigSchema, 'PUT'),
  );
}

/** Adds a room type, or replaces one when `id` is given. */
export function useSaveRoomType() {
  return useRefreshingMutation(({ id, ...body }: RoomTypeBody & { id?: string }) =>
    id
      ? apiPost(`/api/room-types/${encodeURIComponent(id)}`, body, roomTypeSchema, 'PUT')
      : apiPost('/api/room-types', body, roomTypeSchema),
  );
}

/** Adds a room, or replaces one when `id` is given. */
export function useSaveRoom() {
  return useRefreshingMutation(({ id, ...body }: RoomBody & { id?: string }) =>
    id
      ? apiPost(`/api/rooms/${encodeURIComponent(id)}`, body, roomSchema, 'PUT')
      : apiPost('/api/rooms', body, roomSchema),
  );
}

export function useStaff() {
  return useQuery({
    queryKey: ['staff'],
    queryFn: () => apiGet('/api/staff', z.array(staffMemberSchema)),
  });
}

export function useAddStaff() {
  return useRefreshingMutation((body: NewStaffBody) =>
    apiPost('/api/staff', body, staffMemberSchema),
  );
}

export function useUpdateStaff() {
  return useRefreshingMutation(({ id, ...patch }: UpdateStaffBody & { id: string }) =>
    apiPost(`/api/staff/${encodeURIComponent(id)}`, patch, staffMemberSchema, 'PATCH'),
  );
}

/** Free rooms for a stay with their prices. Runs only while `query` is complete. */
export function useRoomOptions(query: RoomOptionsQuery | null) {
  return useQuery({
    queryKey: ['room-options', query],
    queryFn: () => apiPost('/api/availability', query, z.array(roomOptionSchema)),
    enabled: query !== null,
    placeholderData: (previous) => previous,
  });
}

/** What a booking would look like after `patch`, with its new price; nothing is saved. */
export function useBookingPreview(id: string | null, patch: BookingPatch | null) {
  return useQuery({
    queryKey: ['booking-preview', id, patch],
    queryFn: () =>
      apiPost(`/api/bookings/${encodeURIComponent(id ?? '')}/preview`, patch, bookingPreviewSchema),
    enabled: id !== null && patch !== null,
    retry: false,
  });
}

export function useCreateBooking() {
  return useRefreshingMutation((input: CreateBookingInput) =>
    apiPost('/api/bookings', input, bookingDetailSchema),
  );
}

export function useUpdateBooking() {
  return useRefreshingMutation(({ id, patch }: { id: string; patch: BookingPatch }) =>
    apiPost(`/api/bookings/${encodeURIComponent(id)}`, patch, bookingDetailSchema, 'PATCH'),
  );
}

export function useCreateGuest() {
  return useRefreshingMutation((body: NewGuestBody) => apiPost('/api/guests', body, guestSchema));
}

export function useUpdateGuest() {
  return useRefreshingMutation(({ id, patch }: { id: string; patch: GuestPatch }) =>
    apiPost(`/api/guests/${encodeURIComponent(id)}`, patch, guestSchema, 'PATCH'),
  );
}

export function useDeclineInquiry(id: string) {
  return useRefreshingMutation(() =>
    apiPost(`/api/inbox/${encodeURIComponent(id)}/decline`, {}, inquirySchema),
  );
}

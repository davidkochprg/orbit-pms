import {
  accessStatusSchema,
  activityItemSchema,
  type AuditActor,
  apiErrorSchema,
  auditLogListSchema,
  bookingDetailSchema,
  type BookingPatch,
  bookingPreviewSchema,
  bookingSchema,
  type BookingAction,
  type BookingListQuery,
  type ChargePatch,
  type ComposeBody,
  type CreateBookingInput,
  dailyBriefSchema,
  dayOverviewSchema,
  folioSchema,
  type GuestPatch,
  guestBookSchema,
  guestSchema,
  housekeepingBoardSchema,
  housekeepingNoteResultSchema,
  housekeepingTaskSchema,
  type HousekeepingTaskStatus,
  type NewTaskBody,
  healthSchema,
  idScanPhoneViewSchema,
  idScanSchema,
  hotelProfileSchema,
  type HotelProfile,
  inquiryListSchema,
  inquirySchema,
  type Inquiry,
  type Language,
  type NewChargeBody,
  type NewGuestBody,
  type NewPaymentBody,
  type NewStayGuestBody,
  type NewMessageBody,
  pendingActionSchema,
  type PricingConfig,
  pricingConfigSchema,
  type AdjustRatesBody,
  type LocalEventBody,
  localEventSchema,
  revenueBriefSchema,
  revenueOutlookSchema,
  type RoomBody,
  type RoomTypeBody,
  roomSchema,
  type RoomStatus,
  roomOptionSchema,
  type RoomOptionsQuery,
  roomTypeSchema,
  type ReportQuery,
  reportSchema,
  type NewStaffBody,
  STAFF_HEADER,
  staffMemberSchema,
  type StayGuestPatch,
  translateResultSchema,
  type UpdateStaffBody,
} from '@orbit/shared';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
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

export function apiDelete(path: string) {
  return request(path, z.null(), { method: 'DELETE' });
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

/** Whether this deployment asks for a demo access code, and whether this browser entered it. */
export function useAccess() {
  return useQuery({
    queryKey: ['access'],
    queryFn: () => apiGet('/api/access', accessStatusSchema),
    staleTime: Infinity,
    retry: 2,
  });
}

export function useEnterAccessCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => apiPost('/api/access', { code }, accessStatusSchema),
    onSuccess: (status) => queryClient.setQueryData(['access'], status),
  });
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
    enabled: id !== '',
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

/** The hotel-wide activity feed, optionally only staff or only the agent. */
export function useActivity(actor: AuditActor | undefined) {
  return useQuery({
    queryKey: ['activity', actor ?? 'all'],
    queryFn: () => apiGet(`/api/activity${toSearch({ actor })}`, z.array(activityItemSchema)),
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

const bookingPath = (bookingId: string) => `/api/bookings/${encodeURIComponent(bookingId)}`;

/** Everyone in the booking's room, with what the guest book still needs. */
export function useGuestBook(bookingId: string) {
  return useQuery({
    queryKey: ['guest-book', bookingId],
    queryFn: () => apiGet(`${bookingPath(bookingId)}/guests`, guestBookSchema),
  });
}

export function useAddStayGuest(bookingId: string) {
  return useRefreshingMutation((body: NewStayGuestBody) =>
    apiPost(`${bookingPath(bookingId)}/guests`, body, guestBookSchema),
  );
}

export function useUpdateStayGuest(bookingId: string) {
  return useRefreshingMutation(({ id, patch }: { id: string; patch: StayGuestPatch }) =>
    apiPost(
      `${bookingPath(bookingId)}/guests/${encodeURIComponent(id)}`,
      patch,
      guestBookSchema,
      'PATCH',
    ),
  );
}

export function useRemoveStayGuest(bookingId: string) {
  return useRefreshingMutation((id: string) =>
    request(`${bookingPath(bookingId)}/guests/${encodeURIComponent(id)}`, guestBookSchema, {
      method: 'DELETE',
    }),
  );
}

/** Opens a phone scan for one person, or for a companion still to add (`null`). */
export function useStartIdScan(bookingId: string) {
  return useMutation({
    mutationFn: (stayGuestId: string | null) =>
      apiPost(`${bookingPath(bookingId)}/scans`, { stayGuestId }, idScanSchema),
  });
}

/** The desk's view of a scan, polled until the photo has been read. */
export function useIdScan(bookingId: string, scanId: string | null) {
  return useQuery({
    queryKey: ['id-scan', bookingId, scanId],
    queryFn: () =>
      apiGet(`${bookingPath(bookingId)}/scans/${encodeURIComponent(scanId ?? '')}`, idScanSchema),
    enabled: scanId !== null,
    refetchInterval: (query) =>
      query.state.data?.status === 'done' || query.state.error ? false : 1500,
  });
}

/** Uploads a photo at the desk instead of from a phone. */
export function useUploadIdPhoto(bookingId: string, scanId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (photo: Blob) => {
      const form = new FormData();
      form.append('photo', photo, 'id.jpg');
      return apiPostForm(
        `${bookingPath(bookingId)}/scans/${encodeURIComponent(scanId ?? '')}/photo`,
        form,
        idScanPhoneViewSchema,
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['id-scan', bookingId, scanId] }),
  });
}

/** The phone's view of a scan link. */
export function usePhoneScan(scanId: string) {
  return useQuery({
    queryKey: ['phone-scan', scanId],
    queryFn: () => apiGet(`/api/scan/${encodeURIComponent(scanId)}`, idScanPhoneViewSchema),
    retry: false,
  });
}

export function usePhoneUpload(scanId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (photo: Blob) => {
      const form = new FormData();
      form.append('photo', photo, 'id.jpg');
      return apiPostForm(
        `/api/scan/${encodeURIComponent(scanId)}/photo`,
        form,
        idScanPhoneViewSchema,
      );
    },
    onSuccess: (view) => queryClient.setQueryData(['phone-scan', scanId], view),
  });
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

export function useUpdateCharge(bookingId: string) {
  return useRefreshingMutation(({ chargeId, patch }: { chargeId: string; patch: ChargePatch }) =>
    apiPost(
      `${bookingPath(bookingId)}/charges/${encodeURIComponent(chargeId)}`,
      patch,
      folioSchema,
      'PATCH',
    ),
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

/** Confirms or rejects a proposed change. A failed confirm comes back as the action, "failed". */
async function resolvePendingAction(id: string, decision: 'confirm' | 'reject') {
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
}

export function useResolvePendingAction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (decision: 'confirm' | 'reject') => resolvePendingAction(id, decision),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

/** Confirms or rejects whichever proposed change it is given, e.g. from a keyboard shortcut. */
export function useResolveAnyPendingAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'confirm' | 'reject' }) =>
      resolvePendingAction(id, decision),
    onSettled: () => queryClient.invalidateQueries(),
  });
}

/** Confirms several proposed changes one after another, in the order the agent proposed them. */
export function useConfirmPendingActions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const results = [];
      for (const id of ids) results.push(await resolvePendingAction(id, 'confirm'));
      return results;
    },
    onSettled: () => queryClient.invalidateQueries(),
  });
}

/** Several proposed changes, sharing the cache with `usePendingAction`. */
export function usePendingActions(ids: string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: ['pending-action', id],
      queryFn: () => apiGet(`/api/pending-actions/${encodeURIComponent(id)}`, pendingActionSchema),
    })),
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

function useInboxMutation<T>(fn: (input: T) => Promise<Inquiry>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (inquiry) => {
      // Show the updated conversation at once, then refresh what depends on it.
      queryClient.setQueryData(['inquiry', inquiry.id], inquiry);
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'id-scan' });
    },
  });
}

const inboxPath = (id: string) => `/api/inbox/${encodeURIComponent(id)}`;

/** A guest's message that starts a conversation, e.g. pasted from an email or an OTA. */
export function useCreateMessage() {
  return useInboxMutation((body: Partial<NewMessageBody> & { body: string }) =>
    apiPost('/api/inbox', body, inquirySchema),
  );
}

/** A new email from the hotel to a guest. */
export function useComposeMessage() {
  return useInboxMutation((body: ComposeBody) =>
    apiPost('/api/inbox/compose', body, inquirySchema),
  );
}

/**
 * Lets the agent prepare a reply, on request only. `language` is the staff member's, for the
 * draft side by side. Already prepared conversations come back without a model call.
 */
/** Reads the guest's request and finds rooms for it; nothing is written yet. */
export function useReadInquiry(id: string) {
  return useInboxMutation(({ force }: { force: boolean }) =>
    apiPost(`${inboxPath(id)}/read`, { force }, inquirySchema),
  );
}

/** Writes the reply from the reading and the room held now, side by side in `language`. */
export function useDraftInquiry(id: string) {
  return useInboxMutation(({ language }: { language: Language | null }) =>
    apiPost(`${inboxPath(id)}/draft`, { language }, inquirySchema),
  );
}

export function useInboxHold(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roomId: string) =>
      apiPost(`${inboxPath(id)}/hold`, { roomId }, bookingDetailSchema),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

/** Sends the hotel's reply through the conversation's channel. */
export function useSendReply(id: string) {
  return useInboxMutation((body: string) =>
    apiPost(`${inboxPath(id)}/send`, { body }, inquirySchema),
  );
}

/** Adds the guest's next message to the conversation, e.g. pasted from the mail client. */
export function useReceiveMessage(id: string) {
  return useInboxMutation((body: string) =>
    apiPost(`${inboxPath(id)}/receive`, { body }, inquirySchema),
  );
}

export function useSetUnread(id: string) {
  return useInboxMutation((unread: boolean) =>
    apiPost(`${inboxPath(id)}/unread`, { unread }, inquirySchema),
  );
}

export function useSetArchived(id: string) {
  return useInboxMutation((archived: boolean) =>
    apiPost(`${inboxPath(id)}/archive`, { archived }, inquirySchema),
  );
}

/** Translates one message of the conversation, kept with it so asking again is free. */
export function useTranslateMessage(id: string) {
  return useInboxMutation(({ messageId, to }: { messageId: string; to: Language }) =>
    apiPost(
      `${inboxPath(id)}/messages/${encodeURIComponent(messageId)}/translate`,
      { to },
      inquirySchema,
    ),
  );
}

/** Translates text that isn't stored, e.g. a reply as staff edit it. */
export function useTranslateText() {
  return useMutation({
    mutationFn: ({ text, to }: { text: string; to: Language }) =>
      apiPost('/api/inbox/translate', { text, to }, translateResultSchema),
  });
}

export function useDeclineInquiry(id: string) {
  return useInboxMutation(() => apiPost(`${inboxPath(id)}/decline`, {}, inquirySchema));
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

/**
 * Has the model read stays whose notes changed since it last did, and shows the board it re-ranked.
 */
export function useReadStays() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost('/api/housekeeping/read-stays', {}, housekeepingBoardSchema),
    onSuccess: (board) => queryClient.setQueryData(['housekeeping'], board),
  });
}

function useRefreshingMutation<T, R>(fn: (input: T) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // A scan is deleted once its details are saved, so refetching it would only 404.
    onSettled: () =>
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'id-scan' }),
  });
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

/** The next nights with occupancy, suggested rates, events, the forecast and arrival risks. */
export function useRevenueOutlook(days = 60) {
  return useQuery({
    queryKey: ['revenue-outlook', days],
    queryFn: () => apiGet(`/api/revenue/outlook?days=${days}`, revenueOutlookSchema),
  });
}

/** Sets nights' rates to a percent on top of their season; 0 goes back to the season rate. */
export function useAdjustRates() {
  return useRefreshingMutation((body: AdjustRatesBody) =>
    apiPost('/api/rates/adjust', body, pricingConfigSchema),
  );
}

export function useCreateEvent() {
  return useRefreshingMutation((body: LocalEventBody) =>
    apiPost('/api/events', body, localEventSchema),
  );
}

export function useDeleteEvent() {
  return useRefreshingMutation((id: string) => apiDelete(`/api/events/${encodeURIComponent(id)}`));
}

/** A few sentences from Muse Spark on the outlook. */
export function useRevenueBrief() {
  return useMutation({
    mutationFn: (days: number) => apiPost('/api/revenue/brief', { days }, revenueBriefSchema),
  });
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

import type {
  Attachment,
  AuditActor,
  AuditLogEntry,
  Booking,
  BookingStatus,
  Charge,
  Contact,
  Guest,
  HotelProfile,
  HousekeepingTask,
  HousekeepingTaskStatus,
  IdScan,
  InboxMessage,
  Inquiry,
  IsoDate,
  LocalEvent,
  MailDraft,
  MailLabel,
  PendingAction,
  Payment,
  PricingConfig,
  RateReview,
  Room,
  RoomStatus,
  RoomType,
  SavedStayReading,
  StaffMember,
  StayGuest,
} from '@orbit/shared';

export interface BookingFilter {
  /** Bookings with at least one night in `[from, to)`. */
  from?: IsoDate;
  to?: IsoDate;
  status?: BookingStatus[];
  guestId?: string;
  roomId?: string;
}

export interface RoomRepository {
  listRoomTypes(): Promise<RoomType[]>;
  listRooms(): Promise<Room[]>;
  getRoom(id: string): Promise<Room | null>;
  /**
   * Locks the room until the transaction ends, so two changes that book it are checked one after
   * the other instead of both passing the conflict check.
   */
  lockRoom(id: string): Promise<void>;
  setRoomStatus(id: string, status: RoomStatus): Promise<void>;
  createRoomType(roomType: RoomType): Promise<void>;
  /** Replaces a stored room type. */
  updateRoomType(roomType: RoomType): Promise<void>;
  createRoom(room: Room): Promise<void>;
  /** Replaces a stored room, including its status. */
  updateRoom(room: Room): Promise<void>;
}

export interface BookingRepository {
  listBookings(filter?: BookingFilter): Promise<Booking[]>;
  getBooking(id: string): Promise<Booking | null>;
  createBooking(booking: Booking): Promise<void>;
  /** Replaces a stored booking. */
  updateBooking(booking: Booking): Promise<void>;
}

export interface GuestRepository {
  listGuests(): Promise<Guest[]>;
  getGuest(id: string): Promise<Guest | null>;
  createGuest(guest: Guest): Promise<void>;
  /** Replaces a stored guest. */
  updateGuest(guest: Guest): Promise<void>;
}

export interface NewAuditEntry {
  actor: AuditActor;
  action: string;
  subjectId: string | null;
  payload: unknown;
}

export interface AuditRepository {
  append(entry: NewAuditEntry): Promise<AuditLogEntry>;
  /** Newest first. */
  list(filter?: {
    subjectId?: string;
    actor?: AuditActor;
    limit?: number;
  }): Promise<AuditLogEntry[]>;
}

/** Conversations with their messages. */
export interface InquiryRepository {
  /** Latest message first. */
  listInquiries(): Promise<Inquiry[]>;
  getInquiry(id: string): Promise<Inquiry | null>;
  /** Saves a new conversation with its messages. */
  createInquiry(inquiry: Inquiry): Promise<void>;
  /** Saves the conversation's own fields; messages change through the methods below. */
  updateInquiry(inquiry: Inquiry): Promise<void>;
  addMessage(message: InboxMessage): Promise<void>;
  /** Replaces a stored message, e.g. to keep its translation. */
  updateMessage(message: InboxMessage): Promise<void>;
  /** Deletes a conversation with its messages. */
  deleteInquiry(id: string): Promise<void>;
}

/** Labels, drafts and attachment files of the mailbox. */
export interface MailRepository {
  /** By name. */
  listLabels(): Promise<MailLabel[]>;
  /** Creates or replaces a label. */
  saveLabel(label: MailLabel): Promise<void>;
  deleteLabel(id: string): Promise<void>;
  /** Latest first. */
  listDrafts(): Promise<MailDraft[]>;
  getDraft(id: string): Promise<MailDraft | null>;
  /** Creates or replaces a draft. */
  saveDraft(draft: MailDraft): Promise<void>;
  deleteDraft(id: string): Promise<void>;
  saveAttachment(attachment: Attachment, bytes: Uint8Array): Promise<void>;
  /** The files' details, in the order asked, leaving out IDs that don't exist. */
  getAttachments(ids: string[]): Promise<Attachment[]>;
  readAttachment(id: string): Promise<{ attachment: Attachment; bytes: Uint8Array } | null>;
}

export interface PendingActionRepository {
  create(action: PendingAction): Promise<void>;
  get(id: string): Promise<PendingAction | null>;
  update(action: PendingAction): Promise<void>;
  /** Saves `action` only while the stored one is still pending; false if it was resolved first. */
  resolveIfPending(action: PendingAction): Promise<boolean>;
}

export interface TaskFilter {
  roomId?: string;
  status?: HousekeepingTaskStatus[];
}

export interface HousekeepingRepository {
  /** Oldest first. */
  listTasks(filter?: TaskFilter): Promise<HousekeepingTask[]>;
  getTask(id: string): Promise<HousekeepingTask | null>;
  createTask(task: HousekeepingTask): Promise<void>;
  updateTask(task: HousekeepingTask): Promise<void>;
}

export interface SettingsRepository {
  /** Null until a profile has been saved. */
  getProfile(): Promise<HotelProfile | null>;
  saveProfile(profile: HotelProfile): Promise<void>;
  /** Null until rates have been saved. */
  getPricing(): Promise<PricingConfig | null>;
  savePricing(pricing: PricingConfig): Promise<void>;
}

export interface StaffRepository {
  /** Active members first, then by name. */
  list(): Promise<StaffMember[]>;
  get(id: string): Promise<StaffMember | null>;
  create(member: StaffMember): Promise<void>;
  update(member: StaffMember): Promise<void>;
}

export interface BillingFilter {
  bookingId?: string;
  /** Posted or paid on a hotel day in `[from, to)`. */
  from?: IsoDate;
  to?: IsoDate;
}

export interface BillingRepository {
  /** Oldest first. */
  listCharges(filter?: BillingFilter): Promise<Charge[]>;
  getCharge(id: string): Promise<Charge | null>;
  createCharge(charge: Charge): Promise<void>;
  /** Replaces a stored charge. */
  updateCharge(charge: Charge): Promise<void>;
  deleteCharge(id: string): Promise<void>;
  /** Oldest first. */
  listPayments(filter?: BillingFilter): Promise<Payment[]>;
  createPayment(payment: Payment): Promise<void>;
}

/** Guest-book entries: the people staying in each booking's room. */
export interface StayGuestRepository {
  /** Oldest first. */
  listByBooking(bookingId: string): Promise<StayGuest[]>;
  /** The guest's most recently registered entry from another booking, to prefill from. */
  latestRegistered(guestId: string, exceptBookingId: string): Promise<StayGuest | null>;
  /** Creates or replaces an entry. */
  save(stayGuest: StayGuest): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface IdScanRepository {
  get(id: string): Promise<IdScan | null>;
  /** Creates or replaces a scan. */
  save(scan: IdScan): Promise<void>;
  delete(id: string): Promise<void>;
  /** Removes scans that expired at or before `now` (ISO datetime). */
  deleteExpired(now: string): Promise<void>;
}

/** Events in the area that move demand, for suggested rates. */
export interface LocalEventRepository {
  /** By first night. */
  list(): Promise<LocalEvent[]>;
  create(event: LocalEvent): Promise<void>;
  delete(id: string): Promise<void>;
}

/** The model's latest review of the rate outlook; one per hotel. */
export interface RateReviewRepository {
  /** Null before the first review. */
  get(): Promise<RateReview | null>;
  /** Replaces the review. */
  save(review: RateReview): Promise<void>;
}

/** What the model read from stays' notes for housekeeping, one per booking. */
export interface StayReadingRepository {
  list(bookingIds: string[]): Promise<SavedStayReading[]>;
  /** Creates or replaces the booking's reading. */
  save(reading: SavedStayReading): Promise<void>;
}

/** Suppliers and contractors the hotel calls. */
export interface ContactRepository {
  /** By name. */
  list(): Promise<Contact[]>;
  get(id: string): Promise<Contact | null>;
  /** Creates or replaces a contact. */
  save(contact: Contact): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface Repositories {
  rooms: RoomRepository;
  bookings: BookingRepository;
  guests: GuestRepository;
  audit: AuditRepository;
  inquiries: InquiryRepository;
  pendingActions: PendingActionRepository;
  housekeeping: HousekeepingRepository;
  settings: SettingsRepository;
  staff: StaffRepository;
  billing: BillingRepository;
  stayGuests: StayGuestRepository;
  idScans: IdScanRepository;
  stayReadings: StayReadingRepository;
  events: LocalEventRepository;
  rateReview: RateReviewRepository;
  contacts: ContactRepository;
  mail: MailRepository;
  /** Runs `fn` atomically; repositories passed to it share one transaction. */
  transaction<T>(fn: (repos: Repositories) => Promise<T>): Promise<T>;
}

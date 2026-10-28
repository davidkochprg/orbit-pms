import type {
  AuditActor,
  AuditLogEntry,
  Booking,
  BookingStatus,
  Charge,
  Guest,
  HotelProfile,
  HousekeepingTask,
  HousekeepingTaskStatus,
  IdScan,
  Inquiry,
  IsoDate,
  PendingAction,
  Payment,
  PricingConfig,
  Room,
  RoomStatus,
  RoomType,
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

export interface InquiryRepository {
  /** Newest first. */
  listInquiries(): Promise<Inquiry[]>;
  getInquiry(id: string): Promise<Inquiry | null>;
  createInquiry(inquiry: Inquiry): Promise<void>;
  updateInquiry(inquiry: Inquiry): Promise<void>;
}

export interface PendingActionRepository {
  create(action: PendingAction): Promise<void>;
  get(id: string): Promise<PendingAction | null>;
  update(action: PendingAction): Promise<void>;
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
  /** Runs `fn` atomically; repositories passed to it share one transaction. */
  transaction<T>(fn: (repos: Repositories) => Promise<T>): Promise<T>;
}

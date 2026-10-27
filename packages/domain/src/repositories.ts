import type {
  AuditActor,
  AuditLogEntry,
  Booking,
  BookingStatus,
  Guest,
  HousekeepingTask,
  HousekeepingTaskStatus,
  Inquiry,
  IsoDate,
  PendingAction,
  Room,
  RoomStatus,
  RoomType,
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
  list(filter?: { subjectId?: string; limit?: number }): Promise<AuditLogEntry[]>;
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

export interface Repositories {
  rooms: RoomRepository;
  bookings: BookingRepository;
  guests: GuestRepository;
  audit: AuditRepository;
  inquiries: InquiryRepository;
  pendingActions: PendingActionRepository;
  housekeeping: HousekeepingRepository;
  /** Runs `fn` atomically; repositories passed to it share one transaction. */
  transaction<T>(fn: (repos: Repositories) => Promise<T>): Promise<T>;
}

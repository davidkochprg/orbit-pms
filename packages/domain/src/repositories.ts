import type { Booking, BookingStatus, Guest, IsoDate, Room, RoomType } from '@orbit/shared';

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
}

export interface BookingRepository {
  listBookings(filter?: BookingFilter): Promise<Booking[]>;
  getBooking(id: string): Promise<Booking | null>;
}

export interface GuestRepository {
  listGuests(): Promise<Guest[]>;
  getGuest(id: string): Promise<Guest | null>;
}

export interface Repositories {
  rooms: RoomRepository;
  bookings: BookingRepository;
  guests: GuestRepository;
}

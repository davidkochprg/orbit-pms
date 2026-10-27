import type {
  AuditActor,
  Booking,
  Registration,
  RegistrationBody,
  RegistrationView,
} from '@orbit/shared';
import { hotelToday } from './dates';
import { DomainError } from './errors';
import type { Repositories } from './repositories';

/** Throws unless the stay may be registered: before or during the stay, and born before today. */
export function assertCanRegister(booking: Booking, body: RegistrationBody, today: string): void {
  if (booking.status !== 'confirmed' && booking.status !== 'checked_in') {
    throw new DomainError('invalid_transition', `A ${booking.status} booking can't be registered`);
  }
  if (body.dateOfBirth >= today) {
    throw new DomainError('invalid_input', 'The date of birth must be in the past');
  }
}

/** Check-in needs the stay's registration in the guest book. */
export async function assertRegistered(repos: Repositories, bookingId: string): Promise<void> {
  if (!(await repos.registrations.get(bookingId))) {
    throw new DomainError(
      'invalid_transition',
      'Register the guest before check-in: nationality, date of birth and ID document',
    );
  }
}

export interface RegistrationDeps {
  repos: Repositories;
  clock: () => Date;
}

/** The guest book: one registration per stay, for its main guest. */
export function createRegistrationService({ repos, clock }: RegistrationDeps) {
  async function loadBooking(id: string): Promise<Booking> {
    const booking = await repos.bookings.getBooking(id);
    if (!booking) throw new DomainError('not_found', `Booking ${id} not found`);
    return booking;
  }

  return {
    /** The stay's registration, and the guest's latest earlier one to prefill from. */
    async getView(bookingId: string): Promise<RegistrationView> {
      const booking = await loadBooking(bookingId);
      const registration = await repos.registrations.get(bookingId);
      const earlier = (await repos.registrations.listByGuest(booking.guestId)).find(
        (r) => r.bookingId !== bookingId,
      );
      const previous = earlier
        ? {
            nationality: earlier.nationality,
            dateOfBirth: earlier.dateOfBirth,
            documentType: earlier.documentType,
            documentNumber: earlier.documentNumber,
            address: earlier.address,
          }
        : null;
      return { registration, previous };
    },

    /** Records or corrects the registration. The audit log notes it without the personal data. */
    async register(
      bookingId: string,
      body: RegistrationBody,
      actor: AuditActor,
    ): Promise<Registration> {
      return repos.transaction(async (tx) => {
        const booking = await tx.bookings.getBooking(bookingId);
        if (!booking) throw new DomainError('not_found', `Booking ${bookingId} not found`);
        const now = clock();
        assertCanRegister(booking, body, hotelToday(now));
        const existed = (await tx.registrations.get(bookingId)) !== null;
        const registration: Registration = {
          ...body,
          bookingId,
          guestId: booking.guestId,
          registeredAt: now.toISOString(),
        };
        await tx.registrations.save(registration);
        await tx.audit.append({
          actor,
          action: existed ? 'booking.update_registration' : 'booking.register',
          subjectId: bookingId,
          payload: { nationality: registration.nationality },
        });
        return registration;
      });
    },
  };
}

export type RegistrationService = ReturnType<typeof createRegistrationService>;

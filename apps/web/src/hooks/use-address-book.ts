import { useMemo } from 'react';
import { useContacts, useGuests, useInbox } from '@/lib/api';
import { addressBook } from '@/lib/mail';

/** Everyone staff may write to, for address suggestions. */
export function useAddressBook() {
  const guests = useGuests().data;
  const contacts = useContacts().data;
  const inbox = useInbox().data;
  return useMemo(
    () => addressBook(guests ?? [], contacts ?? [], inbox ?? []),
    [guests, contacts, inbox],
  );
}

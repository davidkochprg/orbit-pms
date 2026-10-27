import type { Room, RoomKind, RoomType } from '@orbit/shared';
import { Pencil, Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { ErrorNotice } from '@/components/error-notice';
import { FormField } from '@/components/form-field';
import { Section } from '@/components/section';
import { Segmented } from '@/components/segmented';
import { Stepper } from '@/components/stepper';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useRooms, useRoomTypes, useSaveRoom, useSaveRoomType } from '@/lib/api';
import { formatCzk } from '@/lib/format';

interface Props {
  readOnly: boolean;
}

type Editing<T> = { item: T | null } | null;

const kinds: { value: RoomKind; label: string }[] = [
  { value: 'room', label: 'Room' },
  { value: 'apartment', label: 'Apartment' },
];

function capacity(t: RoomType): string {
  const adults = `${t.maxAdults} adult${t.maxAdults === 1 ? '' : 's'}`;
  if (t.maxChildren === 0) return adults;
  return `${adults} + ${t.maxChildren} child${t.maxChildren === 1 ? '' : 'ren'}`;
}

/** Room types with their base prices, and the rooms. Changes save right away. */
export function RoomSettings({ readOnly }: Props) {
  const roomTypes = useRoomTypes();
  const rooms = useRooms();
  const [editingType, setEditingType] = useState<Editing<RoomType>>(null);
  const [editingRoom, setEditingRoom] = useState<Editing<Room>>(null);

  if (roomTypes.isError || rooms.isError) {
    return <ErrorNotice message={(roomTypes.error ?? rooms.error)?.message ?? 'Failed to load'} />;
  }
  if (!roomTypes.data || !rooms.data) return <Skeleton className="h-80" />;
  const types = roomTypes.data;
  const typeName = new Map(types.map((t) => [t.id, t.name]));

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Room types"
        count={types.length}
        actions={
          !readOnly && (
            <Button variant="ghost" size="sm" onClick={() => setEditingType({ item: null })}>
              <Plus /> Add
            </Button>
          )
        }
      >
        <p className="-mt-1 max-w-prose text-sm text-muted-foreground">
          The base price is the adult rate per person per night, before season surcharges. New
          quotes use it as soon as you save.
        </p>
        <ul className="-mx-2 flex flex-col">
          {types.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{t.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {capacity(t)} · {rooms.data.filter((r) => r.roomTypeId === t.id).length} rooms
                </span>
              </span>
              <span className="shrink-0 text-sm tabular-nums">{formatCzk(t.basePrice)}</span>
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${t.name}`}
                  onClick={() => setEditingType({ item: t })}
                  className="text-muted-foreground"
                >
                  <Pencil />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Rooms"
        count={rooms.data.length}
        actions={
          !readOnly && (
            <Button variant="ghost" size="sm" onClick={() => setEditingRoom({ item: null })}>
              <Plus /> Add
            </Button>
          )
        }
      >
        <p className="-mt-1 max-w-prose text-sm text-muted-foreground">
          To take a room out of service, mark it out of order on the housekeeping board.
        </p>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {rooms.data.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => setEditingRoom({ item: r })}
                className="flex w-full flex-col items-start rounded-lg bg-surface-raised px-3 py-2 text-left shadow-raised outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
              >
                <span className="font-medium">{r.name}</span>
                <span className="w-full truncate text-xs text-muted-foreground">
                  {typeName.get(r.roomTypeId) ?? r.roomTypeId} · floor {r.floor}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Dialog open={editingType !== null} onOpenChange={(open) => !open && setEditingType(null)}>
        <DialogContent className="shadow-floating sm:max-w-md">
          {editingType && (
            <RoomTypeForm roomType={editingType.item} onDone={() => setEditingType(null)} />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={editingRoom !== null} onOpenChange={(open) => !open && setEditingRoom(null)}>
        <DialogContent className="shadow-floating sm:max-w-md">
          {editingRoom && (
            <RoomForm room={editingRoom.item} types={types} onDone={() => setEditingRoom(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoomTypeForm({ roomType, onDone }: { roomType: RoomType | null; onDone: () => void }) {
  const save = useSaveRoomType();
  const [name, setName] = useState(roomType?.name ?? '');
  const [maxAdults, setMaxAdults] = useState(roomType?.maxAdults ?? 2);
  const [maxChildren, setMaxChildren] = useState(roomType?.maxChildren ?? 0);
  const [basePrice, setBasePrice] = useState(String(roomType?.basePrice ?? ''));
  const [description, setDescription] = useState(roomType?.description ?? '');
  const price = Number(basePrice);
  const valid = name.trim() !== '' && Number.isInteger(price) && price > 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate(
      { id: roomType?.id, name, maxAdults, maxChildren, basePrice: price, description },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{roomType ? `Edit ${roomType.name}` : 'New room type'}</DialogTitle>
        <DialogDescription>
          Existing bookings keep their price; new quotes use these details.
        </DialogDescription>
      </DialogHeader>
      <FormField label="Name" htmlFor="type-name">
        <Input id="type-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <div className="flex flex-wrap gap-6">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Adults</span>
          <Stepper label="Adults" min={1} max={12} value={maxAdults} onChange={setMaxAdults} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Children</span>
          <Stepper
            label="Children"
            min={0}
            max={12}
            value={maxChildren}
            onChange={setMaxChildren}
          />
        </div>
      </div>
      <FormField
        label="Base price"
        htmlFor="type-price"
        hint="Adult rate per person per night, whole CZK."
      >
        <Input
          id="type-price"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          required
          value={basePrice}
          onChange={(e) => setBasePrice(e.target.value)}
          className="tabular-nums"
        />
      </FormField>
      <FormField label="Description" htmlFor="type-description">
        <Textarea
          id="type-description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormField>
      {save.error && <ErrorNotice message={save.error.message} />}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!valid || save.isPending}>
          {roomType ? 'Save' : 'Add room type'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function RoomForm({
  room,
  types,
  onDone,
}: {
  room: Room | null;
  types: RoomType[];
  onDone: () => void;
}) {
  const save = useSaveRoom();
  const [name, setName] = useState(room?.name ?? '');
  const [roomTypeId, setRoomTypeId] = useState(room?.roomTypeId ?? '');
  const [kind, setKind] = useState<RoomKind>(room?.kind ?? 'room');
  const [floor, setFloor] = useState(String(room?.floor ?? 1));
  const floorNumber = Number(floor);
  const valid = name.trim() !== '' && roomTypeId !== '' && Number.isInteger(floorNumber);

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate(
      { id: room?.id, name, roomTypeId, kind, floor: floorNumber },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{room ? `Edit room ${room.name}` : 'New room'}</DialogTitle>
        <DialogDescription>
          {room
            ? 'Its bookings stay in this room. A smaller room type only limits new bookings.'
            : 'A new room starts clean and can be booked right away.'}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Name" htmlFor="room-name">
          <Input
            id="room-name"
            required
            placeholder="e.g. 412"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <FormField label="Floor" htmlFor="room-floor">
          <Input
            id="room-floor"
            type="number"
            inputMode="numeric"
            step={1}
            required
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            className="tabular-nums"
          />
        </FormField>
      </div>
      <FormField label="Room type" htmlFor="room-type">
        <NativeSelect
          id="room-type"
          required
          value={roomTypeId}
          onChange={(e) => setRoomTypeId(e.target.value)}
        >
          <option value="" disabled>
            Choose a room type
          </option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <Segmented label="Kind" value={kind} options={kinds} onChange={setKind} />
      {save.error && <ErrorNotice message={save.error.message} />}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!valid || save.isPending}>
          {room ? 'Save' : 'Add room'}
        </Button>
      </DialogFooter>
    </form>
  );
}

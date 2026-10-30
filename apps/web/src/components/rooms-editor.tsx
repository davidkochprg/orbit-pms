import type { Room, RoomKind, RoomType } from '@orbit/shared';
import { Pencil, Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { ErrorNotice } from '@/components/error-notice';
import { FormField } from '@/components/form-field';
import { Panel } from '@/components/panel';
import { StatusDot } from '@/components/status-dot';
import { Segmented } from '@/components/segmented';
import { Stepper } from '@/components/stepper';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  useDayOverview,
  useHousekeeping,
  useReport,
  useRooms,
  useRoomTypes,
  useSaveRoom,
  useSaveRoomType,
} from '@/lib/api';
import { displayRegion, formatMoney } from '@/lib/format';
import { occupancyLabels } from '@/lib/housekeeping';
import { periodRange } from '@/lib/reports';
import { roomStatusColor, roomStatusLabels } from '@/lib/status';
import { cn } from '@/lib/utils';

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

/** "per room" or "per adult", as the hotel's rates are set up. */
function basisText(): string {
  return displayRegion().perRoom ? 'per room' : 'per adult';
}

/** Room types with their base prices, and the rooms. Changes save right away. */
export function RoomsEditor({ readOnly }: Props) {
  const roomTypes = useRoomTypes();
  const rooms = useRooms();
  const today = useDayOverview().data?.date;
  const report = useReport(today ? periodRange('last30', today) : null);
  const board = useHousekeeping();
  const [editingType, setEditingType] = useState<Editing<RoomType>>(null);
  const [editingRoom, setEditingRoom] = useState<Editing<Room>>(null);

  if (roomTypes.isError || rooms.isError) {
    return <ErrorNotice message={(roomTypes.error ?? rooms.error)?.message ?? 'Failed to load'} />;
  }
  if (!roomTypes.data || !rooms.data) return <Skeleton className="h-80 rounded-card" />;
  const types = roomTypes.data;
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const performance = new Map(report.data?.byRoomType.map((r) => [r.roomTypeId, r]));
  const tonight = new Map(board.data?.rooms.map((r) => [r.room.id, r.occupancy]));
  const floors = [...new Set(rooms.data.map((r) => r.floor))].sort((a, b) => b - a);

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Room types"
        count={types.length}
        actions={
          !readOnly && (
            <Button variant="ghost" size="xs" onClick={() => setEditingType({ item: null })}>
              <Plus /> Add
            </Button>
          )
        }
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 px-3 pt-2 pb-1 text-[0.6875rem] text-subtle-foreground sm:grid-cols-[minmax(0,1fr)_9rem_5rem_6rem_auto]">
          <span>Type</span>
          <span className="max-sm:hidden">Last 30 nights</span>
          <span className="text-right max-sm:hidden">ADR</span>
          <span className="text-right">Base, {basisText()}</span>
          <span className="w-6" />
        </div>
        <ul className="flex flex-col">
          {types.map((t) => {
            const count = rooms.data.filter((r) => r.roomTypeId === t.id).length;
            const perf = performance.get(t.id);
            return (
              <li
                key={t.id}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 border-t border-ink/5 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_9rem_5rem_6rem_auto]"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[0.8125rem] font-medium">{t.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {capacity(t)} · {count} room{count === 1 ? '' : 's'}
                  </span>
                </span>
                <span className="flex items-center gap-2 max-sm:hidden">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/6">
                    <span
                      className="block h-full rounded-full bg-primary/70"
                      style={{ width: `${Math.round((perf?.occupancy ?? 0) * 100)}%` }}
                    />
                  </span>
                  <span className="w-9 text-right font-mono text-xs text-muted-foreground tabular-nums">
                    {perf ? `${Math.round(perf.occupancy * 100)}%` : '–'}
                  </span>
                </span>
                <span className="text-right font-mono text-xs text-muted-foreground tabular-nums max-sm:hidden">
                  {perf && perf.roomNights > 0
                    ? formatMoney(Math.round(perf.roomRevenue / perf.roomNights))
                    : '–'}
                </span>
                <span className="text-right text-[0.8125rem] tabular-nums">
                  {formatMoney(t.basePrice)}
                </span>
                {readOnly ? (
                  <span className="w-6" />
                ) : (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Edit ${t.name}`}
                    onClick={() => setEditingType({ item: t })}
                    className="text-muted-foreground"
                  >
                    <Pencil />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel
        title="Rooms"
        count={rooms.data.length}
        actions={
          !readOnly && (
            <Button variant="ghost" size="xs" onClick={() => setEditingRoom({ item: null })}>
              <Plus /> Add
            </Button>
          )
        }
      >
        <div className="flex flex-col">
          {floors.map((floor) => (
            <section
              key={floor}
              className="flex flex-col gap-2 border-b border-ink/5 px-2 py-2.5 last:border-b-0 sm:flex-row sm:items-start"
            >
              <h3 className="w-24 shrink-0 px-1 pt-2 text-xs text-muted-foreground">
                {floor === 0 ? 'Ground floor' : `Floor ${floor}`}
              </h3>
              <ul className="grid flex-1 grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {rooms.data
                  .filter((r) => r.floor === floor)
                  .map((r) => {
                    const occupancy = tonight.get(r.id);
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => setEditingRoom({ item: r })}
                          title={`${roomStatusLabels[r.status]}${occupancy ? ` · ${occupancyLabels[occupancy]}` : ''}`}
                          className="flex w-full flex-col items-start gap-0.5 rounded-[10px] bg-background px-2.5 py-2 text-left ring-1 ring-ink/6 outline-none ring-inset hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
                        >
                          <span className="flex w-full items-center gap-1.5">
                            <span className="font-mono text-[0.8125rem] font-medium">{r.name}</span>
                            <StatusDot className={cn('ml-auto', roomStatusColor[r.status])} />
                          </span>
                          <span className="w-full truncate text-[0.6875rem] text-muted-foreground">
                            {typeName.get(r.roomTypeId) ?? r.roomTypeId}
                          </span>
                          <span className="text-[0.6875rem] text-subtle-foreground">
                            {occupancy ? occupancyLabels[occupancy] : '\u00a0'}
                          </span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
        </div>
      </Panel>

      <Dialog open={editingType !== null} onOpenChange={(open) => !open && setEditingType(null)}>
        <DialogContent aria-describedby={undefined} className="shadow-floating sm:max-w-md">
          {editingType && (
            <RoomTypeForm roomType={editingType.item} onDone={() => setEditingType(null)} />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={editingRoom !== null} onOpenChange={(open) => !open && setEditingRoom(null)}>
        <DialogContent aria-describedby={undefined} className="shadow-floating sm:max-w-md">
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
        label={`Base price, ${basisText()} per night (${displayRegion().currency})`}
        htmlFor="type-price"
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

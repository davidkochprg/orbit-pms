import type { HousekeepingRoom } from '@orbit/shared';
import type { ReactElement } from 'react';
import {
  type HouseRoomState,
  houseFloors,
  houseStateLabels,
  houseStates,
  type TonightStatus,
} from '@/lib/house-map';
import { bookingStatusColor } from '@/lib/status';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/ui/tooltip';

/**
 * A tile per state, drawn like the tape chart's bars: the status washed into the tile with its
 * stripe on the left. Free rooms are empty outlines; out-of-order rooms are hatched.
 */
const stripe =
  'relative before:absolute before:inset-y-1 before:left-1 before:w-[3px] before:rounded-full';
const stateClass: Record<HouseRoomState, string> = {
  hold: cn(stripe, 'border border-dashed border-status-hold/70 bg-bar-hold before:bg-status-hold'),
  confirmed: cn(
    stripe,
    'bg-bar-confirmed stroke-lit shadow-[0_1px_2px_var(--shadow-soft)] before:bg-status-confirmed',
  ),
  checked_in: cn(
    stripe,
    'bg-bar-checked-in stroke-lit shadow-[0_1px_2px_var(--shadow-soft)] before:bg-status-checked-in',
  ),
  leaving: cn(stripe, 'bg-ink/5 text-muted-foreground before:bg-status-checked-out'),
  vacant: 'text-subtle-foreground ring-1 ring-border ring-inset',
  out_of_order: 'bg-hatch text-subtle-foreground ring-1 ring-border ring-inset',
};

/** The legend's swatch per state: the stripe's color, or the tile itself for empty rooms. */
const swatchClass: Record<HouseRoomState, string> = {
  hold: bookingStatusColor.hold,
  confirmed: bookingStatusColor.confirmed,
  checked_in: bookingStatusColor.checked_in,
  leaving: bookingStatusColor.checked_out,
  vacant: 'ring-1 ring-border-strong ring-inset',
  out_of_order: 'bg-hatch ring-1 ring-border-strong ring-inset',
};

/**
 * The hotel drawn as a building, one row per floor, every room colored by tonight. A room with a
 * stay today opens it; a free room starts a booking for it.
 */
export function HouseMap({
  rooms,
  stays,
  tonight,
  onOpenStay,
  onBook,
  menu,
}: {
  rooms: HousekeepingRoom[];
  /** Today's stay per room id, see `stayByRoom`. */
  stays?: Map<string, string>;
  /** Tonight's stay status per room id, see `tonightByRoom`; occupancy stands in without it. */
  tonight?: Map<string, TonightStatus>;
  onOpenStay?: (bookingId: string) => void;
  onBook?: (roomId: string) => void;
  /** Wraps a room's tile in its right-click menu. */
  menu?: (roomId: string, tile: ReactElement) => ReactElement;
}) {
  const floors = houseFloors(rooms, tonight);
  // One column per room on the widest floor, so rooms line up across floors like windows. Tiles
  // share the panel's width, up to a size where they would stop reading as windows.
  const columns = Math.max(1, ...floors.map((f) => f.rooms.length));
  let index = 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        {floors.map((floor) => (
          <div key={floor.floor} className="flex items-center gap-3">
            <span
              aria-hidden
              className="w-3 shrink-0 text-center font-mono text-[0.6875rem] text-subtle-foreground"
            >
              {floor.label}
            </span>
            <ul
              aria-label={floor.floor === 0 ? 'Ground floor' : `Floor ${floor.floor}`}
              className="grid min-w-0 flex-1 gap-1 sm:gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                maxWidth: `${columns * 6.5}rem`,
              }}
            >
              {floor.rooms.map((room) => {
                const stay = stays?.get(room.id);
                const action =
                  stay && onOpenStay
                    ? () => onOpenStay(stay)
                    : room.state === 'vacant' && onBook
                      ? () => onBook(room.id)
                      : undefined;
                const tile = cn(
                  'flex aspect-[2/1] max-h-11 min-h-8 w-full min-w-0 items-center justify-center rounded-md font-mono text-[0.65625rem]',
                  stateClass[room.state],
                );
                const name = (
                  <>
                    <span className="sr-only">{room.label}</span>
                    <span aria-hidden className="overflow-hidden">
                      {room.name}
                    </span>
                  </>
                );
                return (
                  <Tip key={room.id} label={room.label}>
                    <li
                      style={{ animationDelay: `${index++ * 8}ms` }}
                      className="flex min-w-0 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 motion-safe:fill-mode-backwards motion-safe:animation-duration-300"
                    >
                      {(() => {
                        const inner = action ? (
                          <button
                            type="button"
                            onClick={action}
                            className={cn(
                              tile,
                              'cursor-pointer transition-[filter,translate] duration-150 ease-snap outline-none hover:brightness-[1.08] focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px dark:hover:brightness-125',
                            )}
                          >
                            {name}
                          </button>
                        ) : (
                          <span className={tile}>{name}</span>
                        );
                        return menu ? menu(room.id, inner) : inner;
                      })()}
                    </li>
                  </Tip>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 pl-6 text-xs text-muted-foreground">
        {houseStates.map((state) => (
          <li key={state} className="flex items-center gap-1.5">
            <span aria-hidden className={cn('size-2.5 rounded-[3px]', swatchClass[state])} />
            {houseStateLabels[state]}
          </li>
        ))}
      </ul>
    </div>
  );
}

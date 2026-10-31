import type { HousekeepingRoom } from '@orbit/shared';
import type { ReactElement } from 'react';
import { type HouseRoomState, houseFloors, houseStateLabels, houseStates } from '@/lib/house-map';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/ui/tooltip';

/** Fill per state: taken tonight in the accent, empty rooms as unlit windows. */
const stateClass: Record<HouseRoomState, string> = {
  staying:
    'bg-primary bg-linear-to-b from-white/20 to-transparent text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_1px_2px_var(--shadow-soft)]',
  arriving: 'bg-primary-soft text-primary-text ring-1 ring-primary/35 ring-inset',
  turnover:
    'bg-primary bg-linear-to-b from-white/20 to-transparent text-white shadow-[inset_0_-2px_0_var(--accent-peach),0_1px_2px_var(--shadow-soft)]',
  departing: 'border border-dashed border-border-strong text-muted-foreground',
  vacant: 'bg-ink/4 text-subtle-foreground',
  out_of_order: 'bg-hatch text-subtle-foreground ring-1 ring-border ring-inset',
};

/**
 * The hotel drawn as a building, one row per floor, every room colored by tonight. A room with a
 * stay today opens it; a free room starts a booking for it.
 */
export function HouseMap({
  rooms,
  stays,
  onOpenStay,
  onBook,
  menu,
}: {
  rooms: HousekeepingRoom[];
  /** Today's stay per room id, see `stayByRoom`. */
  stays?: Map<string, string>;
  onOpenStay?: (bookingId: string) => void;
  onBook?: (roomId: string) => void;
  /** Wraps a room's tile in its right-click menu. */
  menu?: (roomId: string, tile: ReactElement) => ReactElement;
}) {
  const floors = houseFloors(rooms);
  // One column per room on the widest floor, so rooms line up across floors like windows.
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
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 4rem))` }}
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
                  'flex h-8 w-full min-w-0 items-center justify-center rounded-md font-mono text-[0.65625rem]',
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
            <span aria-hidden className={cn('size-2.5 rounded-[3px]', stateClass[state])} />
            {houseStateLabels[state]}
          </li>
        ))}
      </ul>
    </div>
  );
}

import type { HousekeepingRoom } from '@orbit/shared';
import { type HouseRoomState, houseFloors, houseStateLabels, houseStates } from '@/lib/house-map';
import { cn } from '@/lib/utils';

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

/** The hotel drawn as a building, one row per floor, every room colored by tonight. */
export function HouseMap({ rooms }: { rooms: HousekeepingRoom[] }) {
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
              {floor.rooms.map((room) => (
                <li
                  key={room.id}
                  title={room.label}
                  style={{ animationDelay: `${index++ * 8}ms` }}
                  className={cn(
                    'flex h-8 min-w-0 items-center justify-center rounded-md font-mono text-[0.65625rem] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 motion-safe:fill-mode-backwards motion-safe:animation-duration-300',
                    stateClass[room.state],
                  )}
                >
                  <span className="sr-only">{room.label}</span>
                  <span aria-hidden className="overflow-hidden">
                    {room.name}
                  </span>
                </li>
              ))}
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

import type { ClassSection, Venue, VenueSession } from "./types";

/** Build venue usage from class sections (used for mock data / offline). */
export function venuesFromSections(sections: ClassSection[]): Venue[] {
  const map = new Map<string, VenueSession[]>();
  for (const s of sections) {
    for (const l of s.lessons) {
      if (!l.room) continue;
      const arr = map.get(l.room) ?? [];
      arr.push({
        weekday: l.weekday,
        start_period: l.start_period,
        end_period: l.end_period,
        start_time: l.start_time,
        end_time: l.end_time,
        module_code: s.module_code,
        class_code: s.class_code,
        weeks: l.weeks,
      });
      map.set(l.room, arr);
    }
  }
  return [...map.entries()]
    .map(([room, sessions]) => ({ room, sessions }))
    .sort((a, b) => a.room.localeCompare(b.room));
}

export function isVenueFree(venue: Venue, weekday: number, start: number, end: number): boolean {
  return !venue.sessions.some(
    (s) => s.weekday === weekday && !(s.end_period < start || end < s.start_period),
  );
}

export function freeVenues(venues: Venue[], weekday: number, start: number, end: number): Venue[] {
  return venues.filter((v) => isVenueFree(v, weekday, start, end));
}

export function filterVenues(venues: Venue[], q: string): Venue[] {
  const s = q.trim().toLowerCase();
  if (!s) return venues;
  return venues.filter((v) => v.room.toLowerCase().includes(s));
}

/** Building prefix from a room code, e.g. "B.203" -> "B". */
export function buildingOf(room: string): string {
  const m = /^([A-Za-z]+)/.exec(room);
  return m ? m[1].toUpperCase() : "Khác";
}

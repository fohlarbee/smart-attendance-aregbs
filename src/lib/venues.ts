// Known teaching spaces the lecturer can pick instead of fighting a GPS fix.
//
// The campus' halls are seeded by slug with *no* coordinates. A lecturer
// calibrates one once, from inside the room, by placing the pin and saving it —
// from then on picking the hall drops an exact centre with zero GPS error to
// absorb, which is the whole point (see SPEC.md §6: a saved centre contributes
// no `centreAccuracy` allowance, unlike a live fix).

import { prisma } from "@/lib/prisma";

/** The campus roster. Adding a hall here makes it appear after the next load. */
export const DEFAULT_VENUES = [
  { slug: "computer-science-department", name: "Computer science department" },
  { slug: "a1-lecture-hall", name: "A1 lecture hall" },
  { slug: "mpa", name: "Multipurpose Auditorium (MPA)" },
] as const;

export type VenueOption = {
  id: string;
  slug: string;
  name: string;
  lat: number | null;
  lng: number | null;
  radiusMetres: number | null;
};

let ensured: Promise<void> | null = null;

/**
 * Make sure every hall in DEFAULT_VENUES has a row. Create-only — it never
 * touches coordinates a lecturer has already calibrated. Memoised per process
 * so the common path is a single SELECT.
 */
function ensureDefaultVenues(): Promise<void> {
  ensured ??= (async () => {
    for (const [i, v] of DEFAULT_VENUES.entries()) {
      await prisma.venue.upsert({
        where: { slug: v.slug },
        update: { name: v.name, sortOrder: i },
        create: { slug: v.slug, name: v.name, sortOrder: i },
      });
    }
  })().catch((e) => {
    ensured = null; // let a later request retry (e.g. the table wasn't migrated yet)
    throw e;
  });
  return ensured;
}

/** Every venue, calibrated or not, in display order. */
export async function listVenues(): Promise<VenueOption[]> {
  await ensureDefaultVenues();
  return prisma.venue.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      lat: true,
      lng: true,
      radiusMetres: true,
    },
  });
}

/** True when the venue has a saved centre and can be selected straight away. */
export const isCalibrated = (v: {
  lat: number | null;
  lng: number | null;
}): boolean => v.lat != null && v.lng != null;

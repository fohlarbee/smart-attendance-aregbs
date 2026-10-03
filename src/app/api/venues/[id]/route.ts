import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { CAMPAIGN } from "@/lib/constants";

// PUT /api/venues/:id — calibrate a lecture hall's centre.
//
// The lecturer places the pin on the room (ideally while standing in it) and
// saves it. Every later session that picks this hall reuses the exact point, so
// the geofence no longer inherits whatever GPS error that day happened to have.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "LECTURER" && user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const lat = body.lat;
  const lng = body.lng;
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return NextResponse.json(
      { error: "A valid location is required." },
      { status: 400 },
    );
  }

  const raw = Math.round(Number(body.radiusMetres));
  const radiusMetres = Number.isFinite(raw)
    ? Math.min(CAMPAIGN.MAX_RADIUS_M, Math.max(CAMPAIGN.MIN_RADIUS_M, raw))
    : CAMPAIGN.DEFAULT_RADIUS_M;

  const existing = await prisma.venue.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Venue not found." }, { status: 404 });
  }

  const venue = await prisma.venue.update({
    where: { id },
    data: { lat, lng, radiusMetres },
    select: {
      id: true,
      slug: true,
      name: true,
      lat: true,
      lng: true,
      radiusMetres: true,
    },
  });

  console.log(
    `[venue:calibrate] id=${venue.id} name="${venue.name}" by=${user.id} ` +
      `center=(${lat},${lng}) radius=${radiusMetres}m`,
  );

  return NextResponse.json({ venue });
}

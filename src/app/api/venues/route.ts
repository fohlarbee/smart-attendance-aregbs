import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listVenues } from "@/lib/venues";

// GET /api/venues — the lecture halls a lecturer can pick when starting a session.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "LECTURER" && user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  return NextResponse.json({ venues: await listVenues() });
}

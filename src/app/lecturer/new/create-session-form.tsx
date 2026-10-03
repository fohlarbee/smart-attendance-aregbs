"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { CAMPAIGN, GEO } from "@/lib/constants";
import { reverseGeocode, mapLink, type GeoAddress } from "@/lib/geocode";
import { getAccuratePosition } from "@/lib/geolocation";
import { haversineMetres } from "@/lib/geo";
import { LocationPicker } from "@/components/location-picker";
import type { VenueOption } from "@/lib/venues";

type Center = { lat: number; lng: number };

/** Below this the pin is "the same spot" as the saved one — no re-save prompt. */
const SAME_SPOT_M = 3;

export function CreateSessionForm({
  courseId,
  courseCode,
  courseTitle,
  venues: initialVenues,
}: {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  venues: VenueOption[];
}) {
  const router = useRouter();
  const [venues, setVenues] = useState<VenueOption[]>(initialVenues);
  const [venueId, setVenueId] = useState<string>("");
  const [center, setCenter] = useState<Center | null>(null);
  // GPS accuracy in metres; null means an exact point (saved hall, or a pin
  // placed by hand) so the geofence adds no error allowance for the centre.
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [address, setAddress] = useState<GeoAddress | null>(null);
  const [radius, setRadius] = useState<number>(CAMPAIGN.DEFAULT_RADIUS_M);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const venue = venues.find((v) => v.id === venueId) ?? null;
  const venueCalibrated = venue != null && venue.lat != null && venue.lng != null;

  // Resolve a readable address whenever the centre moves.
  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    setAddress(null);
    reverseGeocode(center.lat, center.lng).then((a) => {
      if (!cancelled) setAddress(a);
    });
    return () => {
      cancelled = true;
    };
  }, [center]);

  // Picking a hall: jump straight to its saved centre and radius. An
  // uncalibrated hall keeps whatever is on the map so it can be saved below.
  function handleVenue(id: string) {
    setVenueId(id);
    setSaveError(null);
    setSavedTick(false);
    const v = venues.find((x) => x.id === id);
    if (!v || v.lat == null || v.lng == null) return;
    setCenter({ lat: v.lat, lng: v.lng });
    setAccuracy(null);
    setLocError(null);
    if (v.radiusMetres != null) setRadius(v.radiusMetres);
  }

  async function useMyLocation() {
    setLocating(true);
    setLocError(null);
    try {
      const fix = await getAccuratePosition();
      setCenter({ lat: fix.lat, lng: fix.lng });
      setAccuracy(fix.accuracy);
    } catch (e) {
      const denied = (e as GeolocationPositionError)?.code === 1;
      setLocError(
        denied
          ? "Location permission was denied. Allow it, or place the pin on the map."
          : "Couldn't get a location fix. Place the pin on the map instead.",
      );
    } finally {
      setLocating(false);
    }
  }

  // Dragging/clicking the map is a deliberate, precise choice.
  function handlePick(lat: number, lng: number) {
    setCenter({ lat, lng });
    setAccuracy(null);
    setSavedTick(false);
  }

  // Offer to remember this spot when the hall has none, or the pin/radius has
  // drifted from what's stored.
  const drifted =
    venue != null &&
    center != null &&
    (!venueCalibrated ||
      haversineMetres(venue.lat!, venue.lng!, center.lat, center.lng) >
        SAME_SPOT_M ||
      venue.radiusMetres !== radius);

  async function saveVenueLocation() {
    if (!venue || !center) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/venues/${venue.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: center.lat,
          lng: center.lng,
          radiusMetres: radius,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save this location.");
      setVenues((vs) => vs.map((v) => (v.id === data.venue.id ? data.venue : v)));
      setSavedTick(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save this location.");
    } finally {
      setSaving(false);
    }
  }

  async function start() {
    if (!center) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          centreLat: center.lat,
          centreLng: center.lng,
          centreAccuracy: accuracy != null ? Math.round(accuracy) : 0,
          radiusMetres: radius,
          label,
          venue: venue?.name ?? null,
          address: address?.full ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't start the session.");
      router.push(`/lecturer/session/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  const poorGps = accuracy != null && accuracy > GEO.POOR_ACCURACY_M;
  // The pin still sits exactly where the hall was saved.
  const onSavedSpot = venueCalibrated && drifted === false && center != null;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-wide text-primary">
          {courseCode}
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold">{courseTitle}</h1>
        <p className="mt-1 text-sm text-muted">
          Set the classroom, then start the beacon.
        </p>
      </div>

      {/* Location */}
      <div className="space-y-3 rounded-2xl border border-hairline bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Classroom location</p>
            <p className="text-xs text-muted">
              Pick a lecture hall, or set the pin yourself.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={useMyLocation}
            type="button"
            disabled={locating}
          >
            {locating ? "Locating…" : center ? "Recapture" : "Use my location"}
          </Button>
        </div>

        <div>
          <Label htmlFor="venue">Lecture hall</Label>
          <Select
            id="venue"
            value={venueId}
            onChange={(e) => handleVenue(e.target.value)}
          >
            <option value="">Custom location (set the pin)</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.lat == null ? " — location not saved yet" : ""}
              </option>
            ))}
          </Select>
        </div>

        <LocationPicker
          lat={center?.lat ?? null}
          lng={center?.lng ?? null}
          radius={radius}
          onChange={handlePick}
        />

        {venue && !venueCalibrated && (
          <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
            {venue.name} has no saved location yet. Standing in the hall, tap
            “Use my location” or drag the pin onto the building, then save it
            below — every future session here will reuse that exact point.
          </p>
        )}

        {drifted && center && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={saveVenueLocation}
              disabled={saving}
            >
              {saving
                ? "Saving…"
                : venueCalibrated
                  ? `Update ${venue!.name} to this spot`
                  : `Save this spot as ${venue!.name}`}
            </Button>
            {saveError && <span className="text-xs text-alert">{saveError}</span>}
          </div>
        )}
        {savedTick && !drifted && (
          <p className="text-xs text-success">✓ Saved for {venue?.name}.</p>
        )}

        <div className="text-sm">
          {!center && !locError && (
            <p className="text-faint">
              Pick a lecture hall above, tap the map to drop the pin, or use your
              location.
            </p>
          )}
          {locError && <p className="text-alert">{locError}</p>}
          {center && (
            <div className="space-y-2">
              <p className="font-mono text-success">
                ✓ {center.lat.toFixed(5)}, {center.lng.toFixed(5)}
                <span className="text-faint">
                  {" "}
                  {accuracy != null
                    ? `(GPS ±${Math.round(accuracy)}m)`
                    : onSavedSpot
                      ? `(saved: ${venue!.name})`
                      : "(pinned on map)"}
                </span>
              </p>
              {poorGps && (
                <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
                  This GPS fix is only accurate to ±{Math.round(accuracy!)}m. Pick
                  a saved lecture hall above, or drag the pin to the exact
                  building on the map.
                </p>
              )}
              {address && (
                <div className="rounded-lg border border-hairline bg-ink px-3 py-2">
                  <p className="text-sm text-fg">{address.full}</p>
                  {(address.state || address.country) && (
                    <p className="mt-0.5 text-xs text-muted">
                      {[address.state, address.country].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              )}
              <a
                href={mapLink(center.lat, center.lng)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs text-primary hover:underline"
              >
                View exact point on map ↗
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Radius */}
      <div className="rounded-2xl border border-hairline bg-surface p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Allowed radius</p>
          <span className="font-mono text-sm text-primary">{radius} m</span>
        </div>
        <input
          type="range"
          min={CAMPAIGN.MIN_RADIUS_M}
          max={CAMPAIGN.MAX_RADIUS_M}
          step={5}
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          className="mt-4 w-full accent-primary"
          aria-label="Allowed radius in metres"
        />
        <div className="mt-1 flex justify-between font-mono text-[11px] text-faint">
          <span>{CAMPAIGN.MIN_RADIUS_M} m</span>
          <span>{CAMPAIGN.MAX_RADIUS_M} m</span>
        </div>
      </div>

      {/* Label */}
      <div className="rounded-2xl border border-hairline bg-surface p-5">
        <Label htmlFor="label">Session label (optional)</Label>
        <Input
          id="label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Week 6 lecture"
          maxLength={80}
        />
      </div>

      {error && <p className="text-sm text-alert">{error}</p>}

      <Button
        size="lg"
        className="w-full"
        onClick={start}
        disabled={!center || submitting}
      >
        {submitting ? "Starting…" : "Start session"}
      </Button>
    </div>
  );
}

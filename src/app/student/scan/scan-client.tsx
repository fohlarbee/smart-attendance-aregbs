"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Html5Qrcode } from "html5-qrcode";
import { AnimatePresence, motion } from "motion/react";
import { SuccessCheck } from "@/components/beacon/success-check";
import { Button } from "@/components/ui/button";
import { getDeviceHash } from "@/lib/device";
import { reverseGeocode, mapLink } from "@/lib/geocode";
import { getAccuratePosition, type Fix } from "@/lib/geolocation";
import { GEO } from "@/lib/constants";

const READER_ID = "qr-reader";

// Some in-app browsers (WhatsApp, Instagram, Facebook, etc.) block or hang the
// camera. Detect them so we can tell the user to open a real browser.
function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /(FBAN|FBAV|Instagram|Line|WhatsApp|WeChat|Twitter|GSA)/i.test(
    navigator.userAgent,
  );
}

type Status =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "scanning" }
  | { kind: "marking" }
  | { kind: "success"; course: string; already: boolean }
  | { kind: "error"; message: string };

export function ScanClient() {
  const [status, setStatus] = useState<Status>({ kind: "starting" });
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [mapHref, setMapHref] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const coordsRef = useRef<Fix | null>(null);
  const lockRef = useRef(false);

  // Warm up GPS in the background and keep the best fix, so marking is quick.
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const fix: Fix = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
        };
        if (!coordsRef.current || fix.accuracy < coordsRef.current.accuracy) {
          coordsRef.current = fix;
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 12_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const getCoords = useCallback(async (): Promise<Fix> => {
    // Use the warmed fix if it's already good; otherwise wait for a good one.
    if (coordsRef.current && coordsRef.current.accuracy <= GEO.DESIRED_ACCURACY_M) {
      return coordsRef.current;
    }
    return getAccuratePosition();
  }, []);

  const stopScanner = useCallback(async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (s) {
      try {
        await s.stop();
        s.clear();
      } catch {
        /* already stopped */
      }
    }
  }, []);

  const submit = useCallback(
    async (token: string) => {
      if (lockRef.current) return;
      lockRef.current = true;
      await stopScanner();
      setStatus({ kind: "marking" });

      let coords: Fix;
      try {
        coords = await getCoords();
        setMapHref(mapLink(coords.lat, coords.lng));
        // Resolve a readable place for display (non-blocking).
        reverseGeocode(coords.lat, coords.lng).then((a) => {
          if (a) setLocationLabel(a.full);
        });
      } catch {
        setStatus({
          kind: "error",
          message:
            "Location is needed to prove you're in the room. Allow location access and try again.",
        });
        return;
      }

      let deviceHash: string | undefined;
      try {
        deviceHash = await getDeviceHash();
      } catch {
        /* degrade: skip the device layer if it can't be computed */
      }

      try {
        const res = await fetch("/api/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            lat: coords.lat,
            lng: coords.lng,
            accuracy: Math.round(coords.accuracy),
            deviceHash,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          setStatus({
            kind: "success",
            course: data.course ?? "",
            already: Boolean(data.alreadyMarked),
          });
        } else {
          setStatus({ kind: "error", message: data.error ?? "Couldn't mark attendance." });
        }
      } catch {
        setStatus({
          kind: "error",
          message: "Network problem. Check your connection and try again.",
        });
      }
    },
    [getCoords, stopScanner],
  );

  const startScanner = useCallback(async () => {
    lockRef.current = false;

    // The camera needs a secure context (https or localhost).
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setStatus({
        kind: "error",
        message:
          "The camera needs a secure connection. Open this app over https:// — a plain http address (e.g. an IP like 192.168.x.x) won't allow the camera.",
      });
      return;
    }
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setStatus({
        kind: "error",
        message: isInAppBrowser()
          ? "This in-app browser can't use the camera. Tap the ⋯ menu and choose “Open in browser” (Chrome/Safari)."
          : "This browser can't access the camera here. Try Chrome or Safari over https.",
      });
      return;
    }

    setStatus({ kind: "starting" });
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(READER_ID, { verbose: false });
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 15,
          // No fixed qrbox: scan the whole frame so the code is read wherever
          // it lands, instead of forcing it into a small centred square.
          aspectRatio: 1,
        },
        (decoded) => void submit(decoded),
        () => {},
      );
      setStatus({ kind: "scanning" });
    } catch (e) {
      const name = (e as { name?: string })?.name ?? "";
      const message =
        name === "NotAllowedError" || name === "SecurityError"
          ? "Camera access was blocked. Allow the camera for this site in your browser settings, then tap Try again."
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "No camera was found on this device."
            : name === "NotReadableError"
              ? "The camera is being used by another app. Close it, then tap Try again."
              : "";
      if (message) {
        setStatus({ kind: "error", message });
      } else if (isInAppBrowser()) {
        setStatus({
          kind: "error",
          message:
            "Couldn't open the camera in this in-app browser. Open the app in Chrome/Safari and try again.",
        });
      } else {
        // Unknown failure (often: the browser wants a user gesture). Fall back to
        // the manual "Start camera" button rather than a scary error.
        setStatus({ kind: "idle" });
      }
    }
  }, [submit]);

  // Auto-start the camera on arrival; fall back to the "Start camera" button if
  // that doesn't take. (The secure-context guard means http can't hang here.)
  useEffect(() => {
    void startScanner();
    return () => {
      void stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showReader = status.kind === "starting" || status.kind === "scanning";

  return (
    <div className="mx-auto max-w-md">
      <Link
        href="/student"
        className="mb-6 inline-block text-sm text-muted transition-colors hover:text-fg"
      >
        ← Home
      </Link>

      <h1 className="font-display text-2xl font-semibold">Scan the beacon</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        Point your camera at the code on the lecturer&apos;s screen.
      </p>

      <div className="relative aspect-square overflow-hidden rounded-3xl border border-hairline bg-surface">
        {/* html5-qrcode mounts the camera stream here */}
        <div id={READER_ID} className={showReader ? "h-full w-full" : "hidden"} />

        {showReader && status.kind === "starting" && (
          <p className="absolute inset-x-0 bottom-6 text-center text-sm text-muted">
            Starting camera…
          </p>
        )}

        {status.kind === "idle" && (
          <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <div>
              <p className="text-4xl">📷</p>
              <p className="mt-3 text-sm text-muted">
                Tap below to open the camera and scan the code.
              </p>
              {isInAppBrowser() && (
                <p className="mt-3 text-xs text-warn">
                  You&apos;re in an in-app browser. If the camera doesn&apos;t open,
                  use the ⋯ menu → “Open in browser”.
                </p>
              )}
            </div>
          </div>
        )}

        <AnimatePresence>
          {status.kind === "marking" && (
            <motion.div
              className="absolute inset-0 grid place-items-center bg-ink/80 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <p className="animate-pulse text-sm text-muted">Marking you present…</p>
            </motion.div>
          )}

          {status.kind === "success" && (
            <motion.div
              className="absolute inset-0 grid place-items-center bg-ink/90 p-8 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="flex flex-col items-center">
                <SuccessCheck />
                <p className="mt-5 font-display text-xl font-semibold text-success">
                  {status.already ? "Already marked" : "You're marked present"}
                </p>
                {status.course && (
                  <p className="mt-1 text-sm text-muted">{status.course}</p>
                )}
                {locationLabel && (
                  <p className="mt-3 text-xs text-faint">📍 {locationLabel}</p>
                )}
              </div>
            </motion.div>
          )}

          {status.kind === "error" && (
            <motion.div
              className="absolute inset-0 grid place-items-center bg-ink/90 p-8 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div>
                <p className="text-3xl">⚠</p>
                <p className="mt-4 text-sm text-alert">{status.message}</p>
                {locationLabel && (
                  <p className="mt-3 text-xs text-faint">
                    📍 Your location: {locationLabel}
                  </p>
                )}
                {mapHref && (
                  <a
                    href={mapHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs text-primary hover:underline"
                  >
                    View your exact point on map ↗
                  </a>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-6">
        {status.kind === "success" ? (
          <Link href="/student" className="block">
            <Button size="lg" className="w-full">
              Done
            </Button>
          </Link>
        ) : status.kind === "idle" ? (
          <Button size="lg" className="w-full" onClick={startScanner}>
            Start camera
          </Button>
        ) : status.kind === "error" ? (
          <Button size="lg" className="w-full" onClick={startScanner}>
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}

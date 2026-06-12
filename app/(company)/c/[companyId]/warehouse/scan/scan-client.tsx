"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { groupLocations, type LocationOption } from "@/lib/locations";
import { companyModulePath } from "@/types/roles";

import {
  resolveScan,
  scanTransferLot,
  type ScannedLocation,
  type ScannedLot,
} from "../actions";

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};

const STATUS_LABEL: Record<ScannedLot["status"], string> = {
  quarantine: "Karantina",
  released: "Serbest",
  blocked: "Bloklu",
};

const STATUS_VARIANT: Record<
  ScannedLot["status"],
  "default" | "warning" | "destructive"
> = {
  quarantine: "warning",
  released: "default",
  blocked: "destructive",
};

export function ScanClient({
  companyId,
  locations,
}: {
  companyId: string;
  locations: LocationOption[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastCodeRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });
  const scanningRef = useRef(false);

  const [cameraState, setCameraState] = useState<
    "idle" | "starting" | "active" | "unavailable"
  >("idle");
  const [lot, setLot] = useState<ScannedLot | null>(null);
  const [scannedLocation, setScannedLocation] =
    useState<ScannedLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");

  const handleCode = useCallback(
    async (raw: string) => {
      const now = Date.now();
      if (
        lastCodeRef.current.value === raw &&
        now - lastCodeRef.current.at < 5000
      ) {
        return;
      }
      lastCodeRef.current = { value: raw, at: now };

      setError(null);
      setSuccess(null);
      const result = await resolveScan(companyId, raw);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.kind === "lot") {
        setLot(result.lot);
        setScannedLocation(null);
      } else {
        setScannedLocation(result.location);
      }
    },
    [companyId],
  );

  const stopCamera = useCallback(() => {
    scanningRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraState("idle");
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setCameraState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setCameraState("active");
      scanningRef.current = true;

      let detector: BarcodeDetectorLike | null = null;
      let jsqrDecode:
        | ((data: Uint8ClampedArray, w: number, h: number) => { data: string } | null)
        | null = null;

      if ("BarcodeDetector" in window) {
        const Ctor = (
          window as unknown as {
            BarcodeDetector: new (opts: { formats: string[] }) => BarcodeDetectorLike;
          }
        ).BarcodeDetector;
        detector = new Ctor({ formats: ["qr_code"] });
      } else {
        const jsqrModule = await import("jsqr");
        jsqrDecode = (data, w, h) => jsqrModule.default(data, w, h);
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const tick = async () => {
        if (!scanningRef.current || !videoRef.current) return;
        const v = videoRef.current;
        if (v.readyState === v.HAVE_ENOUGH_DATA && ctx) {
          try {
            if (detector) {
              const codes = await detector.detect(v);
              if (codes.length > 0 && codes[0].rawValue) {
                void handleCode(codes[0].rawValue);
              }
            } else if (jsqrDecode) {
              canvas.width = v.videoWidth;
              canvas.height = v.videoHeight;
              ctx.drawImage(v, 0, 0);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsqrDecode(img.data, img.width, img.height);
              if (code?.data) {
                void handleCode(code.data);
              }
            }
          } catch {
            // tek kare hatasi taramayi durdurmasin
          }
        }
        if (scanningRef.current) {
          setTimeout(() => void tick(), 250);
        }
      };
      void tick();
    } catch {
      setCameraState("unavailable");
      setError(
        "Kameraya erişilemedi. İzin verin ya da aşağıdan lot numarasını veya raf kodunu elle girin.",
      );
    }
  }, [handleCode]);

  useEffect(() => stopCamera, [stopCamera]);

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manual.trim()) return;
    await handleCode(manual.trim());
  }

  async function handleTransfer(toLocationId: string, toName: string) {
    if (!lot) return;
    setBusy(true);
    setError(null);
    const result = await scanTransferLot(companyId, lot.id, toLocationId);
    setBusy(false);
    if (result.ok) {
      setSuccess(`${lot.lot_number} → ${toName} transferi tamamlandı.`);
      setLot(null);
      setScannedLocation(null);
      lastCodeRef.current = { value: "", at: 0 };
    } else {
      setError(result.error);
    }
  }

  const targets = lot
    ? locations.filter((l) => l.id !== lot.location_id)
    : [];
  const targetGroups = groupLocations(targets);
  const orphanShelves = targets.filter(
    (t) =>
      t.kind === "shelf" && !targetGroups.some((g) => g.depot.id === t.parent_id),
  );
  const putAwayReady =
    lot !== null &&
    scannedLocation !== null &&
    scannedLocation.id !== lot.location_id;

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-md border border-border p-4">
        {cameraState === "active" ? (
          <>
            <video
              ref={videoRef}
              className="mx-auto w-full max-w-sm rounded-md bg-black"
              muted
              playsInline
            />
            <Button variant="outline" onClick={stopCamera}>
              Kamerayı Kapat
            </Button>
          </>
        ) : (
          <Button
            onClick={() => void startCamera()}
            disabled={cameraState === "starting"}
          >
            {cameraState === "starting" ? "Kamera açılıyor..." : "Kamerayla Tara"}
          </Button>
        )}

        <form onSubmit={handleManualSubmit} className="flex max-w-sm gap-2">
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="veya lot no / raf kodunu elle girin"
            aria-label="Lot numarası veya raf kodu"
          />
          <Button type="submit" variant="outline">
            Bul
          </Button>
        </form>
      </div>

      {success ? (
        <p className="rounded-md border border-border bg-card px-3 py-2 text-sm">
          ✓ {success} Sıradaki etiketi okutabilirsiniz.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {lot ? (
        <div className="space-y-3 rounded-md border border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-lg font-semibold">
              {lot.lot_number}
            </span>
            <Badge variant={STATUS_VARIANT[lot.status]}>
              {STATUS_LABEL[lot.status]}
            </Badge>
            {lot.customer_owned_by ? (
              <Badge variant="warning">
                Müşteri Malı — {lot.customer_owned_by}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm">
            <span className="font-mono text-xs">{lot.material_code}</span> —{" "}
            {lot.material_name}
          </p>
          <p className="text-sm text-muted-foreground">
            Eldeki:{" "}
            <span className="font-mono">
              {lot.quantity_on_hand.toLocaleString("tr-TR")} {lot.base_uom}
            </span>{" "}
            · SKT: {lot.expiry_date ?? "—"} · Bulunduğu konum:{" "}
            {lot.location_name ?? "Ana Depo"}
          </p>

          {lot.status === "blocked" ? (
            <p className="text-xs text-muted-foreground">
              Bu lot &quot;Bloklu&quot; olduğu için transfer edilemez.
            </p>
          ) : scannedLocation && scannedLocation.id === lot.location_id ? (
            <p className="text-xs text-muted-foreground">
              Lot zaten {scannedLocation.name} konumunda. Başka bir raf okutun.
            </p>
          ) : putAwayReady && scannedLocation ? (
            <div className="space-y-2 rounded-md border border-border bg-secondary/30 p-3">
              <p className="text-sm">
                Okutulan raf:{" "}
                <span className="font-mono font-semibold">
                  {scannedLocation.code}
                </span>{" "}
                — {scannedLocation.name}
              </p>
              <Button
                disabled={busy}
                onClick={() =>
                  void handleTransfer(scannedLocation.id, scannedLocation.name)
                }
              >
                {busy
                  ? "Taşınıyor..."
                  : `${lot.lot_number} → ${scannedLocation.name} konumuna taşı`}
              </Button>
            </div>
          ) : targets.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Transfer için başka konum yok.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Raf etiketini okutun veya hedefi seçin:
              </p>
              {targetGroups.map((group) => (
                <div key={group.depot.id} className="flex flex-wrap gap-2">
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void handleTransfer(group.depot.id, group.depot.name)
                    }
                  >
                    {group.depot.name}
                  </Button>
                  {group.shelves.map((shelf) => (
                    <Button
                      key={shelf.id}
                      variant="outline"
                      disabled={busy}
                      onClick={() => void handleTransfer(shelf.id, shelf.name)}
                    >
                      {shelf.code} — {shelf.name}
                    </Button>
                  ))}
                </div>
              ))}
              {orphanShelves.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {orphanShelves.map((shelf) => (
                    <Button
                      key={shelf.id}
                      variant="outline"
                      disabled={busy}
                      onClick={() => void handleTransfer(shelf.id, shelf.name)}
                    >
                      {shelf.code} — {shelf.name}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {scannedLocation && !lot ? (
        <div className="space-y-3 rounded-md border border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-lg font-semibold">
              {scannedLocation.code}
            </span>
            <span className="text-sm">{scannedLocation.name}</span>
            <Badge variant="outline">
              {scannedLocation.kind === "shelf" ? "Raf" : "Depo"}
            </Badge>
            {scannedLocation.parent_name ? (
              <span className="text-xs text-muted-foreground">
                ({scannedLocation.parent_name} içinde)
              </span>
            ) : null}
          </div>

          {scannedLocation.lots.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Bu konumda stoklu lot yok.
            </p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {scannedLocation.lots.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="font-mono text-xs">{l.lot_number}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {l.material_name}
                  </span>
                  <span className="font-mono text-xs">
                    {l.quantity_on_hand.toLocaleString("tr-TR")} {l.base_uom}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    SKT: {l.expiry_date ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <Link
            href={companyModulePath(
              companyId,
              "warehouse",
              "locations",
              scannedLocation.id,
            )}
            className="text-xs text-muted-foreground hover:underline"
          >
            Konum detayına git →
          </Link>
          <p className="text-xs text-muted-foreground">
            Bir lot etiketi okutup ardından bu rafı okutarak lotu buraya
            taşıyabilirsiniz.
          </p>
        </div>
      ) : null}
    </div>
  );
}

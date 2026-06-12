"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  resolveLotForScan,
  scanTransferLot,
  type ScannedLot,
} from "../actions";

interface LocationOption {
  id: string;
  code: string;
  name: string;
  is_default: boolean;
}

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};

const STATUS_LABEL: Record<ScannedLot["status"], string> = {
  quarantine: "Karantina",
  released: "Serbest",
  blocked: "Bloklu",
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
      const result = await resolveLotForScan(companyId, raw);
      if (result.ok) {
        setLot(result.lot);
      } else {
        setLot(null);
        setError(result.error);
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
        "Kameraya erişilemedi. İzin verin ya da aşağıdan lot numarasını elle girin.",
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
      lastCodeRef.current = { value: "", at: 0 };
    } else {
      setError(result.error);
    }
  }

  const targets = lot
    ? locations.filter((l) => l.id !== lot.location_id)
    : [];

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
            placeholder="veya lot numarasını elle girin"
            aria-label="Lot numarası"
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
            <Badge
              variant={
                lot.status === "released"
                  ? "default"
                  : lot.status === "blocked"
                    ? "destructive"
                    : "warning"
              }
            >
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
            · Bulunduğu depo: {lot.location_name ?? "Ana Depo"}
          </p>

          {lot.status !== "released" ? (
            <p className="text-xs text-muted-foreground">
              Bu lot &quot;Serbest&quot; olmadığı için transfer edilemez.
            </p>
          ) : targets.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Transfer için başka depo yok.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {targets.map((t) => (
                <Button
                  key={t.id}
                  disabled={busy}
                  onClick={() => void handleTransfer(t.id, t.name)}
                >
                  {busy ? "Transfer ediliyor..." : `${t.name} deposuna al`}
                </Button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

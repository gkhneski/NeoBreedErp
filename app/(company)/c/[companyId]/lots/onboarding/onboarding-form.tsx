"use client";

import Link from "next/link";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { groupLocations, type LocationOption } from "@/lib/locations";
import { companyModulePath } from "@/types/roles";

import {
  createFinishedProductWithBarcode,
  findProductByBarcode,
  onboardLot,
  type OnboardLotState,
  type ProductOption,
} from "../actions";

const initialState: OnboardLotState = {};

type MaterialOption = ProductOption & { barcode: string | null };

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};

const BARCODE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "qr_code",
];

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

type TyOption = { barcode: string; title: string | null; image_url: string | null };

export function OnboardingForm({
  companyId,
  materials,
  locations,
  defaultLocationId,
  canCreateProduct,
  trendyolProducts,
}: {
  companyId: string;
  materials: MaterialOption[];
  locations: LocationOption[];
  defaultLocationId: string | null;
  canCreateProduct: boolean;
  trendyolProducts: TyOption[];
}) {
  const [state, formAction] = useActionState(onboardLot, initialState);
  const lotInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Art arda giris: urun/SKT/konum form reset'inden etkilenmesin diye controlled.
  const [materialId, setMaterialId] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [locationId, setLocationId] = useState(defaultLocationId ?? "");
  const [pickQuery, setPickQuery] = useState("");

  // Tarama durumu.
  const [createdProducts, setCreatedProducts] = useState<MaterialOption[]>([]);
  const [barcode, setBarcode] = useState("");
  const [resolving, setResolving] = useState(false);
  const [scanMsg, setScanMsg] = useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);
  const [newProduct, setNewProduct] = useState<
    { barcode: string; name: string } | null
  >(null);

  // Kamera.
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const lastRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });
  const [cameraState, setCameraState] = useState<
    "idle" | "starting" | "active" | "unavailable"
  >("idle");

  useEffect(() => {
    if (state.created) barcodeInputRef.current?.focus();
  }, [state]);

  const allMaterials: MaterialOption[] = [
    ...materials,
    ...createdProducts.filter((c) => !materials.some((m) => m.id === c.id)),
  ];
  const finished = allMaterials.filter((m) => m.type === "finished");
  const raw = allMaterials.filter((m) => m.type === "raw");
  const locationGroups = groupLocations(locations);
  const selectedMaterial = allMaterials.find((m) => m.id === materialId);

  const pq = pickQuery.trim().toLocaleLowerCase("tr");
  const filteredTy = pq
    ? trendyolProducts.filter((p) =>
        `${p.title ?? ""} ${p.barcode}`.toLocaleLowerCase("tr").includes(pq),
      )
    : trendyolProducts;

  const selectProduct = useCallback((p: ProductOption) => {
    setCreatedProducts((prev) =>
      prev.some((x) => x.id === p.id) ? prev : [...prev, { ...p, barcode: null }],
    );
    setMaterialId(p.id);
  }, []);

  const resolveBarcode = useCallback(
    async (rawValue: string) => {
      const code = rawValue.trim();
      if (!code || resolving) return;
      setScanMsg(null);
      setNewProduct(null);
      setResolving(true);
      const res = await findProductByBarcode(companyId, code);
      setResolving(false);

      if (res.ok) {
        selectProduct(res.product);
        setBarcode("");
        setScanMsg({
          kind: "ok",
          text: `Ürün: ${res.product.code} — ${res.product.name}`,
        });
        lotInputRef.current?.focus();
        return;
      }
      if ("notFound" in res) {
        if (canCreateProduct) {
          setNewProduct({ barcode: code, name: "" });
        } else {
          setScanMsg({
            kind: "err",
            text: "Bu barkod tanımlı değil. Yöneticinin ürünü tanımlaması gerekiyor.",
          });
        }
        return;
      }
      setScanMsg({ kind: "err", text: res.error });
    },
    [companyId, resolving, canCreateProduct, selectProduct],
  );

  // Trendyol kataloğundan seç: barkodla varsa eşle, yoksa Trendyol adıyla
  // otomatik bitmiş ürün oluştur ve seç.
  const handlePickTrendyol = useCallback(
    async (bc: string, title: string) => {
      if (!bc || resolving) return;
      setScanMsg(null);
      setNewProduct(null);
      setResolving(true);
      const res = await findProductByBarcode(companyId, bc);
      if (res.ok) {
        setResolving(false);
        selectProduct(res.product);
        setScanMsg({
          kind: "ok",
          text: `Ürün: ${res.product.code} — ${res.product.name}`,
        });
        lotInputRef.current?.focus();
        return;
      }
      if ("notFound" in res) {
        if (!canCreateProduct) {
          setResolving(false);
          setScanMsg({
            kind: "err",
            text: "Bu barkod tanımlı değil ve ekleme yetkiniz yok.",
          });
          return;
        }
        const created = await createFinishedProductWithBarcode(
          companyId,
          bc,
          title || bc,
        );
        setResolving(false);
        if (created.ok) {
          selectProduct(created.product);
          setScanMsg({
            kind: "ok",
            text: `Yeni ürün: ${created.product.code} — ${created.product.name}`,
          });
          lotInputRef.current?.focus();
        } else {
          setScanMsg({ kind: "err", text: created.error });
        }
        return;
      }
      setResolving(false);
      setScanMsg({ kind: "err", text: res.error });
    },
    [companyId, resolving, canCreateProduct, selectProduct],
  );

  async function handleCreateProduct() {
    if (!newProduct) return;
    if (!newProduct.name.trim()) {
      setScanMsg({ kind: "err", text: "Ürün adı girin." });
      return;
    }
    setResolving(true);
    const res = await createFinishedProductWithBarcode(
      companyId,
      newProduct.barcode,
      newProduct.name.trim(),
    );
    setResolving(false);
    if (res.ok) {
      selectProduct(res.product);
      setNewProduct(null);
      setBarcode("");
      setScanMsg({
        kind: "ok",
        text: `Yeni ürün oluşturuldu: ${res.product.code} — ${res.product.name}`,
      });
      lotInputRef.current?.focus();
    } else {
      setScanMsg({ kind: "err", text: res.error });
    }
  }

  const stopCamera = useCallback(() => {
    scanningRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraState("idle");
  }, []);

  const startCamera = useCallback(async () => {
    if (!("BarcodeDetector" in window)) {
      setCameraState("unavailable");
      setScanMsg({
        kind: "err",
        text: "Bu cihazın kamerası barkod taramayı desteklemiyor. El okuyucu kullanın veya barkodu elle girin.",
      });
      return;
    }
    setScanMsg(null);
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

      const Ctor = (
        window as unknown as {
          BarcodeDetector: new (o: { formats: string[] }) => BarcodeDetectorLike;
        }
      ).BarcodeDetector;
      const detector = new Ctor({ formats: BARCODE_FORMATS });

      const tick = async () => {
        if (!scanningRef.current || !videoRef.current) return;
        const v = videoRef.current;
        if (v.readyState === v.HAVE_ENOUGH_DATA) {
          try {
            const codes = await detector.detect(v);
            const value = codes[0]?.rawValue;
            const now = Date.now();
            if (
              value &&
              !(lastRef.current.value === value && now - lastRef.current.at < 3000)
            ) {
              lastRef.current = { value, at: now };
              stopCamera();
              void resolveBarcode(value);
              return;
            }
          } catch {
            // tek kare hatasi taramayi durdurmasin
          }
        }
        if (scanningRef.current) setTimeout(() => void tick(), 250);
      };
      void tick();
    } catch {
      setCameraState("unavailable");
      setScanMsg({
        kind: "err",
        text: "Kameraya erişilemedi. İzin verin ya da el okuyucu/elle giriş kullanın.",
      });
    }
  }, [resolveBarcode, stopCamera]);

  useEffect(() => stopCamera, [stopCamera]);

  return (
    <div className="space-y-4">
      {/* Barkod tarama paneli (ana formun DISINDA, yoksa formu submit eder) */}
      <div className="space-y-3 rounded-md border border-border bg-card/40 p-4">
        <Label htmlFor="barcode_scan">Barkod Okut / Gir</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="barcode_scan"
            ref={barcodeInputRef}
            value={barcode}
            autoFocus
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void resolveBarcode(barcode);
              }
            }}
            placeholder="El okuyucuyla okutun veya barkodu yazıp Enter'a basın"
            className="max-w-sm font-mono"
          />
          <Button
            type="button"
            variant="outline"
            disabled={resolving || !barcode.trim()}
            onClick={() => void resolveBarcode(barcode)}
          >
            {resolving ? "Aranıyor..." : "Bul"}
          </Button>
          {cameraState === "active" ? (
            <Button type="button" variant="outline" onClick={stopCamera}>
              Kamerayı Kapat
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={cameraState === "starting"}
              onClick={() => void startCamera()}
            >
              {cameraState === "starting" ? "Açılıyor..." : "Kamerayla Tara"}
            </Button>
          )}
        </div>

        {cameraState === "active" ? (
          <video
            ref={videoRef}
            className="w-full max-w-xs rounded-md bg-black"
            muted
            playsInline
          />
        ) : null}

        {trendyolProducts.length > 0 ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="product_pick">veya Ürün Seç</Label>
              <Input
                id="product_pick"
                value={pickQuery}
                onChange={(e) => setPickQuery(e.target.value)}
                placeholder="Ürün ara…"
                className="h-8 w-44 text-sm"
              />
            </div>
            <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
              {filteredTy.map((p) => (
                <button
                  key={p.barcode}
                  type="button"
                  disabled={resolving}
                  onClick={() => void handlePickTrendyol(p.barcode, p.title ?? "")}
                  className="group flex items-center gap-2.5 rounded-xl border border-border bg-background p-2 text-left transition-colors hover:border-emerald-500/60 hover:bg-secondary/40 disabled:opacity-50"
                >
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary">
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.image_url}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-xs font-medium leading-snug">
                      {p.title ?? "—"}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                      {p.barcode}
                    </p>
                  </div>
                </button>
              ))}
              {filteredTy.length === 0 ? (
                <p className="col-span-full py-4 text-center text-xs text-muted-foreground">
                  Eşleşen ürün yok.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {scanMsg ? (
          <p
            className={
              scanMsg.kind === "ok"
                ? "rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200"
                : "rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
            }
          >
            {scanMsg.kind === "ok" ? "✓ " : ""}
            {scanMsg.text}
          </p>
        ) : null}

        {newProduct ? (
          <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
            <p className="text-xs text-amber-900 dark:text-amber-200">
              <span className="font-mono">{newProduct.barcode}</span> tanımlı
              değil. Yeni bitmiş ürün olarak ekleyin (reçete sonra eklenir):
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                value={newProduct.name}
                autoFocus
                onChange={(e) =>
                  setNewProduct({ ...newProduct, name: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleCreateProduct();
                  }
                }}
                placeholder="Ürün adı (ör. DIOFOL 30 TABLET)"
                className="max-w-sm"
              />
              <Button
                type="button"
                disabled={resolving}
                onClick={() => void handleCreateProduct()}
              >
                {resolving ? "Oluşturuluyor..." : "Oluştur ve Seç"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewProduct(null)}
              >
                Vazgeç
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {state.created ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">
          <span>
            ✓ <span className="font-mono">{state.created.lot_number}</span>{" "}
            kaydedildi.
          </span>
          <Link
            href={companyModulePath(companyId, "lots", state.created.id, "label")}
            target="_blank"
            className="font-medium underline underline-offset-2"
          >
            Etiketi Yazdır
          </Link>
          <Link
            href={companyModulePath(companyId, "lots", state.created.id)}
            className="text-xs underline underline-offset-2"
          >
            Lotu Gör
          </Link>
        </div>
      ) : null}

      <form action={formAction} className="space-y-4 rounded-md border border-border bg-card/40 p-4">
        <input type="hidden" name="company_id" value={companyId} />

        <div className="space-y-1.5">
          <Label htmlFor="material_id">Ürün *</Label>
          <select
            id="material_id"
            name="material_id"
            required
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="" disabled>
              — Barkod okutun ya da seçin —
            </option>
            {finished.length > 0 ? (
              <optgroup label="Bitmiş Ürünler">
                {finished.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {raw.length > 0 ? (
              <optgroup label="Hammaddeler">
                {raw.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
          <FieldError message={state.fieldErrors?.material_id} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="lot_number">Lot Numarası *</Label>
            <Input
              id="lot_number"
              name="lot_number"
              required
              ref={lotInputRef}
              placeholder="Ürün üzerindeki lot no"
            />
            <FieldError message={state.fieldErrors?.lot_number} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quantity">
              Miktar *{" "}
              {selectedMaterial ? (
                <span className="text-muted-foreground">
                  ({selectedMaterial.base_uom})
                </span>
              ) : null}
            </Label>
            <Input
              id="quantity"
              name="quantity"
              type="number"
              step="0.000001"
              min="0"
              required
              placeholder="örn. 10"
            />
            <FieldError message={state.fieldErrors?.quantity} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="expiry_date">Son Kullanma Tarihi</Label>
            <Input
              id="expiry_date"
              name="expiry_date"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
            <FieldError message={state.fieldErrors?.expiry_date} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="location_id">Konum (Depo / Raf) *</Label>
            <select
              id="location_id"
              name="location_id"
              required
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="" disabled>
                — Konum seçiniz —
              </option>
              {locationGroups.map((group) => (
                <optgroup
                  key={group.depot.id}
                  label={`${group.depot.code} — ${group.depot.name}`}
                >
                  <option value={group.depot.id}>
                    {group.depot.code} — {group.depot.name}
                  </option>
                  {group.shelves.map((shelf) => (
                    <option key={shelf.id} value={shelf.id}>
                      {shelf.code} — {shelf.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <FieldError message={state.fieldErrors?.location_id} />
          </div>
        </div>

        {state.error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {state.error}
          </p>
        ) : null}

        <SubmitButton pendingLabel="Kaydediliyor...">
          Kaydet ve Sıradakine Geç
        </SubmitButton>
      </form>
    </div>
  );
}

"use client";

import {
  Building2,
  Check,
  Loader2,
  MapPin,
  MoreHorizontal,
  Phone,
  Plus,
  ShoppingBag,
  Store,
  Tag,
  Truck,
  User,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import {
  startTransition,
  useActionState,
  useMemo,
  useState,
  useTransition,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CustomerKind, ShipmentChannel } from "@/types/database";
import { companyModulePath } from "@/types/roles";

import {
  createShipment,
  createShipmentChannel,
  type ShipmentFormState,
} from "../actions";

export type RecipientOption = {
  id: string;
  code: string;
  name: string;
  kind: CustomerKind;
  contact_name: string | null;
  phone: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
};

type CustomChannel = { id: string; name: string };

type ChannelChoice = {
  key: string;
  channel: ShipmentChannel;
  channelId: string | null;
  label: string;
  hint: string;
  icon: LucideIcon;
};

const BUILT_IN_CHANNELS: ChannelChoice[] = [
  {
    key: "ecza",
    channel: "ecza",
    channelId: null,
    label: "Ecza Deposu",
    hint: "Kayıtlı depoya sevk",
    icon: Building2,
  },
  {
    key: "sahis",
    channel: "sahis",
    channelId: null,
    label: "Şahıs",
    hint: "Bireysel alıcıya",
    icon: User,
  },
  {
    key: "trendyol",
    channel: "trendyol",
    channelId: null,
    label: "Trendyol",
    hint: "Pazaryeri siparişi",
    icon: ShoppingBag,
  },
  {
    key: "hepsiburada",
    channel: "hepsiburada",
    channelId: null,
    label: "Hepsiburada",
    hint: "Pazaryeri siparişi",
    icon: Store,
  },
];

const OTHER_CHANNEL: ChannelChoice = {
  key: "diger",
  channel: "diger",
  channelId: null,
  label: "Diğer",
  hint: "Tanımsız kanal",
  icon: MoreHorizontal,
};

const CARRIERS = [
  "Yurtiçi Kargo",
  "Aras Kargo",
  "MNG Kargo",
  "PTT Kargo",
  "Sürat Kargo",
  "Trendyol Express",
  "HepsiJet",
  "UPS",
  "DHL",
  "Elden Teslim",
];

const initialState: ShipmentFormState = {};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

function Section({
  step,
  title,
  description,
  children,
  aside,
}: {
  step: number;
  title: string;
  description?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600/10 text-xs font-semibold text-green-700">
            {step}
          </span>
          <div>
            <h2 className="text-base font-semibold leading-7">{title}</h2>
            {description ? (
              <p className="text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  required,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
      <FieldError message={error} />
    </div>
  );
}

const inputClass = "h-10 rounded-lg";

export function ShipmentForm({
  companyId,
  customers,
  customChannels: initialCustomChannels,
}: {
  companyId: string;
  customers: RecipientOption[];
  customChannels: CustomChannel[];
}) {
  const [state, formAction, submitting] = useActionState(
    createShipment,
    initialState,
  );
  const [customChannels, setCustomChannels] = useState(initialCustomChannels);
  const [selectedKey, setSelectedKey] = useState("ecza");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [customerId, setCustomerId] = useState("");

  const [addingChannel, setAddingChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [channelError, setChannelError] = useState<string | null>(null);
  const [savingChannel, startSavingChannel] = useTransition();

  const choices = useMemo<ChannelChoice[]>(
    () => [
      ...BUILT_IN_CHANNELS,
      ...customChannels.map((c) => ({
        key: c.id,
        channel: "diger" as const,
        channelId: c.id,
        label: c.name,
        hint: "Özel kanal",
        icon: Tag,
      })),
      OTHER_CHANNEL,
    ],
    [customChannels],
  );
  const selected = choices.find((c) => c.key === selectedKey) ?? choices[0];
  const channel = selected.channel;
  const needsCustomer = channel === "ecza" || channel === "sahis";
  const isMarketplace = channel === "trendyol" || channel === "hepsiburada";
  const isIndividual = channel === "sahis";

  const recipientOptions = useMemo(
    () =>
      customers.filter((c) =>
        isIndividual ? c.kind === "individual" : c.kind !== "individual",
      ),
    [customers, isIndividual],
  );
  const selectedCustomer =
    recipientOptions.find((c) => c.id === customerId) ?? null;
  const fe = state.fieldErrors ?? {};

  function selectChannel(key: string) {
    setSelectedKey(key);
    setCustomerId("");
    const next = choices.find((c) => c.key === key);
    const nextIsIndividual = next?.channel === "sahis";
    const hasOptions = customers.some((c) =>
      nextIsIndividual ? c.kind === "individual" : c.kind !== "individual",
    );
    setMode(hasOptions ? "existing" : "new");
  }

  function saveChannel() {
    setChannelError(null);
    startSavingChannel(async () => {
      const res = await createShipmentChannel(companyId, newChannelName);
      if (!res.ok) {
        setChannelError(res.error);
        return;
      }
      setCustomChannels((prev) =>
        [...prev, res.channel].sort((a, b) =>
          a.name.localeCompare(b.name, "tr"),
        ),
      );
      setSelectedKey(res.channel.id);
      setNewChannelName("");
      setAddingChannel(false);
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="channel_id" value={selected.channelId ?? ""} />
      <input
        type="hidden"
        name="recipient_mode"
        value={needsCustomer ? mode : "existing"}
      />

      <Section
        step={1}
        title="Satış Kanalı"
        description="Siparişin geldiği kanal. Listede yoksa yeni kanal ekleyin."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {choices.map((c) => {
            const active = c.key === selected.key;
            const Icon = c.icon;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => selectChannel(c.key)}
                aria-pressed={active}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl border p-3 text-left transition-all",
                  active
                    ? "border-green-600 bg-green-50 ring-1 ring-green-600 dark:bg-green-950/30"
                    : "border-border bg-background hover:border-green-600/40 hover:bg-muted/40",
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                    active
                      ? "bg-green-600 text-white"
                      : "bg-muted text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {c.label}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {c.hint}
                  </span>
                </span>
                {active ? (
                  <Check className="absolute right-2 top-2 h-3.5 w-3.5 text-green-700" />
                ) : null}
              </button>
            );
          })}

          {addingChannel ? (
            <div className="col-span-2 flex flex-col gap-2 rounded-xl border border-dashed border-green-600/50 bg-green-50/40 p-3 sm:col-span-3 lg:col-span-2 dark:bg-green-950/20">
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveChannel();
                    }
                    if (e.key === "Escape") setAddingChannel(false);
                  }}
                  placeholder="Kanal adı (ör. Instagram, N11, Web Sitesi)"
                  className={inputClass}
                />
                <Button
                  type="button"
                  onClick={saveChannel}
                  disabled={savingChannel || newChannelName.trim().length < 2}
                  className="h-10"
                >
                  {savingChannel ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Ekle"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10"
                  aria-label="Vazgeç"
                  onClick={() => {
                    setAddingChannel(false);
                    setChannelError(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {channelError ? (
                <p className="text-xs text-destructive">{channelError}</p>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingChannel(true)}
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border p-3 text-sm font-medium text-muted-foreground transition-colors hover:border-green-600/60 hover:text-green-700"
            >
              <Plus className="h-4 w-4" />
              Yeni Kanal
            </button>
          )}
        </div>
        <FieldError message={fe.channel} />
      </Section>

      <Section
        step={2}
        title={
          channel === "ecza"
            ? "Ecza Deposu"
            : isIndividual
              ? "Alıcı Kişi"
              : "Alıcı & Sipariş Bilgisi"
        }
        description={
          needsCustomer
            ? "Kayıtlılardan seçin veya adres ve iletişim bilgileriyle yeni ekleyin."
            : "Sipariş numarası ve teslimat bilgileri."
        }
        aside={
          needsCustomer ? (
            <div className="inline-flex rounded-lg bg-muted p-1 text-xs font-medium">
              {(
                [
                  ["existing", "Kayıtlı"],
                  ["new", isIndividual ? "Yeni Kişi" : "Yeni Depo"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors",
                    mode === value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {value === "new" ? <UserPlus className="h-3.5 w-3.5" /> : null}
                  {label}
                </button>
              ))}
            </div>
          ) : null
        }
      >
        {needsCustomer && mode === "existing" ? (
          <div className="space-y-4">
            <Field
              label={isIndividual ? "Kişi" : "Ecza Deposu"}
              htmlFor="customer_id"
              required
              error={fe.customer_id}
            >
              <SearchableSelect
                key={channel}
                id="customer_id"
                name="customer_id"
                value={customerId}
                onChange={(v) => setCustomerId(v)}
                options={recipientOptions.map((c) => ({
                  value: c.id,
                  label: `${c.name}${c.city ? ` · ${c.city}` : ""}`,
                  keywords: [c.code, c.phone, c.contact_name, c.district]
                    .filter(Boolean)
                    .join(" "),
                }))}
                placeholder={
                  recipientOptions.length === 0
                    ? "Kayıt yok — yeni ekleyin"
                    : "Ara: ad, il, telefon…"
                }
                className="[&_input]:h-10 [&_input]:rounded-lg"
              />
            </Field>
            {recipientOptions.length === 0 ? (
              <button
                type="button"
                onClick={() => setMode("new")}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 hover:underline"
              >
                <UserPlus className="h-3.5 w-3.5" />
                {isIndividual ? "İlk kişiyi ekle" : "İlk ecza deposunu ekle"}
              </button>
            ) : null}
            {selectedCustomer ? (
              <div className="grid gap-3 rounded-xl bg-muted/50 p-4 text-sm sm:grid-cols-3">
                <div className="flex items-start gap-2">
                  <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{selectedCustomer.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedCustomer.contact_name ?? selectedCustomer.code}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Phone className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <p>{selectedCustomer.phone ?? "—"}</p>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <p className="text-xs leading-5">
                    {[
                      selectedCustomer.address,
                      [selectedCustomer.district, selectedCustomer.city]
                        .filter(Boolean)
                        .join(" / "),
                    ]
                      .filter(Boolean)
                      .join(", ") || "Adres girilmemiş"}
                  </p>
                </div>
              </div>
            ) : null}
            {!isIndividual ? (
              <Field
                label="Teslim Alacak Kişi"
                htmlFor="recipient"
                error={fe.recipient}
                className="sm:max-w-sm"
              >
                <Input
                  id="recipient"
                  name="recipient"
                  placeholder="opsiyonel — depodaki yetkili"
                  className={inputClass}
                />
              </Field>
            ) : null}
          </div>
        ) : null}

        {needsCustomer && mode === "new" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={isIndividual ? "Ad Soyad" : "Depo / Firma Adı"}
              htmlFor="nc_name"
              required
              error={fe.nc_name}
            >
              <Input
                id="nc_name"
                name="nc_name"
                autoComplete="off"
                className={inputClass}
              />
            </Field>
            {isIndividual ? (
              <Field
                label="TC Kimlik No"
                htmlFor="nc_tax_number"
                error={fe.nc_tax_number}
              >
                <Input
                  id="nc_tax_number"
                  name="nc_tax_number"
                  inputMode="numeric"
                  placeholder="opsiyonel — fatura için"
                  className={inputClass}
                />
              </Field>
            ) : (
              <Field
                label="Yetkili Kişi"
                htmlFor="nc_contact_name"
                error={fe.nc_contact_name}
              >
                <Input
                  id="nc_contact_name"
                  name="nc_contact_name"
                  placeholder="opsiyonel"
                  className={inputClass}
                />
              </Field>
            )}
            <Field
              label="Telefon"
              htmlFor="nc_phone"
              required
              error={fe.nc_phone}
            >
              <Input
                id="nc_phone"
                name="nc_phone"
                type="tel"
                inputMode="tel"
                placeholder="05xx xxx xx xx"
                className={inputClass}
              />
            </Field>
            <Field label="E-posta" htmlFor="nc_email" error={fe.nc_email}>
              <Input
                id="nc_email"
                name="nc_email"
                type="email"
                placeholder="opsiyonel"
                className={inputClass}
              />
            </Field>
            {!isIndividual ? (
              <>
                <Field
                  label="Vergi Dairesi"
                  htmlFor="nc_tax_office"
                  error={fe.nc_tax_office}
                >
                  <Input
                    id="nc_tax_office"
                    name="nc_tax_office"
                    placeholder="opsiyonel"
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Vergi No"
                  htmlFor="nc_tax_number"
                  error={fe.nc_tax_number}
                >
                  <Input
                    id="nc_tax_number"
                    name="nc_tax_number"
                    inputMode="numeric"
                    placeholder="opsiyonel"
                    className={inputClass}
                  />
                </Field>
              </>
            ) : null}
            <Field label="İl" htmlFor="nc_city" required error={fe.nc_city}>
              <Input id="nc_city" name="nc_city" className={inputClass} />
            </Field>
            <Field label="İlçe" htmlFor="nc_district" error={fe.nc_district}>
              <Input
                id="nc_district"
                name="nc_district"
                className={inputClass}
              />
            </Field>
            <Field
              label="Açık Adres"
              htmlFor="nc_address"
              required
              error={fe.nc_address}
              className="sm:col-span-2"
            >
              <Textarea
                id="nc_address"
                name="nc_address"
                rows={2}
                placeholder="Mahalle, cadde/sokak, bina no, daire"
                className="rounded-lg"
              />
            </Field>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Kaydedilen {isIndividual ? "kişi" : "depo"} müşteri listesine
              eklenir; sonraki siparişlerde &quot;Kayıtlı&quot; listesinden
              seçebilirsiniz.
            </p>
          </div>
        ) : null}

        {!needsCustomer ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={isMarketplace ? "Pazaryeri Sipariş No" : "Sipariş / Referans No"}
              htmlFor="external_order_no"
              required={isMarketplace}
              error={fe.external_order_no}
            >
              <Input
                id="external_order_no"
                name="external_order_no"
                placeholder={
                  isMarketplace
                    ? "pazaryeri panelindeki sipariş numarası"
                    : "opsiyonel"
                }
                className={inputClass}
              />
            </Field>
            <Field label="Alıcı Adı" htmlFor="recipient" error={fe.recipient}>
              <Input
                id="recipient"
                name="recipient"
                placeholder="siparişteki alıcı"
                className={inputClass}
              />
            </Field>
            <Field
              label="Telefon"
              htmlFor="recipient_phone"
              error={fe.recipient_phone}
            >
              <Input
                id="recipient_phone"
                name="recipient_phone"
                type="tel"
                inputMode="tel"
                placeholder="opsiyonel"
                className={inputClass}
              />
            </Field>
            <Field
              label="İl / İlçe"
              htmlFor="recipient_city"
              error={fe.recipient_city}
            >
              <Input
                id="recipient_city"
                name="recipient_city"
                placeholder="opsiyonel"
                className={inputClass}
              />
            </Field>
            <Field
              label="Teslimat Adresi"
              htmlFor="recipient_address"
              error={fe.recipient_address}
              className="sm:col-span-2"
            >
              <Textarea
                id="recipient_address"
                name="recipient_address"
                rows={2}
                placeholder="opsiyonel"
                className="rounded-lg"
              />
            </Field>
          </div>
        ) : null}
      </Section>

      <Section step={3} title="Kargo & Not">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kargo Firması" htmlFor="carrier" error={fe.carrier}>
            <div className="relative">
              <Truck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="carrier"
                name="carrier"
                list="carrier-options"
                placeholder="Seçin veya yazın"
                className={cn(inputClass, "pl-9")}
              />
              <datalist id="carrier-options">
                {CARRIERS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </Field>
          <Field
            label="Notlar"
            htmlFor="notes"
            error={fe.notes}
            className="sm:row-span-2"
          >
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Depo için not (opsiyonel)"
              className="rounded-lg"
            />
          </Field>
        </div>
      </Section>

      {state.error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Link href={companyModulePath(companyId, "shipments")}>
          <Button type="button" variant="outline" className="h-11 w-full px-6 sm:w-auto">
            İptal
          </Button>
        </Link>
        <Button
          type="submit"
          disabled={submitting}
          className="h-11 px-8 bg-green-700 text-white hover:bg-green-800"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Oluşturuluyor…
            </>
          ) : (
            "Siparişi Aç"
          )}
        </Button>
      </div>
    </form>
  );
}

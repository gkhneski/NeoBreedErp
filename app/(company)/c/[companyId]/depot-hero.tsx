"use client";

import { useEffect, useState } from "react";

const DAY_ABBR = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

type WeekDay = {
  label: string;
  day: number;
  isToday: boolean;
};

function buildWeek(now: Date): WeekDay[] {
  // Haftayi Pazartesi'den baslat (tr).
  const dow = now.getDay(); // 0=Paz
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      label: DAY_ABBR[d.getDay()],
      day: d.getDate(),
      isToday: d.toDateString() === now.toDateString(),
    };
  });
}

function greetingFor(now: Date | null): string {
  if (!now) return "Hoş geldiniz";
  const h = now.getHours();
  if (h < 6) return "İyi geceler";
  if (h < 12) return "Günaydın";
  if (h < 18) return "İyi günler";
  return "İyi akşamlar";
}

export function DepotHero({ companyName }: { companyName: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const greeting = greetingFor(now);

  const dateLabel = now
    ? now.toLocaleDateString("tr-TR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";
  const week = now ? buildWeek(now) : [];

  return (
    <section className="animate-fade-up relative overflow-hidden rounded-2xl border border-white/10 p-6 text-white shadow-2xl sm:p-8">
      {/* Aurora mesh zemin — marka teal'inden viyole/macentaya */}
      <div
        aria-hidden
        className="animate-aurora absolute inset-0 -z-10"
        style={{
          backgroundColor: "#0a0f1e",
          backgroundImage:
            "radial-gradient(60% 120% at 12% 18%, rgba(20,150,140,0.55) 0%, transparent 60%)," +
            "radial-gradient(55% 110% at 88% 8%, rgba(124,58,237,0.55) 0%, transparent 60%)," +
            "radial-gradient(70% 120% at 70% 95%, rgba(236,0,110,0.40) 0%, transparent 55%)," +
            "radial-gradient(50% 90% at 30% 100%, rgba(0,200,220,0.35) 0%, transparent 60%)",
        }}
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/60">
            {greeting} · Depo Paneli
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {companyName}
          </h1>

          <div className="flex items-end gap-3">
            <span
              className="font-mono text-5xl font-semibold tabular-nums sm:text-6xl"
              style={{ textShadow: "0 0 24px rgba(0,224,255,0.45)" }}
              suppressHydrationWarning
            >
              {now ? `${pad(now.getHours())}:${pad(now.getMinutes())}` : "--:--"}
            </span>
            <span className="mb-1.5 flex items-center gap-1.5 font-mono text-lg tabular-nums text-white/70">
              <span
                className="animate-pulse-dot inline-block h-2 w-2 rounded-full bg-cyan-300"
                style={{ boxShadow: "0 0 10px rgba(0,224,255,0.9)" }}
              />
              <span suppressHydrationWarning>
                {now ? pad(now.getSeconds()) : "--"}
              </span>
            </span>
          </div>
          <p
            className="text-sm capitalize text-white/70"
            suppressHydrationWarning
          >
            {dateLabel || " "}
          </p>
        </div>

        {/* Haftalik takvim seridi */}
        <div className="flex gap-1.5 sm:gap-2">
          {week.length > 0
            ? week.map((d, i) => (
                <div
                  key={i}
                  className={
                    "flex w-10 flex-col items-center rounded-xl px-1 py-2 text-center transition-colors sm:w-12 " +
                    (d.isToday
                      ? "bg-white text-slate-900 shadow-lg"
                      : "bg-white/10 text-white/75")
                  }
                  style={
                    d.isToday
                      ? { boxShadow: "0 0 22px rgba(255,255,255,0.45)" }
                      : undefined
                  }
                >
                  <span className="text-[10px] font-medium uppercase tracking-wide">
                    {d.label}
                  </span>
                  <span className="text-lg font-semibold tabular-nums">
                    {d.day}
                  </span>
                </div>
              ))
            : Array.from({ length: 7 }, (_, i) => (
                <div
                  key={i}
                  className="h-[52px] w-10 rounded-xl bg-white/5 sm:w-12"
                />
              ))}
        </div>
      </div>
    </section>
  );
}

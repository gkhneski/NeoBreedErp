# BACKUP_RESTORE.md — Yedekleme ve Geri Yükleme Tatbikatı (Faz 6)

Veritabanı tek doğruluk kaynağıdır (Supabase Postgres). Bu doküman ne yedeklendiğini, nasıl geri yükleneceğini ve tatbikatın nasıl yapılacağını tanımlar.

---

## 1. Ne, nerede yedekleniyor

| Varlık | Mekanizma | Sıklık |
|---|---|---|
| Postgres (tüm tenant verisi) | Supabase otomatik yedek (Dashboard → Database → Backups) | Günlük (plan dahilinde) |
| Storage `tenant-files` bucket | Supabase Storage — otomatik DB yedeğine **dahil değildir** | Manuel/script (aşağıda) |
| Şema | `supabase/migrations/*.sql` — git'te | Her commit |
| Uygulama kodu | GitHub `gkhneski/NeoBreedErp` | Her push |
| Ortam değişkenleri | Vercel project env + `.env.local` (lokal) | Değişiklikte elle |

> Not: Point-in-Time Recovery (PITR) ücretli eklentidir. Tenant sayısı arttığında açılması önerilir; günlük yedek aralığındaki veri kaybı riskini dakikalara indirir.

## 2. Geri yükleme adımları (DB)

1. Supabase Dashboard → Database → Backups → ilgili güne ait yedeği seç → **Restore**.
2. Restore tamamlanınca migration durumunu doğrula:
   `npx supabase migration list` — uzak ve lokal liste aynı olmalı.
3. Uygulama sağlığını doğrula (aşağıdaki tatbikat kontrol listesi 4–7).

## 3. Storage yedeği

`tenant-files` private bucket'ı DB yedeğine dahil değildir. Dosya hacmi büyüyene kadar kabul edilen risk; büyüdüğünde aylık şu script ile arşivlenir:

```
npx supabase storage cp -r ss:///tenant-files ./backup-tenant-files --experimental
```

## 4. Tatbikat kontrol listesi (çeyrekte bir çalıştır)

1. [ ] Dashboard'da son günlük yedeğin tarihi bugünden en fazla 24 saat eski.
2. [ ] `npx supabase migration list` — uzak/lokal eşit.
3. [ ] (Tam tatbikat) Yedeği yeni bir Supabase projesine restore et; prod'a dokunma.
4. [ ] `/login` 200 dönüyor.
5. [ ] Test firması ile giriş → panel kartları doluyor.
6. [ ] Bir lot detayı açılıyor (tenant verisi okunuyor).
7. [ ] Anon anahtar ile REST sorgusu 0 satır dönüyor (RLS ayakta).

Son tatbikat: **2026-06-11** — adım 2 (migration list 10/10 eşit), 4 (/login 200) ve 7 (anon REST 0 satır) doğrulandı. Adım 1 Dashboard'dan elle kontrol edilmeli; adım 3 (tam restore) ilk gerçek tenant verisi öncesi bir kez yapılmalı.

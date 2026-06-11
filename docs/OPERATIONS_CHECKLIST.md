# OPERATIONS_CHECKLIST.md — Neyi Nasıl Kontrol Edeceksin

Platform sahibinin (Gökhan) elle yapacağı kontroller. Komutlar proje klasöründe çalıştırılır:
`cd c:\Users\geski\Desktop\projekte\NeoBreed-ERP`

---

## A. Hızlı sağlık kontrolü (haftada bir, ~5 dk)

| Adım | Nasıl | Beklenen |
|---|---|---|
| 1. Site ayakta mı | Tarayıcıda https://neobreed-erp.vercel.app/login | Login sayfası açılır |
| 2. Giriş çalışıyor mu | Kendi hesabınla gir | Superadmin paneli açılır |
| 3. Tenant tarafı | Test firması hesabıyla gir | Panel kartları dolu gelir |
| 4. Kod sağlığı | `npm run typecheck` ve `npm run lint` | İkisi de hatasız biter |
| 5. E2E testler | `npm run test:e2e` | "X passed" — hiç "failed" yok |

> Test sonunda `failed` görürsen çıktının tamamını kopyala, Claude'a yapıştır.

## B. Tenant E2E testlerini etkinleştirme (tek seferlik)

Şu an 2 test "skipped" — test kullanıcısı tanımlı değil.

1. `.env.local` dosyasını aç (bu dosya **asla commit edilmez**).
2. En alta test firmasının bir **company_admin** kullanıcısını ekle:
   ```
   E2E_EMAIL=test-firmasinin-admin-epostasi
   E2E_PASSWORD=sifresi
   ```
   Gerçek müşteri hesabı kullanma; demo/test firması (örn. NeuPharma) hesabı kullan.
3. Kaydet, `npm run test:e2e` çalıştır.
4. Beklenen: **6 passed, 0 skipped** — giriş akışı ve firma izolasyonu (yabancı firma rotasında 404) otomatik doğrulanır.

## C. Yedek kontrolü (ayda bir, ~2 dk)

1. https://supabase.com/dashboard → projeyi seç.
2. Sol menü **Database → Backups**.
3. En üstteki yedeğin tarihi **son 24 saat içinde** olmalı.
4. Değilse: Settings → Billing'de plan durumunu kontrol et; çözülmezse Supabase support.

## D. Tam restore tatbikatı (ilk gerçek müşteri öncesi, bir kez)

1. Dashboard'da **yeni boş bir Supabase projesi** oluştur (adı örn. `neobreed-restore-test`).
2. Asıl projede Database → Backups → en son yedek → **Restore**'u yeni projeye yönlendirerek uygula (Supabase "restore to new project" seçeneği sunar; sunmuyorsa yedeği indir, yeni projeye `psql` ile yükle — bu adımda bana danış).
3. Yeni projenin Table Editor'ünde `companies`, `materials`, `material_lots` tablolarında satırların geldiğini gör.
4. Tatbikat bitince test projesini **sil** (ücret işlememesi için).
5. [BACKUP_RESTORE.md](BACKUP_RESTORE.md) içindeki "Son tatbikat" satırına tarihi işle.

## E. PITR açma (ilk gerçek müşteri ile birlikte)

1. Dashboard → proje → **Settings → Add-ons → Point in Time Recovery**.
2. Etkinleştir (ücretlidir; günlük yedek aralığındaki veri kaybını dakikalara indirir).

## F. Deploy kontrolü ve geri alma

| İş | Komut |
|---|---|
| Son deploy'lar ve durumları | `vercel ls` (en üstte Production ● Ready olmalı) |
| Canlıdaki sürüm bozuksa geri al | `vercel rollback` (bir önceki production'a döner) |
| Yeni preview deploy | `git push` yeterli (branch push'ı otomatik preview oluşturur) |
| Preview'ı canlıya alma | `vercel promote <preview-url> --yes` |

## G. Veritabanı şeması kontrolü

| İş | Komut | Beklenen |
|---|---|---|
| Lokal/uzak migration eşit mi | `npx supabase migration list` | İki sütun birebir aynı |
| Yeni migration'ı uygula | `npx supabase db push` | Önce `--dry-run` ile bak |

# ROLE_GUIDE.md — Hangi rol neyi yapabilir ve nasıl yapar

Yaşayan doküman. **Bir rol, modül veya iş akışı değiştiğinde aynı değişiklikte bu dosya da güncellenir.**
Yetkilerin asıl kaynağı [types/roles.ts](../types/roles.ts) dosyasıdır; bu dosya onu sade dille anlatır.
Menü ve buton adları uygulamada göründüğü gibi yazılmıştır.

Son gözden geçirme: 2026-09-29.

---

## 1. Rollere genel bakış

| Rol (rozet) | Kim | Neyi görür | Neyi değiştirir |
|---|---|---|---|
| Platform admini | Gökhan (platform sahibi) | Yalnızca `/superadmin`: firmalar, paketler, kullanıcılar, denetim kaydı | Firmalar, paketler, koltuk limitleri. Hiçbir firmanın stok, üretim veya maliyetine **dokunmaz** |
| `company_admin` (FIRMA ADMINI) | Firma sahibi / yöneticisi | Firmadaki her şey | Her şey; ayrıca kullanıcılar ve pazaryeri bağlantı bilgileri |
| `production_manager` (URETIM) | Üretim sorumlusu | Her şey | Ana veri, üretim, stok, sevkiyat, siparişler, Ajan Kurulu |
| `quality_manager` (KALITE) | Kalite sorumlusu | Her şey | Yalnızca kalite kontrolleri ve dosya ekleri |
| `operator` (OPERATOR) | Depocu | Yalnızca bitmiş ürün (bkz. 3.1) | Stok okutma/kabul, sevkiyat, siparişler, pazaryeri |
| `company_user` (KULLANICI) | Genel personel | Her şey | Üretim sorumlusuyla aynı, ek olarak kalite |
| `viewer` (OKUMA) | Salt okuma | Her şey | Hiçbir şey |
| `regional_manager` (BOLGE) | Satış temsilcisi | Panel, siparişler, ürünler, stok, üretim (salt okuma), müşteriler, satış | Eczaneler adına sipariş girer |
| Eczane alıcısı | Dış eczane | Yalnızca `/portal` (ERP'ye giremez) | Kendi siparişleri |

Yazma grupları (`types/roles.ts`):

| Grup | company_admin | production_manager | quality_manager | operator | company_user | regional_manager |
|---|---|---|---|---|---|---|
| Ana veri (hammadde, ürün, reçete, tedarikçi) | evet | evet | – | – | evet | – |
| Üretim (emir, parti) | evet | evet | – | evet | evet | – |
| Kalite | evet | – | evet | – | evet | – |
| Stok (lot, mal kabul, okutma) | evet | evet | – | evet | evet | – |
| Dosyalar (analiz sertifikası, ekler) | evet | evet | evet | – | evet | – |
| Sevkiyat | evet | evet | – | evet | evet | – |
| B2B satış siparişleri | evet | evet | – | evet | evet | evet |
| Pazaryeri (liste, fiyat onayı) | evet | evet | – | evet | evet | – |
| Ajan Kurulu (yapay zekâ ajanları) | evet | evet | – | – | evet | – |
| Kullanıcılar, pazaryeri bağlantı bilgileri | evet | – | – | – | – | – |

`viewer` hiçbir yazma grubunda yer almaz.

---

## 2. Menüdeki firma yapısı

- **İmalat A.Ş.** (fabrika): Hammaddeler, Ambalaj Malzemeleri, Yarı Mamüller, Lotlar, Stok Girişi (Barkod), Stok, Depo Hareketleri, Reçeteler, Üretim, Kalite Kontrol, Üretim İş Listesi, Tedarikçiler, MRP (İhtiyaç Planlama), Satınalma Siparişleri, Fatura / İrsaliye, Genel Giderler.
- **Satış Ltd. Şti.** (satış): Ürünler, Müşteriler, Satış & Ürünler, Eczane Siparişleri, Portal Kataloğu, Siparişler (sevkiyat), Eczane Hesapları, Pazaryeri, Web Sitesi.
- **Ortak**: Ajan Kurulu, Cari Hesaplar, Raporlar, Kullanıcılar, Ayarlar.

İki şirket **tek kiracıdır**. Depolar birer konumdur: `ANA` = Ana Depo (fabrika), `LTD` = NeuPharma LTD.ŞTİ. (satış deposu).

---

## 3. Rol rol anlatım

### 3.1 Operator (depocu) — yalnızca bitmiş ürün

Menü: Panel, Stok, Depo Hareketleri, Siparişler (sevkiyat), Eczane Siparişleri, Satış & Ürünler, Ürünler (salt okuma), Pazaryeri, Stok Girişi (Barkod).
Hammadde, fabrika lotları, reçete, üretim, maliyet ve tedarikçileri hiçbir zaman görmez.

**Bir partiyi LTD deposuna sayarak almak**
1. Parti kartındaki QR'ı telefon kamerasıyla açın; ya da *Depo Hareketleri → Barkod Tara → Kamerayla Tara* (kamera yoksa lot numarasını yazıp *Bul*).
2. Ürünü sayıp *Sayılan miktar* alanına yazın.
3. *NeuPharma LTD.ŞTİ.* (veya altındaki bir raf) butonuna basın.
4. Sayım sistemdeki miktara eşitse lot hemen alınır.
5. Farklıysa sarı bir kutu farkı gösterir. Nedenini yazın, *"… olarak stoğa al"* butonuna basın. Sayılan miktar stok olur; fark düzeltme hareketi olarak kayda geçer.
6. Lot, biri serbest bırakana kadar **karantinada** kalır (bkz. 3.2).

**Aynı depo içinde rafa yerleştirmek:** lotu okutun, ardından raf etiketini okutun (veya listeden seçin). Sayım gerekmez.

**Raf okutmak:** raftaki lotlar listelenir.

**Sipariş hazırlamak ve göndermek:** *Eczane Siparişleri* → siparişi açın → sevkiyata çevirin; ya da *Siparişler → Yeni*. Serbest lotları seçin, gönderin. Gönderilmiş sevkiyat değiştirilemez.

**Pazaryeri:** fiyat önerilerini onaylar/reddeder, stok gönderir, listeleri eşleştirir.

**Stok Girişi (Barkod):** mevcut bitmiş ürün stoğunu ürün barkodunu okutarak girer.

### 3.2 Firma admini / üretim sorumlusu / firma kullanıcısı

- **Ana veri:** Hammaddeler, Ambalaj, Yarı Mamüller, Ürünler (*Yeni Ürün*), Tedarikçiler, Müşteriler.
- **Reçeteler:** *Reçeteler → Yeni*. Kesin kural: YM reçetesinde yalnızca hammadde; mamül reçetesinde yalnızca YM ve ambalaj olur. Kullanmadan önce yayınlayın.
- **Üretim:**
  1. *Üretim → Yeni Üretim Emri*: yayında bir reçete ve hedef miktarı seçin. Bitmiş ürün miktarı **kutu** cinsindendir.
  2. *Planla* → *Üretime Al*. Depoda tam bir YM partisi varsa parti numarası ondan önerilir; parti numarası ürün bazında benzersizdir.
  3. *Tamamla*: her kalem için tüketilen lotları, çıkış lot numarasını, SKT'yi ve konumu girin. Çıkış lotu karantinada açılır.
  4. Tamamlanan emirde *Parti Kartı (PDF)*: ürün resmi, parti/lot numarası, içerik ve QR içeren tek sayfalık A4. Yazdır penceresinden PDF olarak kaydedilir.
  5. Emir tamamlanana kadar düzenlenebilir; yanlış girilen emirler silinebilir (*Silme Protokolü*'nde kayıt tutulur).
- **Stok:** *Lotlar* (liste, düzenle, yanlış girilen lotu sil, *Etiket Yazdır (QR)*), *Mal Kabul*, *Stok Hareketi*, *Stok Değerleme* (maliyetsiz lotlara toplu birim maliyet), stok hareketi iptali (storno).
- **Karantinadan çıkarma:** *Lotlar*'da lotu açıp durumunu *Serbest* yapın (gereken yerde kalite onayından sonra). Yalnızca serbest lotlar satılabilir stoktur.
- **Satınalma:** *MRP* açık siparişlerden ihtiyacı hesaplar; *Satınalma Siparişleri* tedarikçiye gönderir ve mal kabulü kaydeder; *Fatura / İrsaliye*.
- **Finans:** *Genel Giderler* (aylık), *Cari Hesaplar* (müşteri/tedarikçi hesabı; ödeme için dekont no, tarih ve tutar gerekir), *Raporlar* (maliyet, karlılık, hammadde maliyetleri).
- **Satış:** *Eczane Siparişleri*, *Portal Kataloğu* (eczanelerin gördüğü ürünler), *Eczane Hesapları* (alıcı girişleri), *Web Sitesi*.
- **Ajan Kurulu:** yapay zekâ tartışmasını çalıştırır; önerilen aksiyonlar yalnızca onaydan sonra uygulanır.

Yalnızca firma admini: *Kullanıcılar* (davet, rol atama), *Ayarlar → Pazaryeri Bağlantıları* (API bilgileri), *Ayarlar*'daki depo ve raf tanımları.

### 3.3 Kalite sorumlusu

Tüm modülleri görür. Yazdığı yerler: *Kalite Kontrol* (kontrol oluşturma, imzalama veya iptal) ve dosya ekleri (analiz sertifikası, MSDS, raporlar). Başarısız kalite kontrolü lotun veya partinin serbest bırakılmasını engeller. Stok, üretim veya ana veri düzenleyemez.

### 3.4 Salt okuma (viewer)

Her modülü görür, hiçbir şeyi değiştiremez.

### 3.5 Bölge müdürü

Panel, Eczane Siparişleri, Ürünler, Stok, Üretim (salt okuma), Satış & Ürünler ve Müşteriler'i görür. Eczaneler adına sipariş girer. Ana veri, kalite ve kullanıcı yönetimi yoktur.

### 3.6 Eczane alıcısı (portal)

ERP'den ayrıdır; firma kullanıcısı değildir. `/portal`'a giriş yapar, firmanın yayınladığı kataloğa bakar ve sipariş verir. `/c/...` sayfalarına giremez.

### 3.7 Platform admini

`/superadmin`: firma, paket ve koltuk limiti oluşturur, kullanıcı davet eder, denetim kaydını okur. Hiçbir firmanın operasyonel verisine dokunmaz.

---

## 4. Baştan sona akış (fabrika → depo → müşteri)

1. Hammadde gelir (*Mal Kabul* veya satınalma siparişi kabulü) → lot karantinada → kalite kontrol → serbest.
2. YM emri → tamamla → YM lotu (parti numarası örn. `2608006`).
3. Aynı parti numarasıyla mamül emri → tamamla → mamül lotu `ANA`'da karantinada.
4. *Parti Kartı (PDF)* yazdırılır, ürünün yanına konur.
5. Depocu QR'ı okutur, sayar, lotu `LTD`'ye alır.
6. Lot serbest bırakılır (kalite kararı) → satılabilir stok, pazaryeri stoğu ve portal stoğu olarak görünür.
7. Sipariş gelir (portal, pazaryeri, elle) → sevkiyat → gönder.

---

## 5. Bakım kuralları

- `types/roles.ts` veya bir sayfa yetkisi değişirse 1. bölüm ve ilgili 3. bölüm aynı commit'te güncellenir.
- Yeni menü öğesi veya iş akışı, buton adlarıyla birlikte 2. ve 3. bölüme eklenir.
- Sahibiyle karara bağlanacak açık sorular karar verilene kadar burada durur:
  - Depo lotu aldığında lot otomatik serbest kalsın mı, yoksa kalite kararı olarak mı kalsın?
  - Sayım farkında kabul yönetici onayı beklesin mi?

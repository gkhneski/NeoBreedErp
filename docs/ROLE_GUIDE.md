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

Görünen menü: Panel, Stok, Depo Hareketleri, Siparişler (sevkiyat), Eczane Siparişleri, Satış & Ürünler, Ürünler (salt okuma), Pazaryeri, Stok Girişi (Barkod).
Hammadde, fabrika lotları, reçete, üretim, maliyet ve tedarikçileri görmez.

| İşlem | Nereden | Nasıl |
|---|---|---|
| Partiyi LTD deposuna sayarak almak | Parti kartındaki QR (telefon kamerası) veya *Depo Hareketleri → Barkod Tara → Kamerayla Tara* | 1) Lotu açın 2) *Sayılan miktar*'a sayıyı yazın 3) *NeuPharma LTD.ŞTİ.* butonuna basın |
| Sayım sistemle aynıysa | Aynı ekran | Lot hemen alınır, ekranda "… stoğuna alındı" yazar |
| Sayım farklıysa | Aynı ekran | Sarı kutu farkı gösterir → nedenini yazın → *"… olarak stoğa al"*. Sayılan miktar stok olur, fark düzeltme hareketi olarak kaydolur |
| Yanlış yazdıysa | Aynı ekran | *Vazgeç* |
| Kamera yoksa | *Barkod Tara* | Lot numarasını kutuya yazıp *Bul* |
| Aynı depoda rafa yerleştirmek | *Barkod Tara* | Lotu okutun → raf etiketini okutun veya listeden seçin (sayım gerekmez) |
| Raftakileri görmek | *Barkod Tara* | Raf etiketini okutun |
| Sipariş hazırlamak | *Eczane Siparişleri* veya *Siparişler → Yeni* | Siparişi açın → sevkiyata çevirin → serbest lotları seçin |
| Göndermek | *Siparişler* | Sevkiyatı *Gönder* (gönderilen değiştirilemez) |
| Pazaryeri fiyat onayı | *Pazaryeri* | Öneriyi onaylayın veya reddedin |
| Mevcut stoğu girmek | *Stok Girişi (Barkod)* | Ürün barkodunu okutun, adedi girin |

Not: Lot depoya alınınca **karantinada** kalır; biri serbest bırakana kadar satılabilir stokta görünmez.

### 3.2 Firma admini / üretim sorumlusu / firma kullanıcısı

| Alan | İşlem | Nereden | Nasıl |
|---|---|---|---|
| Ana veri | Hammadde, ambalaj, YM, ürün, tedarikçi, müşteri eklemek | İlgili menü | *Yeni* butonu |
| Reçete | Reçete oluşturmak | *Reçeteler → Yeni* | YM reçetesine yalnızca hammadde; mamül reçetesine yalnızca YM + ambalaj. Kullanmadan önce yayınlayın |
| Üretim | Emir açmak | *Üretim → Yeni Üretim Emri* | Yayında reçete + hedef miktar (mamülde **kutu**) |
| Üretim | Başlatmak | Emir sayfası | *Planla* → *Üretime Al* (parti no: depoda tek YM partisi varsa ondan önerilir; ürün bazında benzersiz) |
| Üretim | Tamamlamak | Emir sayfası | *Tamamla*: tüketilen lotlar, çıkış lot no, SKT, konum. Çıkış lotu karantinada açılır |
| Üretim | Parti kartı | Tamamlanmış emir | *Parti Kartı (PDF)* → *PDF Kaydet / Yazdır* |
| Üretim | Emri düzeltmek / silmek | Emir sayfası | *Düzenle* (tamamlanana kadar); *Sil* (*Silme Protokolü*'ne kaydolur) |
| Stok | Lotları yönetmek | *Lotlar* | Düzenle, yanlış lotu sil, *Etiket Yazdır (QR)* |
| Stok | Mal kabul / elle hareket | *Depo Hareketleri* | *Mal Kabul*, *Stok Hareketi* |
| Stok | Maliyetsiz lotlara maliyet | *Stok* | *Stok Değerleme* |
| Stok | Yanlış hareketi geri almak | Lot / hareket | Storno |
| Stok | Karantinadan çıkarmak | *Lotlar* → lot | Durumu *Serbest* yapın (yalnızca serbest lot satılabilir) |
| Satınalma | İhtiyaç hesabı | *MRP* | Açık siparişlerden hesaplanır |
| Satınalma | Sipariş ve kabul | *Satınalma Siparişleri* | Tedarikçiye gönder, mal kabulü kaydet |
| Satınalma | Fatura / irsaliye | *Fatura / İrsaliye* | *Yeni* |
| Finans | Aylık giderler | *Genel Giderler* | Maaş, elektrik, su, kira vb. girin |
| Finans | Cari hesap | *Cari Hesaplar* | Ödeme için dekont no, tarih, tutar zorunlu |
| Finans | Raporlar | *Raporlar* | Maliyet, karlılık, hammadde maliyetleri |
| Satış | Eczane siparişi | *Eczane Siparişleri* | Siparişi açın, sevkiyata çevirin |
| Satış | Portal kataloğu / alıcılar | *Portal Kataloğu*, *Eczane Hesapları* | Ürünleri listeleyin, alıcı girişi tanımlayın |
| Satış | Web sitesi | *Web Sitesi* | İçerik ve ürün yönetimi |
| Yönetim | Ajan Kurulu | *Ajan Kurulu* | Tartışmayı çalıştırın; önerilen aksiyonlar onaydan sonra uygulanır |

Yalnızca **firma admini**:

| İşlem | Nereden | Nasıl |
|---|---|---|
| Kullanıcı davet etmek, rol vermek | *Kullanıcılar* | Davet et, rol seç |
| Pazaryeri API bilgileri | *Ayarlar → Pazaryeri Bağlantıları* | Bilgileri girin |
| Depo ve raf tanımı | *Ayarlar* | Yeni depo / raf ekleyin |

### 3.3 Kalite sorumlusu

| İşlem | Nereden | Nasıl |
|---|---|---|
| Kalite kontrol açmak | *Kalite Kontrol → Yeni* | Lot veya parti seçin |
| İmzalamak / iptal etmek | Kontrol sayfası | Sonucu girip imzalayın (başarısız kontrol lotu serbest bırakmayı engeller) |
| Dosya eklemek | Lot / kontrol sayfası | Analiz sertifikası, MSDS, rapor yükleyin |
| Diğer modüller | – | Yalnızca görür; stok, üretim, ana veri düzenleyemez |

### 3.4 Salt okuma (viewer)

Her modülü görür, hiçbir şeyi değiştiremez.

### 3.5 Bölge müdürü

| İşlem | Nereden | Nasıl |
|---|---|---|
| Eczane adına sipariş girmek | *Eczane Siparişleri* | Yeni sipariş, eczane ve ürünleri seçin |
| Bakmak | Ürünler, Stok, Üretim, Satış & Ürünler, Müşteriler | Salt okuma |
| Yapamaz | – | Ana veri, kalite, kullanıcı yönetimi |

### 3.6 Eczane alıcısı (portal)

| İşlem | Nereden | Nasıl |
|---|---|---|
| Kataloğa bakmak, sipariş vermek | `/portal` | Kendi girişiyle |
| Yapamaz | – | `/c/...` (ERP) sayfalarına giremez |

### 3.7 Platform admini

| İşlem | Nereden | Nasıl |
|---|---|---|
| Firma, paket, koltuk limiti | `/superadmin` | Firmalar / Abonelikler |
| Kullanıcı davet etmek | Firma detayı | *Davet* |
| Denetim kaydı | *Audit* | Okuma |
| Yapamaz | – | Firmanın stok, üretim, maliyet verisi |

---

## 4. Baştan sona akış (fabrika → depo → müşteri)

| Adım | Kim | Ne olur |
|---|---|---|
| 1 | Yönetici | Hammadde gelir (*Mal Kabul* / satınalma kabulü) → karantina → kalite → serbest |
| 2 | Yönetici | YM emri → tamamla → YM lotu (parti no örn. `2608006`) |
| 3 | Yönetici | Aynı parti numarasıyla mamül emri → tamamla → mamül lotu `ANA`'da karantinada |
| 4 | Yönetici | *Parti Kartı (PDF)* yazdırılır, ürünün yanına konur |
| 5 | Depocu | QR okutur, sayar, lotu `LTD`'ye alır |
| 6 | Yönetici / kalite | Lot serbest bırakılır → satılabilir stok, pazaryeri ve portal stoğu |
| 7 | Depocu | Sipariş gelir (portal, pazaryeri, elle) → sevkiyat → gönder |

---

## 5. Bakım kuralları

- `types/roles.ts` veya bir sayfa yetkisi değişirse 1. bölüm ve ilgili 3. bölüm aynı commit'te güncellenir.
- Yeni menü öğesi veya iş akışı, buton adlarıyla birlikte 2. ve 3. bölüme eklenir.
- Sahibiyle karara bağlanacak açık sorular karar verilene kadar burada durur:
  - Depo lotu aldığında lot otomatik serbest kalsın mı, yoksa kalite kararı olarak mı kalsın?
  - Sayım farkında kabul yönetici onayı beklesin mi?

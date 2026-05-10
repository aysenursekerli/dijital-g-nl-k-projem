"""# Dijital Gunluk ve Akilli Planlayici (Pro Planner)

## Temel Ozellikler

### 1. Interaktif Kitap Deneyimi
- **3D Page Flip:** Gercek bir defter hissi veren, sayfalarin cevrilebildigi animasyonlu kitap arayuzu (`stpageflip` entegrasyonu).
- **Kisisellestirilebilir Kutuphane:** Kullanicinin istedigi kadar defter olusturup, dijital kapak secenekleriyle kisisellestirebildigi yonetim ekrani.
- **Akilli Yan Panel (Sidebar):** Sayfalarin kucuk on izlemelerini gosteren, surukle-birak (drag & drop) ile sayfa sirasi degistirme ve silme imkani sunan gezinme paneli.

### 2. Gelismis Cizim ve Icerik Motoru
- **Hassas Kalem Destegi (Canvas API):** Dusuk gecikmeli cizim deneyimi, genis renk paleti, farkli firca kalinliklari ve silgi secenekleri.
- **Profesyonel Transform Motoru:** Sayfaya eklenen metin, fotograf ve vektorel sekillerin (kare, daire, ok vb.) 8-yonlu boyutlandirilabilmesi ve 360 derece dondurulebilmesi.
- **Katman Yonetimi (Z-Index):** Eklenen nesnelerin birbirleri arasindaki sirasini (one getir, arkaya gonder) ayarlayabilen yuzen ozellikler penceresi.

### 3. Akilli Ozellikler ve Guvenlik
- **Akilli Odak (Focus Zoom):** Metin yazarken veya detayli islem yaparken sayfanin otomatik olarak kullaniciya yaklasmasi (zoom) ve pruzsuzce eski haline donmesi.
- **Privacy Vault (Kilit Sistemi):** Ozel defterlerin gizliligi icin 4 haneli PIN korumali giris sistemi.
- **Dinamik Veri Yonetimi:** Sayfa numaralarinin kaymasi durumunda verilerin karismasini onleyen UUID (Benzersiz Kimlik) tabanli kayit sistemi.

## Teknik Mimari
- **Frontend:** HTML5, CSS3 (Glassmorphism & 3D Transforms), JavaScript (ES6+)
- **Cizim Motoru:** HTML5 Canvas API
- **Icerik Motoru:** DOM tabanli Absolute Positioning ve Pointer Events
- **Veri Saklama:** IndexedDB (Gorsel, cizim ve koordinatlarin yerel cihazda yuksek performansli saklanmasi)
- **Kutuphane:** Sayfa cevirme animasyonlari icin `stpageflip.js`

---

## Geliştirme Sürecinde Karşılaşılan Temel Sorunlar ve Teknik Çözümler

Projenin gelistirilme asamasinda karsilasilan kritik mimari krizler ve uretilen cozumler asagida listelenmistir:

### 1. Veritabanı Performans Sorunu (Tarayıcı Donması)
- **Sorun:** Kullanici cizim yaparken, her kalem hareketinde (mousemove) tum sayfa verisinin anlik olarak (snapshot) alinip IndexedDB'ye senkronize edilmeye calisilmasi tarayiciyi donduruyordu.
- **Çözüm:** Snapshot mantigi kaldirildi. Veritabani kayit islemi sadece `stopDrawing` (kalem ekrandan kalktiginda) aninda tetiklenecek sekilde optimize edildi. Her cizgi objesi veritabanina tekil olarak eklenerek islem yuku hafifletildi.

### 2. Katman Çakışması ve Sayfa Çevirememe Hatası
- **Sorun:** Sekilleri ve metinleri eklemek icin Canvas'in uzerine eklenen seffaf kapsayici katman (overlay), altta kalan `stpageflip` kutuphanesinin fare tiklamalarini algilamasini engelliyor, bu yuzden sayfalar cevrilmiyordu.
- **Çözüm:** Ana kapsayici katmana CSS ile `pointer-events: none;` degeri atandi. Sadece eklenen sekil ve metinlerin kendisine `pointer-events: auto;` verilerek tiklama olaylarinin (click events) dogru elementlere iletilmesi saglandi.

### 3. Şekillerin Canvas Üzerinde Sabit Kalması (Transform Eksikliği)
- **Sorun:** Sekil aracindan secilen kare, daire gibi nesneler, kalem gibi dogrudan Canvas uzerine cizdirildigi icin sonradan secilemiyor, boyutlandirilamiyor ve dondurulemiyordu.
- **Çözüm:** Sekil mantigi tamamen degistirildi. Sekiller Canvas disina tasinarak aktif sayfanin icine `absolute` pozisyonlu HTML `div` elemanlari (DOM) olarak eklendi. Etraflarina boyutlandirma tutamaclari (resize handles) ve dondurme kolu (rotate stem) iceren ozel bir transform kutusu kodlandi.

### 4. Sayfa Sırası Değişiminde Veri Kaybı ve Karışıklığı
- **Sorun:** Yan panel uzerinden bir sayfa silindiginde veya surukle-birak ile yeri degistirildiginde, cizimler index numarasina (`pageNumber`) gore kaydedildigi icin eski cizimler yeni sayfalarin uzerinde gorunuyordu.
- **Çözüm:** Sayfa numarasi sisteminden vazgecildi. Her sayfaya olusturuldugu an benzersiz bir ID (`uniquePageId` / UUID) atandi. IndexedDB sorgulari bu ID uzerinden yapilandirilarak, sayfa nereye tasinirsa tasinsin verilerin sayfaya sadik kalmasi saglandi.

### 5. Düzenleme Modunda Görsel Karmaşa
- **Sorun:** Duzenleme moduna girildiginde, sayfadaki tum nesnelerin etrafindaki mavi transform cerceveleri ve noktalar ayni anda gorunur hale geliyor, ana tasarimi kapatarak goz yoruyordu.
- **Çözüm:** "Tiklama Odakli" (Click-to-Select) secim mantigina gecildi. Varsayilan olarak tum cerceveler gizlendi (`display: none`). Sadece kullanicinin aktif olarak tikladigi nesneye `.active` class'i eklenerek kontrolleri gorunur kilindi.
"""
    f.write(content)


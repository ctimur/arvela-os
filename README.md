# Arvela OS

Arvela Digital & AI ajansının işletim sistemi: müşteri portalı, roller, hizmet kataloğu, projeler, görevler, onaylar ve müşteri siteleri.

Canlı: https://os.arveladigital.com

## Yapı

| Yol | Ne |
|---|---|
| `app/server.js` | HTTP sunucusu, şema, giriş/oturum, panel, müşteriler, projeler, görevler, onaylar, katalog, ekip, portal |
| `app/ext-sites.js` | Siteler modülü (hosting / SSL / WordPress durumu) ve ilk içe aktarım |
| `app/seed-catalog.json` | Hizmet kataloğu: 8 kategori, 104 modül (ilk açılışta yüklenir) |
| `app/import-sites.json` | Hostinger'dan aktarılan 25 müşteri, 29 site (ilk açılışta yüklenir) |
| `deploy/docker-compose.yml` | KVM 1'deki üretim projesi (gizli değerler hariç) |
| `deploy/rechunk.py` | Kaynak dosyaları Hostinger'ın 8.192 karakterlik compose sınırına sığan parçalara böler |

Bağımlılık: yalnızca `pg`. Node 22, PostgreSQL 16.

## Roller

- **Yönetici:** her şey; fiyatlar, ekip, işlem kayıtları.
- **Çalışan:** müşteri, site, proje, görev, onay; fiyat ve ekip yok.
- **Freelancer:** yalnızca kendisine atanan görevler.
- **Müşteri:** yalnızca kendi hizmetleri, siteleri, projeleri ve onayları.

## Yerelde çalıştırma

```sh
cd app
npm install
DATABASE_URL=postgres://user:pass@localhost:5432/arvela SETUP_TOKEN=yerel-anahtar COOKIE_SECURE=0 node server.js
```

İlk açılışta `/kurulum` sayfası `SETUP_TOKEN` ile ilk yönetici hesabını açar; hesap açıldıktan sonra kapanır.

## Yayın

Sunucu: Hostinger KVM 1, Ubuntu 24.04 + Docker + Traefik (Let's Encrypt).

`main` dalına `app/` ya da `deploy/` altında bir değişiklik gönderildiğinde **Yayına al** iş akışı (`.github/workflows/deploy.yml`) çalışır:

1. JavaScript ve JSON dosyalarını kontrol eder, parçaların sınıra sığdığını doğrular.
2. `deploy/deploy.py` değişen parçaları `arvela-src-NN` projelerine yazar, `arvela-os` projesini yeni SHA-256 özetleriyle yeniden yayınlar ve `/healthz` sağlıklı dönene kadar bekler.

Gerekli GitHub ayarları (Settings → Secrets and variables → Actions, `production` ortamı):

| Ad | Tür | Ne |
|---|---|---|
| `HOSTINGER_API_TOKEN` | secret | hPanel → Profil → API'den alınan anahtar |
| `DB_PASSWORD` | secret | Sunucudaki mevcut veritabanı şifresi (değiştirmeyin; veritabanı bununla açıldı) |
| `SETUP_TOKEN` | secret | İlk kurulum anahtarı |
| `VPS_ID` | variable | `1249062` (isteğe bağlı) |

Neden parça: Hostinger Docker API'si tek compose dosyasında en fazla 8.192 karakter kabul ediyor. Kaynak dosyalar `arvela_src` diskine parça parça yazılır; `arvela-os` açılışta birleştirir ve özetleri doğrular, uyuşmazlıkta başlamaz. Sınırlar `deploy/boundaries.json`'da sabittir; bir parça büyürse oraya yeni bir sınır satırı ekleyin ve `deploy/deploy.py` içindeki `ORDER` sayısını artırın.

`arvela-src-NN` projelerini silmeyin: kaynak disk onlara bağlı.

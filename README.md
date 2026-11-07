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

## Yayın (şimdilik)

Sunucu: Hostinger KVM 1, Ubuntu 24.04 + Docker + Traefik (Let's Encrypt).

Hostinger Docker API'si tek compose dosyasında en fazla 8.192 karakter kabul ettiği için kaynak dosyalar `arvela-src-NN` adlı tek seferlik projelerle `arvela_src` diskine parça parça yazılır. `arvela-os` projesi açılışta parçaları birleştirir ve SHA-256 özetlerini doğrular; uyuşmazlıkta başlamaz.

1. `app/` içinde değişikliği yap, `node --check` ile doğrula.
2. `python3 deploy/rechunk.py` değişen parçaları ve yeni özetleri listeler.
3. Yalnızca değişen `arvela-src-NN` projelerini yeniden yaz, ardından `deploy/docker-compose.yml` içindeki özetleri güncelleyip `arvela-os` projesini yeniden yayınla.

`arvela-src-NN` projelerini silmeyin: kaynak disk onlara bağlı.

Hedef: GitHub Actions ile imaj üretip tek adımda yayın (yol haritasında).

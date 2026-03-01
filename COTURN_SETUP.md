# Coturn TURN Server Kurulumu (Hetzner)

VPN/CGNAT/Firewall arkasındaki kullanıcılar için TURN server kurulumu.

**Neden TURN?** VPN kullanan arkadaşın bağlanamıyordu → TURN ile çözülür.

| Durum | STUN (şu an) | TURN |
|-------|--------------|------|
| Normal internet | ✅ %90 | ✅ %100 |
| VPN | ❌ %20-40 | ✅ %95 |
| CGNAT | ⚠️ %50 | ✅ %100 |
| Corporate firewall | ❌ %10 | ✅ %90-99 |

---

## 1. Hetzner VPS Al

1. https://console.hetzner.cloud/ → Yeni proje
2. **CX22** seç (2 vCPU, 4GB RAM, 40GB SSD) - **€4.35/ay**
3. **Location:** Falkenstein veya Nuremberg (Türkiye'ye yakın)
4. **Image:** Ubuntu 24.04
5. **SSH Key** ekle
6. Oluştur, IP adresini not al

---

## 2. Domain Ayarla

DNS'e A kaydı ekle:
```
turn.yourdomain.com → HETZNER_IP_ADRESI
```

---

## 3. Sunucuya Bağlan ve Kur

```bash
ssh root@HETZNER_IP_ADRESI
```

### Coturn Kur

```bash
apt update && apt upgrade -y
apt install coturn certbot -y
```

### SSL Sertifikası Al

```bash
certbot certonly --standalone -d turn.yourdomain.com

# Coturn erişimi için
chmod 755 /etc/letsencrypt/live/
chmod 755 /etc/letsencrypt/archive/
```

### Coturn'u Aktifleştir

```bash
sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
```

### Konfigürasyon

```bash
nano /etc/turnserver.conf
```

İçeriği tamamen sil, şunu yapıştır:

```conf
# Network
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0
external-ip=HETZNER_IP_ADRESI

# Domain
realm=turn.yourdomain.com
server-name=turn.yourdomain.com

# Auth
lt-cred-mech
user=vortex:GÜÇLÜ_ŞİFRE_BURAYA

# TLS
cert=/etc/letsencrypt/live/turn.yourdomain.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.yourdomain.com/privkey.pem

# Security
no-multicast-peers
no-cli
no-tlsv1
no-tlsv1_1

# Limits
max-bps=1500000

# Logging
log-file=/var/log/turnserver.log
```

### Firewall

```bash
ufw allow 22/tcp
ufw allow 3478/tcp
ufw allow 3478/udp
ufw allow 5349/tcp
ufw allow 5349/udp
ufw allow 49152:65535/udp
ufw enable
```

### Başlat

```bash
systemctl enable coturn
systemctl start coturn
systemctl status coturn
```

---

## 4. Test Et

https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

- **STUN or TURN URI:** `turn:turn.yourdomain.com:3478`
- **Username:** `vortex`
- **Password:** `GÜÇLÜ_ŞİFRE_BURAYA`

"Gather candidates" tıkla → `relay` tipinde candidate görmelisin ✅

---

## 5. Vortex'e Ekle

`.env.local`:

```env
NEXT_PUBLIC_TURN_SERVER_DOMAIN=turn.yourdomain.com
NEXT_PUBLIC_TURN_USERNAME=vortex
NEXT_PUBLIC_TURN_CREDENTIAL=GÜÇLÜ_ŞİFRE_BURAYA
```

Deploy et, VPN'li arkadaşın artık bağlanabilmeli.

---

## Bakım

### Sertifika Yenileme (Otomatik)

```bash
crontab -e
```

Ekle:
```
0 3 1 * * certbot renew --quiet && systemctl restart coturn
```

### Log İzleme

```bash
tail -f /var/log/turnserver.log
```

### Servis Durumu

```bash
systemctl status coturn
```

---

## Maliyet

| Kullanım | Aylık Bandwidth | Hetzner CX22 (€4.35) |
|----------|-----------------|----------------------|
| Voice (günde 2 saat) | ~3 GB | ✅ Dahil |
| Voice + Screen | ~45 GB | ✅ Dahil |
| Yoğun (günde 8 saat) | ~180 GB | ✅ Dahil |

20TB/ay dahil, aşmak neredeyse imkansız.

---

## Sorun Giderme

| Sorun | Çözüm |
|-------|-------|
| Bağlanamıyor | Firewall portlarını kontrol et |
| SSL hatası | Sertifika yollarını kontrol et |
| relay candidate yok | `external-ip` doğru mu? |
| Timeout | DNS kaydı propagate oldu mu? |

```bash
# Coturn loglarına bak
journalctl -u coturn -f

# Port açık mı?
nc -zv turn.yourdomain.com 3478
```

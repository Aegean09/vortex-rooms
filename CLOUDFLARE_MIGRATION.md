# Cloudflare Calls Migration Guide

Bu döküman WebRTC (P2P + TURN) → Cloudflare Calls (SFU) geçişi için hazırlandı.

## Şu Anki Mimari (WebRTC + Coturn)

```
┌─────────────────────────────────────────────────────┐
│                    Full Mesh P2P                     │
│                                                      │
│   Client A ←──────────────────────→ Client B        │
│      ↑                                   ↑          │
│      │         (P2P veya TURN)           │          │
│      └───────────────────────────────────┘          │
│                                                      │
│   Signaling: Firebase Firestore                     │
│   TURN: Coturn (Hetzner)                            │
└─────────────────────────────────────────────────────┘
```

**Avantajlar:**
- Basit, düşük maliyet
- P2P = düşük latency
- 2-8 kişi için ideal

**Limitler:**
- 10+ kişide client bandwidth patlar
- Her client n-1 stream upload eder

---

## Hedef Mimari (Cloudflare Calls)

```
┌─────────────────────────────────────────────────────┐
│                  Cloudflare SFU                      │
│                                                      │
│   Client A ──→ ┌─────────────┐ ──→ Client B         │
│                │  Cloudflare │                       │
│   Client C ──→ │    Edge     │ ──→ Client D         │
│                └─────────────┘                       │
│                                                      │
│   Her client 1 stream upload, n stream download     │
└─────────────────────────────────────────────────────┘
```

**Avantajlar:**
- 100+ kişi destekler
- Client bandwidth sabit (1 upload)
- Global edge = düşük latency
- Built-in TURN (ayrı server gerekmez)
- Simulcast support

**Dezavantajlar:**
- Cloudflare'e bağımlılık
- Kullanım başı ücret ($0.05/1000 dk)

---

## Migration Checklist

### Phase 1: Hazırlık (Şu an tamamlandı ✅)

- [x] Media provider abstraction layer oluştur
- [x] `IMediaProvider` interface tanımla
- [x] `CloudflareCallsProvider` placeholder oluştur
- [x] Environment variables hazırla
- [x] Backward compatibility koru

### Phase 2: Cloudflare Setup

- [ ] Cloudflare hesabı oluştur (https://dash.cloudflare.com)
- [ ] Calls API enable et
- [ ] App ID al
- [ ] API token oluştur (server-side için)

### Phase 3: SDK Entegrasyonu

```bash
npm install @cloudflare/calls
```

- [ ] `CloudflareCallsProvider` implement et
- [ ] Session token endpoint oluştur (API route)
- [ ] Room join/leave logic
- [ ] Track publish/subscribe logic

### Phase 4: Signaling Migration

Şu an Firebase kullanılıyor. Cloudflare Calls kendi signaling'ini handle ediyor.

| Şu An | Cloudflare |
|-------|------------|
| Firebase Firestore | Cloudflare API |
| ICE candidates Firestore'da | Cloudflare handle eder |
| Offer/Answer Firestore'da | Cloudflare handle eder |

**Karar noktası:** Firebase'i tamamen kaldır mı, yoksa room metadata için tut mu?

### Phase 5: Testing

- [ ] 2 kişi test
- [ ] 5 kişi test
- [ ] 10+ kişi test
- [ ] Screen share test
- [ ] VPN/CGNAT test (TURN artık gerekmez)

### Phase 6: Rollout

- [ ] Feature flag ekle (`NEXT_PUBLIC_MEDIA_PROVIDER`)
- [ ] Canary deployment (%10 kullanıcı)
- [ ] Full rollout
- [ ] Coturn server'ı kapat

---

## Kod Değişiklikleri

### Değişecek Dosyalar

| Dosya | Değişiklik |
|-------|------------|
| `src/lib/media/providers/cloudflare/index.ts` | Full implementation |
| `src/lib/webrtc/provider.tsx` | Provider seçimi ekle |
| `src/app/api/cloudflare-token/route.ts` | Yeni: Session token endpoint |
| `.env.local` | Cloudflare credentials |

### Değişmeyecek Dosyalar

| Dosya | Neden |
|-------|-------|
| `src/components/*` | UI aynı kalacak |
| `src/lib/webrtc/hooks/*` | Stream handling aynı |
| `src/lib/webrtc/utils/*` | Utility'ler generic |

---

## Maliyet Karşılaştırması

| Senaryo | WebRTC + Coturn | Cloudflare Calls |
|---------|-----------------|------------------|
| 5 kişi, günde 2 saat | €4/ay (Hetzner) | ~$3/ay |
| 20 kişi, günde 2 saat | €4/ay + SFU lazım | ~$12/ay |
| 50 kişi, günde 2 saat | SFU şart (~€20/ay) | ~$30/ay |

**Break-even:** ~20 kişilik odalarda Cloudflare daha mantıklı.

---

## Ne Zaman Geçmeli?

| Durum | Öneri |
|-------|-------|
| 2-8 kişi casual | WebRTC + Coturn yeterli |
| 10+ kişi düzenli | Cloudflare düşün |
| 20+ kişi | Cloudflare geç |
| Şirket all-hands | Cloudflare şart |

---

## Notlar

1. **Firebase kararı:** Cloudflare'e geçince Firebase sadece room metadata için kalabilir, veya tamamen kaldırılabilir. Şirket senaryosunda zaten Firebase kullanılamayacak.

2. **Hybrid approach:** İlk aşamada küçük odalar WebRTC, büyük odalar Cloudflare olabilir. Ama complexity artırır.

3. **Fallback:** Cloudflare down olursa WebRTC'ye fallback? Muhtemelen overkill.

---

## Kaynaklar

- [Cloudflare Calls Docs](https://developers.cloudflare.com/calls/)
- [Cloudflare Calls Pricing](https://developers.cloudflare.com/calls/pricing/)
- [WebRTC vs SFU comparison](https://webrtc.org/getting-started/peer-connections)

# 🌀 Vortex Rooms

**Anlık, geçici sesli ve metin sohbet odaları. Kayıt gerektirmez.**

Vortex, WebRTC teknolojisini kullanarak tarayıcı üzerinden gerçek zamanlı peer-to-peer iletişim sağlayan modern bir sohbet uygulamasıdır. Discord benzeri bir deneyimi herhangi bir kurulum gerektirmeden sunar.

![Next.js](https://img.shields.io/badge/Next.js-15.5-black?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![Firebase](https://img.shields.io/badge/Firebase-11.9-FFCA28?style=flat-square&logo=firebase)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?style=flat-square&logo=tailwindcss)

---

## ✨ Özellikler

- **🚀 Anında Oda Oluşturma** — Tek tıkla paylaşılabilir link oluşturun
- **🎤 Gerçek Zamanlı Sesli Sohbet** — WebRTC ile düşük gecikmeli P2P ses iletişimi
- **💬 Metin Sohbeti** — Odadaki tüm kullanıcılarla anlık mesajlaşma
- **👥 Kullanıcı Varlığı** — Aktif kullanıcıları gerçek zamanlı görün
- **🔗 Kolay Katılım** — Link ile veya oda kodu ile anında katılın
- **🎚️ Ses Kontrolleri** — Mikrofon aç/kapa, ses seviyesi ayarlama
- **🎨 Modern UI** — Koyu tema, minimalist tasarım
- **📱 Responsive** — Mobil ve masaüstü uyumlu

---

## 🛠️ Teknoloji Stack

| Katman | Teknoloji |
|--------|-----------|
| **Frontend** | Next.js 15, React 19, TypeScript |
| **Styling** | Tailwind CSS, Radix UI, Lucide Icons |
| **Backend** | Firebase (Firestore, Anonymous Auth) |
| **Real-time** | WebRTC (P2P), Firebase Realtime Listeners |
| **AI** | Genkit, Google Generative AI |

---

## 🚀 Kurulum

### Gereksinimler

- Node.js 18+ 
- npm veya pnpm
- Firebase projesi

### 1. Projeyi Klonlayın

```bash
git clone https://github.com/egedurmaz/vortex-rooms.git
cd vortex-rooms
```

### 2. Bağımlılıkları Yükleyin

```bash
npm install
```

### 3. Firebase Yapılandırması

Firebase Console'da yeni bir proje oluşturun ve aşağıdaki servisleri etkinleştirin:

- **Firestore Database** — Signaling ve mesajlar için
- **Authentication** — Anonymous auth etkinleştirin

`.env.local` dosyası oluşturun:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 4. Geliştirme Sunucusunu Başlatın

```bash
npm run dev
```

Uygulama [http://localhost:3000](http://localhost:3000) adresinde çalışacaktır.

---

## 📁 Proje Yapısı

```
vortex-rooms/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx           # Ana sayfa
│   │   ├── join/              # Odaya katılma sayfası
│   │   └── session/[sessionId] # Sohbet odası
│   │       ├── page.tsx       # Oda arayüzü
│   │       └── setup/         # Cihaz kurulumu
│   ├── components/
│   │   ├── ui/                # Radix UI bileşenleri
│   │   └── vortex/            # Uygulama bileşenleri
│   │       ├── chat-area.tsx
│   │       ├── device-setup.tsx
│   │       ├── user-list.tsx
│   │       └── voice-controls.tsx
│   ├── firebase/              # Firebase konfigürasyonu
│   ├── lib/
│   │   └── webrtc/            # WebRTC implementasyonu
│   │       ├── provider.tsx   # WebRTC Context
│   │       └── webrtc.ts      # P2P bağlantı fonksiyonları
│   └── hooks/                 # Custom React hooks
├── docs/                      # Dokümantasyon
└── firestore.rules           # Firestore güvenlik kuralları
```

---

## 🔧 Scriptler

| Komut | Açıklama |
|-------|----------|
| `npm run dev` | Geliştirme sunucusunu başlat (Turbopack) |
| `npm run build` | Prodüksiyon build |
| `npm run start` | Prodüksiyon sunucusunu başlat |
| `npm run lint` | ESLint kontrolü |
| `npm run typecheck` | TypeScript tip kontrolü |
| `npm run genkit:dev` | Genkit AI geliştirme sunucusu |

---

## 🌐 WebRTC Nasıl Çalışır?

Vortex, Firebase Firestore'u signaling sunucusu olarak kullanarak WebRTC bağlantıları kurar:

```
┌─────────┐                        ┌─────────┐
│  Alice  │                        │   Bob   │
└────┬────┘                        └────┬────┘
     │                                  │
     │  1. Create Offer (SDP)           │
     │──────────────────────────────────▶
     │        via Firestore             │
     │                                  │
     │  2. Create Answer (SDP)          │
     │◀──────────────────────────────────
     │        via Firestore             │
     │                                  │
     │  3. Exchange ICE Candidates      │
     │◀────────────────────────────────▶
     │        via Firestore             │
     │                                  │
     │  4. P2P Connection Established   │
     │══════════════════════════════════│
     │     Direct Audio/Video Stream    │
```

Daha detaylı bilgi için [WebRTC Deep Dive](./docs/blog-webrtc-deep-dive.md) dökümanına bakın.

---

## 🎨 Tasarım Sistemi

| Renk | Hex | Kullanım |
|------|-----|----------|
| **Primary** | `#7DF9FF` | Ana vurgu rengi (Electric Blue) |
| **Accent** | `#BE95FF` | İkincil vurgu (Light Purple) |
| **Background** | `#28282B` | Koyu arka plan |
| **Card** | `rgba(40,40,43,0.8)` | Kart arka planları |

---

## 🔒 Güvenlik

- **Anonim Kimlik Doğrulama** — Kullanıcı verisi saklanmaz
- **Geçici Oturumlar** — Oda verileri oturum sonunda temizlenir
- **P2P İletişim** — Ses verileri sunucudan geçmez
- **Firestore Kuralları** — Yetkilendirme bazlı erişim kontrolü

---

## 🚧 Yol Haritası

- [ ] Ekran paylaşımı
- [ ] Alt odalar (Subsessions / Breakout rooms)
- [ ] Video desteği
- [ ] Oda şifreleme
- [ ] Kalıcı sohbet geçmişi (opsiyonel)
- [ ] TURN sunucu desteği

---

## 📄 Lisans

Bu proje MIT lisansı altında lisanslanmıştır.

---

## 👤 Geliştirici

**Ege Durmaz**

- GitHub: [@egedurmaz](https://github.com/egedurmaz)

---

<p align="center">
  <sub>WebRTC ile güçlendirilmiştir 🌀</sub>
</p>

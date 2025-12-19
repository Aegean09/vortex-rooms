# WebRTC ile Tarayıcıda Gerçek Zamanlı İletişim: Kapsamlı Bir Rehber

*Okuma süresi: ~6 dakika*

Discord, Zoom, Google Meet... Hepimiz bu uygulamaları günlük hayatımızda kullanıyoruz. Peki hiç merak ettiniz mi, tarayıcınız üzerinden başka biriyle nasıl gerçek zamanlı sesli veya görüntülü iletişim kurabiliyorsunuz? İşte bu makalede, bu sihrin arkasındaki teknolojiyi — **WebRTC**'yi — bir Discord clone projesi üzerinden derinlemesine inceleyeceğiz.

## WebRTC Nedir?

**Web Real-Time Communication (WebRTC)**, tarayıcılar arasında herhangi bir eklenti veya üçüncü parti yazılım gerektirmeden **peer-to-peer (P2P)** ses, video ve veri akışı sağlayan açık kaynaklı bir teknolojidir.

WebRTC'nin en güzel tarafı şudur: verileriniz bir sunucudan geçmek zorunda kalmaz. İki tarayıcı doğrudan birbirleriyle iletişim kurabilir. Bu da düşük gecikme süresi, daha iyi gizlilik ve sunucu maliyetlerinden tasarruf anlamına gelir.

Ancak burada kritik bir soru ortaya çıkıyor: **İki tarayıcı internette birbirini nasıl bulacak?**

## Signaling: Tanışma Dansı

WebRTC'nin en kafa karıştırıcı ama aynı zamanda en zarif kısmı **signaling** sürecidir. İki peer birbirleriyle doğrudan konuşmadan önce, bir tür "tanışma" gerçekleştirmek zorundadır.

WebRTC standardı, signaling için belirli bir protokol dayatmaz — bu tamamen geliştiriciye bırakılmıştır. WebSocket, HTTP polling, Firebase Realtime Database veya Firestore gibi herhangi bir yöntem kullanabilirsiniz.

### Signaling Süreci Nasıl İşler?

İki kullanıcıyı düşünelim: **Alice** ve **Bob**. İkisi de aynı chat odasına katılmak istiyor.

```
1. Alice bir "offer" oluşturur (SDP - Session Description Protocol)
2. Alice bu offer'ı signaling kanalı üzerinden Bob'a gönderir
3. Bob offer'ı alır ve bir "answer" oluşturur
4. Bob answer'ı signaling kanalı üzerinden Alice'e gönderir
5. Her iki taraf da ICE candidate'lerini paylaşır
6. Bağlantı kurulur! 🎉
```

### Gerçek Kod: Firebase ile Signaling

İşte gerçek bir projeden signaling implementasyonu:

```typescript
export const createOffer = async (
  firestore: Firestore,
  sessionId: string,
  localPeerId: string,
  remotePeerId: string,
  pc: RTCPeerConnection
) => {
  // Benzersiz bir call ID oluştur (her zaman aynı sıralama için)
  const callId = localPeerId < remotePeerId 
    ? `${localPeerId}_${remotePeerId}` 
    : `${remotePeerId}_${localPeerId}`;
  
  const callDocRef = doc(firestore, 'sessions', sessionId, 'calls', callId);
  
  // Answer dinleyicisi kur
  const unsubscribeAnswer = onSnapshot(callDocRef, snapshot => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      console.log(`Got answer from ${remotePeerId}`);
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // Offer oluştur ve gönder
  const offerDescription = await pc.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: true,
  });
  await pc.setLocalDescription(offerDescription);

  await setDoc(callDocRef, { 
    offer: { sdp: offerDescription.sdp, type: offerDescription.type },
    callerId: localPeerId, 
    calleeId: remotePeerId 
  }, { merge: true });
};
```

Burada dikkat edilmesi gereken önemli bir nokta var: **Call ID**'yi oluştururken her zaman aynı sıralamayı kullanıyoruz (`localPeerId < remotePeerId`). Bu sayede Alice→Bob ve Bob→Alice aynı Firestore dokümanını referans alır ve çakışmalar önlenir.

## ICE: NAT'ın Duvarlarını Yıkmak

Modern internette cihazların çoğu NAT (Network Address Translation) arkasında bulunur. Yani gerçek IP adresiniz genellikle router'ınızın arkasında gizlidir. Bu, P2P bağlantıları için ciddi bir engel oluşturur.

İşte burada **ICE (Interactive Connectivity Establishment)** devreye girer.

### STUN Sunucuları

**STUN (Session Traversal Utilities for NAT)** sunucuları, cihazınızın public IP adresini ve portunu keşfetmesine yardımcı olur. Google'ın ücretsiz STUN sunucularını kullanabilirsiniz:

```typescript
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const pc = new RTCPeerConnection(ICE_SERVERS);
```

### ICE Candidate Exchange

Her peer, kendi bağlantı noktalarını (ICE candidates) keşfettikçe bunları karşı tarafa iletmelidir:

```typescript
pc.onicecandidate = event => {
  if (event.candidate) {
    // Candidate'i Firestore'a kaydet
    const candidatesCollectionRef = collection(callDocRef, localCandidatesCollection);
    addDoc(candidatesCollectionRef, event.candidate.toJSON());
  }
};

// Karşı tarafın candidate'lerini dinle
const remoteCandidatesRef = collection(callDocRef, remoteCandidatesCollection);
onSnapshot(remoteCandidatesRef, snapshot => {
  snapshot.docChanges().forEach(change => {
    if (change.type === 'added') {
      const candidate = new RTCIceCandidate(change.doc.data());
      pc.addIceCandidate(candidate);
    }
  });
});
```

Bu yapıda **offerCandidates** ve **answerCandidates** olarak iki ayrı collection kullanılır. Bu sayede her peer, kendi candidate'lerini doğru yere yazar ve karşı tarafın candidate'lerini dinler.

## Caller vs Callee: Kim Arar?

Bir chat odasında 5 kişi varsa, toplam 10 adet peer-to-peer bağlantı kurulması gerekir (n*(n-1)/2 formülü). Peki hangi taraf "caller" olacak?

Akıllı bir çözüm: **Peer ID karşılaştırması**

```typescript
const isCaller = localPeerId < remotePeerId;

if (localPeerId < remotePeerId) {
  console.log(`I will initiate call to ${remotePeerId}`);
  const pc = createPeerConnection(...);
  createOffer(firestore, sessionId, localPeerId, remotePeerId, pc);
}
```

Alfabetik/sayısal olarak daha küçük ID'ye sahip peer her zaman caller olur. Bu basit kural, çift taraflı offer gönderimini önler ve sistemi deterministik hale getirir.

## Media Streams: Mikrofon ve Ekran Paylaşımı

### Mikrofon Erişimi

```typescript
const stream = await navigator.mediaDevices.getUserMedia({ 
  audio: {
    echoCancellation: true,    // Yankı engelleme
    noiseSuppression: true,    // Gürültü bastırma
    autoGainControl: true,     // Otomatik ses seviyesi
  }, 
  video: false 
});

// Stream'i peer connection'a ekle
stream.getTracks().forEach(track => pc.addTrack(track, stream));
```

### Ekran Paylaşımı

Ekran paylaşımı için `getDisplayMedia` API'si kullanılır:

```typescript
const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
const videoTrack = stream.getVideoTracks()[0];

// Mevcut tüm peer connection'lara track ekle
for (const peerId in peerConnections.current) {
  const pc = peerConnections.current[peerId];
  pc.addTrack(videoTrack, stream);
  // Yeniden negotiation gerekiyor!
  await createOffer(firestore, sessionId, localPeerId, peerId, pc);
}
```

Önemli nokta: Yeni bir track eklendiğinde **renegotiation** gerekir. Bu, yeni bir offer/answer döngüsü anlamına gelir.

## Connection State Yönetimi

Bağlantı durumunu izlemek kritik önem taşır:

```typescript
pc.onconnectionstatechange = () => {
  console.log(`Peer connection state: ${pc.connectionState}`);
  
  if (pc.connectionState === 'disconnected' || 
      pc.connectionState === 'closed' || 
      pc.connectionState === 'failed') {
    // Bağlantı koptu, temizlik yap
    cleanupConnection(remotePeerId);
  }
};
```

Olası durumlar:
- `new`: Bağlantı oluşturuldu ama henüz bağlanılmadı
- `connecting`: ICE negotiation devam ediyor
- `connected`: Bağlantı kuruldu! 🎉
- `disconnected`: Geçici bağlantı kaybı
- `failed`: Bağlantı kurulamadı
- `closed`: Bağlantı kapatıldı

## Ses Aktivitesi Algılama (Voice Activity Detection)

Kullanıcının konuşup konuşmadığını görsel olarak göstermek için Web Audio API kullanılabilir:

```typescript
useEffect(() => {
  if (!localStream) return;
  
  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  
  const source = audioContext.createMediaStreamSource(localStream);
  source.connect(analyser);
  
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  
  const checkVoiceActivity = () => {
    analyser.getByteFrequencyData(dataArray);
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    setVoiceActivity(average > 15); // Eşik değeri
    requestAnimationFrame(checkVoiceActivity);
  };
  
  checkVoiceActivity();
}, [localStream]);
```

Bu sayede kullanıcının avatarı etrafında konuşurken yeşil bir halka gösterebilirsiniz — tıpkı Discord'daki gibi!

## Firestore Veri Yapısı

Tüm bu WebRTC signaling verilerini organize etmek için şöyle bir yapı kullanılabilir:

```
/sessions/{sessionId}
  ├── /users/{userId}           → Kullanıcı bilgileri
  ├── /messages/{messageId}     → Chat mesajları
  ├── /subsessions/{subId}      → Ses kanalları (voice channels)
  └── /calls/{callId}           → WebRTC signaling verileri
        ├── offer               → SDP offer
        ├── answer              → SDP answer
        ├── /offerCandidates    → Caller'ın ICE candidate'leri
        └── /answerCandidates   → Callee'nin ICE candidate'leri
```

## Sonuç ve Önemli Çıkarımlar

WebRTC, modern web'in en güçlü API'lerinden biridir. İşte öğrendiklerimizin özeti:

1. **Signaling agnostiktir**: WebRTC size protokol dayatmaz. Firebase, WebSocket, hatta manuel kopyala-yapıştır bile kullanabilirsiniz.

2. **ICE kritiktir**: STUN sunucuları olmadan NAT arkasındaki cihazlar birbirini bulamaz.

3. **Deterministik caller seçimi**: Peer ID karşılaştırması ile race condition'ları önleyin.

4. **Renegotiation**: Yeni track'ler eklendiğinde offer/answer döngüsünü tekrarlayın.

5. **Temizlik önemli**: Kullanıcı ayrıldığında bağlantıları, listener'ları ve Firestore dokümanlarını temizleyin.

WebRTC öğrenmek zor olabilir, ama bir kez anladığınızda inanılmaz güçlü uygulamalar geliştirebilirsiniz. Discord clone'unuz, video konferans uygulamanız veya multiplayer oyununuz — hayal gücünüz sınır!

---

*Bu makale, Vortex Rooms projesi geliştirme sürecinde edinilen deneyimlerden derlenmiştir.*


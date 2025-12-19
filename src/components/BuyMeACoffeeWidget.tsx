'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useIsMobile } from '@/hooks/use-mobile';

// BMC'nin script'i yüklendiğinde window üzerine eklediği nesnenin türü.
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __bmc?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __bmcDomLoadedOnce?: boolean;
  }
}


export function BuyMeACoffeeWidget() {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  
  // Widget'ın gizlenmesi gerekip gerekmediğini belirleyen koşul
  const isSessionPage = pathname.includes('/session/');
  const shouldHideWidget = isMobile && isSessionPage;

  // Sadece bir kez çalışacak olan script yükleme efekti
  useEffect(() => {
    // Script zaten eklenmişse tekrar ekleme
    if (document.querySelector('script[data-name="BMC-Widget"]')) {
      return;
    }

    const script = document.createElement('script');
    script.setAttribute('data-name', 'BMC-Widget');
    script.setAttribute('data-cfasync', 'false');
    script.src = 'https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js';
    script.setAttribute('data-id', 'aegean09');
    script.setAttribute('data-description', 'Support me on Buy me a coffee!');
    script.setAttribute('data-message', '');
    script.setAttribute('data-color', '#7AFDFF');
    script.setAttribute('data-position', 'Right');
    script.setAttribute('data-x_margin', '18');
    script.setAttribute('data-y_margin', '18');
    script.async = true;

    script.onload = () => {
        // Next.js/SPA ortamlarında script bazen DOMContentLoaded olayını bekler.
        // Bu olayı manuel olarak tetikleyerek widget'ın hemen yüklenmesini sağlıyoruz.
        if (!window.__bmcDomLoadedOnce) {
            window.dispatchEvent(new Event('DOMContentLoaded'));
            window.__bmcDomLoadedOnce = true;
        }
    };
    
    document.head.appendChild(script);

    // Bileşen unmount edildiğinde script'i kaldırmıyoruz çünkü globaldir.
  }, []); // Boş bağımlılık dizisi sayesinde bu effect sadece bir kere çalışır.


  // Sayfa yolu (pathname) veya mobil durumu her değiştiğinde çalışan görünürlük efekti
  useEffect(() => {
    // Widget butonunu bulmak için bir fonksiyon
    const findAndToggle = () => {
        const bmcButton = document.getElementById('bmc-wbtn');
        if (bmcButton) {
            bmcButton.style.display = shouldHideWidget ? 'none' : 'flex';
        }
    };

    // Script yüklendikten sonra buton hemen DOM'da olmayabilir.
    // Bu yüzden periyodik olarak kontrol edip bulduğumuzda görünürlüğü ayarlıyoruz.
    const interval = setInterval(() => {
        const bmcButton = document.getElementById('bmc-wbtn');
        if (bmcButton) {
            findAndToggle();
            clearInterval(interval); // Butonu bulunca interval'ı temizle
        }
    }, 100); // 100ms aralıklarla kontrol et

    // Temizleme fonksiyonu: Bileşen unmount edildiğinde interval'ı temizle
    return () => clearInterval(interval);

  }, [shouldHideWidget]); // Bu effect, gizlenme koşulu değiştiğinde yeniden çalışır.

  return null; // Bu bileşen görsel bir çıktı üretmez.
}

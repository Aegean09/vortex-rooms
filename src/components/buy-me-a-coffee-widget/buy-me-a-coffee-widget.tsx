'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useIsMobile } from '@/hooks/use-mobile';

declare global {
  interface Window {
    __bmc?: any;
    __bmcDomLoadedOnce?: boolean;
  }
}

export function BuyMeACoffeeWidget() {
  const pathname = usePathname();
  const isMobile = useIsMobile();

  const isSessionPage = pathname.includes('/session/');
  const shouldHideWidget = isMobile && isSessionPage;

  useEffect(() => {
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
      if (!window.__bmcDomLoadedOnce) {
        window.dispatchEvent(new Event('DOMContentLoaded'));
        window.__bmcDomLoadedOnce = true;
      }
    };

    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    const findAndToggle = () => {
      const bmcButton = document.getElementById('bmc-wbtn');
      if (bmcButton) {
        bmcButton.style.display = shouldHideWidget ? 'none' : 'flex';
      }
    };

    const interval = setInterval(() => {
      const bmcButton = document.getElementById('bmc-wbtn');
      if (bmcButton) {
        findAndToggle();
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [shouldHideWidget]);

  return null;
}

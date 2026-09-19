import { useState, useEffect, useRef } from 'react';

export function usePWAInstall() {
  const [isInstallable, setIsInstallable] = useState(true); // Always show button for visibility
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const deferredPrompt = useRef(null);

  const isIOS = () => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(userAgent);
  };

  const isAndroid = () => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    return /android/.test(userAgent);
  };

  const isInstalled = () => {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  };

  useEffect(() => {
    console.log('[PWA] Hook Initialized');
    console.log('[PWA] isStandalone:', isInstalled());
    
    if (isInstalled()) {
      console.log('[PWA] App is already installed/standalone. Hiding button.');
      setIsInstallable(false);
      return;
    }
    console.log('[PWA] App is not installed. showing button.');
    setIsInstallable(true);

    const handleBeforeInstallPrompt = (e) => {
      console.log('[PWA] beforeinstallprompt event fired');
      e.preventDefault();
      deferredPrompt.current = e;
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const handleAppInstalled = () => {
      console.log('[PWA] appinstalled event fired');
      setIsInstallable(false);
      deferredPrompt.current = null;
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (isIOS()) {
      setIsTooltipVisible(true);
      setTimeout(() => setIsTooltipVisible(false), 5000);
      return;
    }

    if (deferredPrompt.current) {
      deferredPrompt.current.prompt();
      const { outcome } = await deferredPrompt.current.userChoice;
      if (outcome === 'accepted') {
        setIsInstallable(false);
      }
      deferredPrompt.current = null;
    } else {
      // Desktop / Android without valid manifest or SW
      setIsTooltipVisible(true);
      setTimeout(() => setIsTooltipVisible(false), 5000);
    }
  };

  return { isInstallable, promptInstall, isIOS: isIOS(), isAndroid: isAndroid(), isTooltipVisible };
}

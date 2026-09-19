import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

const isIOS = () => {
    const ua = navigator.userAgent || '';
    return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const shouldReloadForSW = () => {
    try {
        // Allow one auto-reload per session on ALL platforms (including iOS).
        // The sessionStorage guard prevents reload loops — iOS was previously
        // excluded entirely, which caused it to keep running stale JS bundles.
        const key = 'aytme_sw_reloaded';
        if (sessionStorage.getItem(key)) return false;
        sessionStorage.setItem(key, '1');
    } catch (_) {
        return false;
    }
    return true;
};

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)

// ─── Service Worker: auto-update & cache-bust on redeployment ───
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            // 1. Unregister all old service workers
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const reg of registrations) {
                await reg.unregister();
                console.log('[App] Unregistered old SW:', reg.scope);
            }

            // 2. Clear all caches
            const cacheKeys = await caches.keys();
            await Promise.all(cacheKeys.map(key => {
                console.log('[App] Cleared cache:', key);
                return caches.delete(key);
            }));

            // 3. Register SW with cache-busting query param (changes hourly)
            const cacheBust = Math.floor(Date.now() / 3600000); // changes every hour
            const reg = await navigator.serviceWorker.register(`/sw.js?v=${cacheBust}`, {
                updateViaCache: 'none'
            });
            console.log('[App] SW registered:', reg.scope);

            // 4. When a new SW is found, tell it to activate immediately
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                if (newWorker) {
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'activated') {
                            console.log('[App] New SW activated — reloading for fresh content');
                            if (shouldReloadForSW()) {
                                window.location.reload();
                            }
                        }
                    });
                }
            });

            // 5. Force update check immediately
            reg.update().catch(() => {});

        } catch (err) {
            console.error('[App] SW setup failed:', err);
        }
    });

    // 6. Listen for SW_UPDATED message from service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SW_UPDATED') {
            console.log('[App] SW sent update signal — reloading');
            if (shouldReloadForSW()) {
                window.location.reload();
            }
        }
    });

    // 7. Check for SW updates when user returns to the tab
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            navigator.serviceWorker.getRegistration().then(reg => {
                if (reg) {
                    reg.update().catch(() => {});
                }
            });
        }
    });
}

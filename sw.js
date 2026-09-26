/* ═══════════════════════════════════════════════════════════════
   TopLoad - Service Worker v1.0
   استراتيجيات Cache ذكية للأداء الأمثل
   ═══════════════════════════════════════════════════════════════ */

const CACHE_VERSION = 'topload-v1.2.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

// الملفات الأساسية للتطبيق (App Shell)
const STATIC_ASSETS = [
    './',
    './index.html',
    './dashboard.html',
    './visits.html',
    './expenses.html',
    './app-shell.css',
    './app-shell.js',
    './offline.html',
    './manifest.json',
    './logo.png'
];

// CDN Assets (تُحفظ مرة واحدة)
const CDN_ASSETS = [
    'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&display=swap',
    'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.1/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/dist/umd/supabase.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

// ═══════════════════════════════════════════════════════════════
// 🚀 Install Event
// ═══════════════════════════════════════════════════════════════
self.addEventListener('install', (event) => {
    console.log('🔧 SW: Installing...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('📦 SW: Caching static assets');
                // Cache all assets individually to avoid failure if one fails
                return Promise.allSettled(
                    STATIC_ASSETS.map(url => 
                        cache.add(url).catch(err => 
                            console.warn(`⚠️ Failed to cache ${url}:`, err.message)
                        )
                    )
                );
            })
            .then(() => {
                console.log('✅ SW: Static assets cached');
                return self.skipWaiting();
            })
    );
});

// ═══════════════════════════════════════════════════════════════
// 🎯 Activate Event
// ═══════════════════════════════════════════════════════════════
self.addEventListener('activate', (event) => {
    console.log('🎯 SW: Activating...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => {
                            return name.startsWith('topload-') && 
                                   name !== STATIC_CACHE && 
                                   name !== DYNAMIC_CACHE && 
                                   name !== IMAGE_CACHE;
                        })
                        .map((name) => {
                            console.log(`🗑️ SW: Deleting old cache: ${name}`);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('✅ SW: Activated');
                return self.clients.claim();
            })
    );
});

// ═══════════════════════════════════════════════════════════════
// 🌐 Fetch Event - Smart Caching Strategies
// ═══════════════════════════════════════════════════════════════
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') return;
    
    // Skip Supabase API calls (لا نخزن بيانات ديناميكية)
    if (url.hostname.includes('supabase.co')) {
        event.respondWith(fetch(request).catch(() => {
            return new Response(JSON.stringify({ 
                error: 'Offline - Supabase not available' 
            }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            });
        }));
        return;
    }
    
    // Skip chrome extensions & other schemes
    if (!url.protocol.startsWith('http')) return;
    
    // ═══ Strategy 1: HTML Pages → Network First, Cache Fallback ═══
    if (request.destination === 'document' || 
        (request.headers.get('accept') || '').includes('text/html')) {
        event.respondWith(networkFirstStrategy(request));
        return;
    }
    
    // ═══ Strategy 2: Images → Cache First, Network Fallback ═══
    if (request.destination === 'image' || 
        /\.(png|jpg|jpeg|svg|gif|webp|ico)$/i.test(url.pathname)) {
        event.respondWith(cacheFirstStrategy(request, IMAGE_CACHE));
        return;
    }
    
    // ═══ Strategy 3: CDN Assets (Fonts, JS) → Cache First ═══
    if (url.hostname.includes('cdn.jsdelivr.net') || 
        url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com') ||
        url.hostname.includes('cdnjs.cloudflare.com')) {
        event.respondWith(cacheFirstStrategy(request, STATIC_CACHE, true));
        return;
    }
    
    // ═══ Strategy 4: Everything else → Stale While Revalidate ═══
    event.respondWith(staleWhileRevalidateStrategy(request));
});

// ═══════════════════════════════════════════════════════════════
// 📥 Strategy: Network First (HTML)
// ═══════════════════════════════════════════════════════════════
async function networkFirstStrategy(request) {
    try {
        const networkResponse = await fetch(request);
        
        // Cache successful responses
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('📴 SW: Offline - trying cache for:', request.url);
        
        // Try cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;
        
        // Try offline page
        const offlinePage = await caches.match('./offline.html');
        if (offlinePage) return offlinePage;
        
        // Fallback
        return new Response(
            '<html dir="rtl"><body style="font-family: Cairo; padding: 2rem; text-align: center;"><h1>لا يوجد اتصال بالإنترنت</h1><p>يرجى الاتصال بالإنترنت للمتابعة</p></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// 📥 Strategy: Cache First (Images, CDN)
// ═══════════════════════════════════════════════════════════════
async function cacheFirstStrategy(request, cacheName, preload = false) {
    // Try cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;
    
    // If not in cache, fetch from network
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(cacheName);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('❌ SW: Failed to fetch:', request.url);
        
        // Return placeholder for images
        if (request.destination === 'image') {
            return new Response(
                '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect fill="#E2E8F0" width="200" height="200"/><text x="100" y="100" text-anchor="middle" dy=".3em" fill="#94A3B8" font-family="sans-serif" font-size="14">لا توجد صورة</text></svg>',
                { headers: { 'Content-Type': 'image/svg+xml' } }
            );
        }
        
        return new Response('', { status: 503 });
    }
}

// ═══════════════════════════════════════════════════════════════
// 📥 Strategy: Stale While Revalidate (Other Assets)
// ═══════════════════════════════════════════════════════════════
async function staleWhileRevalidateStrategy(request) {
    const cachedResponse = await caches.match(request);
    
    const fetchPromise = fetch(request)
        .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
                const cache = caches.open(DYNAMIC_CACHE);
                cache.then(c => c.put(request, networkResponse.clone()));
            }
            return networkResponse;
        })
        .catch(() => cachedResponse);
    
    return cachedResponse || fetchPromise;
}

// ═══════════════════════════════════════════════════════════════
// 💬 Message Event (Communication with Client)
// ═══════════════════════════════════════════════════════════════
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((names) => {
                return Promise.all(names.map(name => caches.delete(name)));
            })
        );
    }
    
    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: CACHE_VERSION });
    }
});

// ═══════════════════════════════════════════════════════════════
// 🔔 Push Notifications (Optional - للمستقبل)
// ═══════════════════════════════════════════════════════════════
self.addEventListener('push', (event) => {
    if (!event.data) return;
    
    try {
        const data = event.data.json();
        
        const options = {
            body: data.message || 'لديك إشعار جديد',
            icon: './logo.png',
            badge: './logo.png',
            vibrate: [200, 100, 200],
            data: data.data || {},
            actions: data.actions || [],
            dir: 'rtl',
            lang: 'ar'
        };
        
        event.waitUntil(
            self.registration.showNotification(data.title || 'TopLoad', options)
        );
    } catch (e) {
        console.warn('Push error:', e);
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    const urlToOpen = event.notification.data?.url || './dashboard.html';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((windowClients) => {
                // If a window is already open, focus it
                for (let i = 0; i < windowClients.length; i++) {
                    const client = windowClients[i];
                    if (client.url.includes(urlToOpen) && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Otherwise open new window
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

// ═══════════════════════════════════════════════════════════════
// 🔄 Background Sync (Optional)
// ═══════════════════════════════════════════════════════════════
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-pending-actions') {
        event.waitUntil(syncPendingActions());
    }
});

async function syncPendingActions() {
    console.log('🔄 SW: Syncing pending actions...');
    // Placeholder for future implementation
}

console.log('✅ SW: TopLoad Service Worker loaded');
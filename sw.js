/* Dienstarbeiter für AGG Games.
   Zweck: nach dem ersten Aufruf läuft alles offline. Die Regel ist
   bewusst einfach — was einmal geladen wurde, bleibt im Speicher, und
   bei jedem Aufruf wird im Hintergrund nach einer neueren Fassung
   gesehen. So ist man nie offline blockiert und trotzdem nie lange
   veraltet.
   Beim Wechsel der Fassung unten wird der alte Speicher verworfen. */
const FASSUNG = 'agg-2026-09-10';
const KERN = [
  './',
  './index.html',
  './manifest.webmanifest',
  './bilder/agg-logo.png',
  './bilder/app/symbol-192.png',
  './bilder/app/symbol-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(FASSUNG);
    /* Einzeln statt addAll: ein fehlender Eintrag darf nicht die ganze
       Einrichtung scheitern lassen. */
    await Promise.all(KERN.map(u => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for(const name of await caches.keys())
      if(name !== FASSUNG) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const anfrage = e.request;
  if(anfrage.method !== 'GET') return;
  const url = new URL(anfrage.url);
  if(url.origin !== location.origin) return;

  e.respondWith((async () => {
    const speicher = await caches.open(FASSUNG);
    const gespeichert = await speicher.match(anfrage, { ignoreSearch: true });
    const ausDemNetz = fetch(anfrage).then(antwort => {
      if(antwort && antwort.ok && antwort.status === 200)
        speicher.put(anfrage, antwort.clone()).catch(() => {});
      return antwort;
    }).catch(() => null);

    if(gespeichert){ ausDemNetz; return gespeichert; }
    const frisch = await ausDemNetz;
    if(frisch) return frisch;
    /* Weder gespeichert noch erreichbar: wenigstens die Startseite */
    return (await speicher.match('./index.html')) ||
           new Response('Offline und nicht gespeichert.', { status: 503 });
  })());
});

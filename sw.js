/* Dienstarbeiter für AGG Games.
   Zweck: nach dem ersten Aufruf läuft alles offline. Online kommt
   immer zuerst die neueste Fassung aus dem Netz (und wird gespeichert);
   nur ohne Netz oder bei sehr langsamem Netz springt der Speicher ein.
   Beim Wechsel der Fassung unten wird der alte Speicher verworfen. */
const FASSUNG = 'agg-2026-11-07e';
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
    /* Zuerst das Netz, am HTTP-Zwischenspeicher vorbei nachgefragt (no-cache):
       so gibt es nach einem Update gleich beim ersten Neuladen die neue
       Fassung (früher erst beim zweiten). Der Speicher springt ein, wenn
       das Netz fehlt oder länger als vier Sekunden braucht. */
    const nachNetz = (anfrage.mode === 'navigate' ? fetch(anfrage) : fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }))
      .then(antwort => {
        // ohne ?…: gelesen wird ohnehin ohne (ignoreSearch), und jede neue
        // Abfrage (?seed=…, ?innen=…) legte sonst eine weitere Kopie ab
        if(antwort && antwort.ok && antwort.status === 200)
          speicher.put(url.origin + url.pathname, antwort.clone()).catch(() => {});
        return antwort;
      }).catch(() => null);
    const gespeichert = await speicher.match(anfrage, { ignoreSearch: true });
    const frisch = gespeichert
      ? await Promise.race([nachNetz, new Promise(r => setTimeout(() => r(null), 4000))])
      : await nachNetz;
    if(frisch) return frisch;
    if(gespeichert) return gespeichert;
    /* Weder erreichbar noch gespeichert: wenigstens die Startseite */
    return (await speicher.match('./index.html')) ||
           new Response('Offline und nicht gespeichert.', { status: 503 });
  })());
});

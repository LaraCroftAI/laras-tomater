// Service worker för Odlarnördens push-notiser.
//
// Den här filen gör INTE appen offline-duglig och cachar ingenting. Enda
// uppgiften är att ta emot push-meddelanden, eftersom webbläsaren kräver en
// registrerad service worker för att över huvud taget tillåta prenumerationer.
// Lägger man till cachning här måste man samtidigt lösa hur den töms – annars
// serveras gammal kod, vilket är precis den bugg vercel.json:s no-store finns
// för att undvika.

const APPENS_ADRESS = "./";

self.addEventListener("install", () => {
  // Ta över direkt i stället för att vänta på att alla flikar stängs.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  // Utan data har vi inget att visa. Webbläsaren visar då ändå en generisk
  // notis i vissa fall, så ge den en begriplig text i stället.
  let titel = "Odlarnörden";
  let text = "Dags att titta till odlingen.";

  if (event.data) {
    try {
      const data = event.data.json();
      titel = data.titel || titel;
      text = data.text || text;
    } catch {
      text = event.data.text() || text;
    }
  }

  event.waitUntil(self.registration.showNotification(titel, {
    body: text,
    icon: "icons/ikon-192.png",
    badge: "icons/ikon-192.png",
    lang: "sv",
    // Samma tagg gör att en ny påminnelse ersätter en gammal oläst i stället
    // för att lägga sig bredvid den.
    tag: "naringspaminnelse",
    renotify: true,
    data: { url: APPENS_ADRESS },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const mal = event.notification.data?.url || APPENS_ADRESS;

  // Öppna appen om den redan är igång i en flik, annars starta den. Utan det
  // här öppnas en ny flik varje gång man trycker på en notis.
  event.waitUntil((async () => {
    const oppna = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const klient of oppna) {
      if ("focus" in klient) return klient.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(mal);
  })());
});

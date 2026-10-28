"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator && process.env.NODE_ENV !== "test") {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          registration.addEventListener("updatefound", () => {
            const installingWorker = registration.installing;
            if (installingWorker) {
              installingWorker.addEventListener("statechange", () => {
                if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                  console.info("[SISPA PWA] New version available; refresh to update.");
                }
              });
            }
          });
        })
        .catch((err) => {
          console.warn("[SISPA PWA] Service worker registration ignored in this environment:", err);
        });
    }
  }, []);

  return null;
}

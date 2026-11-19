'use strict';

const CACHE_NAME = 'fbiti-app-shell-v38';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css?v=20261110-04',
  './js/config.js?v=20261110-03',
  './js/app.js?v=20261110-04',
  './assets/logo.png',
  './assets/app-icon-180.png',
  './assets/app-icon-192.png',
  './assets/app-icon-512.png',
  './assets/institution-stamp.png',
  './assets/logo-watermark.png',
  './assets/photo-1.jpg.jpeg',
  './assets/photo-2.jpg.jpeg',
  './assets/photo-3.jpg.jpeg',
  './assets/photo-4.jpg.jpeg',
  './assets/photo-5.jpg.jpeg',
  './assets/photo-6.jpg.jpeg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('fbiti-app-shell-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (!['script', 'style', 'image', 'manifest'].includes(request.destination)) return;
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok && response.type === 'basic') {
          return caches.open(CACHE_NAME)
            .then(cache => cache.put(request, response.clone()))
            .then(() => response);
        }
        return response;
      });
    })
  );
});

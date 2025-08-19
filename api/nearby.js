// api/nearby.js
const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const admin = require('firebase-admin');
const { geohashQueryBounds, distanceBetween } = require('geofire-common');

// --- Inicializar Firebase Admin ---
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // 🔑 Reemplaza los \n escapados por saltos de línea reales
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}
const db = admin.firestore();

const app = express();
app.use(express.json());
app.use(cors({ origin: '*', methods: ['POST', 'OPTIONS'] }));

// Healthcheck rápido
app.get('/health', (req, res) => res.json({ ok: true }));

// --- Endpoint Nearby ---
app.post('/nearby', async (req, res) => {
  try {
    const { lat, lng, radiusKm = 10, hasDelivery, isOpen, category } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'lat y lng son obligatorios (number)' });
    }

    const center = [lat, lng];
    let baseQuery = db.collection('businesses').where('state', '==', true);

    if (typeof hasDelivery === 'boolean') {
      baseQuery = baseQuery.where('hasDelivery', '==', hasDelivery);
    }
    if (typeof isOpen === 'boolean') {
      baseQuery = baseQuery.where('isOpen', '==', isOpen);
    }

    const bounds = geohashQueryBounds(center, radiusKm * 1000);
    const snaps = await Promise.all(
      bounds.map(b =>
        baseQuery.orderBy('geohash').startAt(b[0]).endAt(b[1]).get()
      )
    );

    const map = new Map();
    snaps.forEach(snap => {
      snap.forEach(doc => {
        const data = doc.data();
        const bizLat = data.latitude;
        const bizLng = data.longitude;
        if (typeof bizLat !== 'number' || typeof bizLng !== 'number') return;

        const dist = distanceBetween(center, [bizLat, bizLng]);
        if (dist > radiusKm * 1000) return;

        if (category) {
          const cats = Array.isArray(data.categories) ? data.categories : [];
          if (!cats.some(c => c?.name?.toLowerCase() === category.toLowerCase())) return;
        }

        map.set(doc.id, {
          id: doc.id,
          name: data.name || '',
          description: data.description || '',
          direction: data.direction || '',
          phone: data.phone || '',
          isOpen: !!data.isOpen,
          hasDelivery: !!data.hasDelivery,
          deliveryPrice: parseFloat(data.deliveryPrice) || 0,
          logoUrl: data.logoUrl || null,
          latitude: bizLat,
          longitude: bizLng,
          geohash: data.geohash,
          bank: data.bank || '',
          phonePayment: data.phonePayment || '',
          idCardPayment: data.idCardPayment || '',
          categories: Array.isArray(data.categories) ? data.categories : [],
          distanceMeters: Math.round(dist),
        });
      });
    });

    res.json({ businesses: Array.from(map.values()).sort((a, b) => a.distanceMeters - b.distanceMeters) });
  } catch (err) {
    console.error('Error en /nearby', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = serverless(app);

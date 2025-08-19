// Serverless Express en Vercel
const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const admin = require('firebase-admin');
const { geohashQueryBounds, distanceBetween } = require('geofire-common');

// --- Inicializar Firebase Admin sólo una vez ---
if (!admin.apps.length) {
  // Recomendado: guardar el JSON del service account en una env var FIREBASE_SERVICE_ACCOUNT
  // con el contenido del JSON (string). Ej: Vercel -> Settings -> Environment Variables
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    console.error('FIREBASE_SERVICE_ACCOUNT no está definido');
  }
  admin.initializeApp({
    credential: serviceAccountJson
      ? admin.credential.cert(JSON.parse(serviceAccountJson))
      : admin.credential.applicationDefault()
  });
}
const db = admin.firestore();

const app = express();
app.use(express.json());
app.use(cors({
  origin: '*', // ajusta a tu dominio/app si quieres restringir
  methods: ['POST', 'OPTIONS']
}));

// Health check
app.get('/health', (req, res) => res.status(200).json({ ok: true }));

/**
 * POST /nearby
 * body: { lat: number, lng: number, radiusKm?: number, hasDelivery?: boolean, isOpen?: boolean, category?: string }
 */
app.post('/nearby', async (req, res) => {
  try {
    const { lat, lng, radiusKm = 10, hasDelivery, isOpen, category } = req.body || {};
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'lat y lng son obligatorios (number).' });
    }
    if (typeof radiusKm !== 'number' || radiusKm <= 0 || radiusKm > 50) {
      return res.status(400).json({ error: 'radiusKm inválido (0 < radiusKm <= 50).' });
    }

    // Query base
    let baseQuery = db.collection('businesses').where('state', '==', true);

    if (typeof hasDelivery === 'boolean') {
      baseQuery = baseQuery.where('hasDelivery', '==', hasDelivery);
    }
    if (typeof isOpen === 'boolean') {
      baseQuery = baseQuery.where('isOpen', '==', isOpen);
    }

    // Bounds por geohash
    const center = [lat, lng];
    const bounds = geohashQueryBounds(center, radiusKm * 1000); // metros
    const promises = [];

    for (const b of bounds) {
      // Firestore: orderBy('geohash') + startAt/endAt
      const q = baseQuery
        .orderBy('geohash')
        .startAt(b[0])
        .endAt(b[1]);

      promises.push(q.get());
    }

    const snapshots = await Promise.all(promises);

    // Deduplicación por id
    const map = new Map();

    for (const snap of snapshots) {
      snap.forEach(doc => {
        const data = doc.data();
        const bizLat = data.latitude;
        const bizLng = data.longitude;

        if (typeof bizLat !== 'number' || typeof bizLng !== 'number' || !data.geohash) {
          return; // saltar documentos inválidos
        }

        // Filtro de distancia precisa
        const distMeters = distanceBetween(center, [bizLat, bizLng]); // geofire-common -> metros
        if (distMeters > radiusKm * 1000) return;

        // Filtro por categoría (si viene)
        if (category) {
          const cats = Array.isArray(data.categories) ? data.categories : [];
          const hasCat = cats.some(c =>
            (c && typeof c.name === 'string') &&
            c.name.toLowerCase() === category.toLowerCase()
          );
          if (!hasCat) return;
        }

        // Construir DTO (ajusta campos a tus necesidades)
        const dto = {
          id: doc.id,
          name: data.name || '',
          description: data.description || '',
          direction: data.direction || '',
          phone: data.phone || '',
          isOpen: !!data.isOpen,
          hasDelivery: !!data.hasDelivery,
          deliveryPrice: typeof data.deliveryPrice === 'number'
            ? data.deliveryPrice
            : (parseFloat(data.deliveryPrice) || 0),
          logoUrl: data.logoUrl || null,
          latitude: bizLat,
          longitude: bizLng,
          geohash: data.geohash,
          bank: data.bank || '',
          phonePayment: data.phonePayment || '',
          idCardPayment: data.idCardPayment || '',
          categories: Array.isArray(data.categories) ? data.categories : [],
          distanceMeters: Math.round(distMeters)
        };

        map.set(doc.id, dto);
      });
    }

    const businesses = Array.from(map.values())
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    return res.status(200).json({ businesses });
  } catch (err) {
    console.error('Error en /nearby', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// Export para Vercel (ruta real: /api/nearby)
module.exports = serverless(app);

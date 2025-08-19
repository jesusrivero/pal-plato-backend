// api/nearby.js - Endpoint para Vercel
const admin = require('firebase-admin');
const { geohashQueryBounds, distanceBetween } = require('geofire-common');

// Inicializar Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.FIREBASE_CLIENT_EMAIL)}`
    }),
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { lat, lng, radius = 5000 } = req.body; // radius en metros (default 5km)

    // Validar parámetros
    if (!lat || !lng) {
      return res.status(400).json({ 
        error: 'Parámetros lat y lng son requeridos' 
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radiusInM = parseInt(radius);

    // Validar rangos
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ 
        error: 'Coordenadas inválidas' 
      });
    }

    // Generar bounding box con geohash
    const center = [latitude, longitude];
    const radiusInKm = radiusInM / 1000;
    const bounds = geohashQueryBounds(center, radiusInKm);

    console.log(`Buscando negocios cerca de [${latitude}, ${longitude}] en radio de ${radiusInKm}km`);

    // Realizar queries en paralelo para cada bound
    const promises = bounds.map(bound => {
      return db.collection('businesses')
        .orderBy('geohash')
        .startAt(bound[0])
        .endAt(bound[1])
        .get();
    });

    const snapshots = await Promise.all(promises);
    
    // Combinar resultados y filtrar por distancia exacta
    const nearbyBusinesses = [];
    const seenIds = new Set();

    for (const snapshot of snapshots) {
      for (const doc of snapshot.docs) {
        const data = doc.data();
        const businessId = doc.id;

        // Evitar duplicados
        if (seenIds.has(businessId)) continue;
        seenIds.add(businessId);

        // Verificar que tenga coordenadas
        if (!data.lat || !data.lng) continue;

        const businessLocation = [data.lat, data.lng];
        const distanceInKm = distanceBetween(center, businessLocation);
        const distanceInM = distanceInKm * 1000;

        // Filtrar por distancia exacta
        if (distanceInM <= radiusInM) {
          nearbyBusinesses.push({
            id: businessId,
            ...data,
            distance: Math.round(distanceInM), // distancia en metros
            distanceFormatted: distanceInM < 1000 
              ? `${Math.round(distanceInM)}m`
              : `${(distanceInKm).toFixed(1)}km`
          });
        }
      }
    }

    // Ordenar por distancia
    nearbyBusinesses.sort((a, b) => a.distance - b.distance);

    console.log(`Encontrados ${nearbyBusinesses.length} negocios cerca`);

    return res.status(200).json({
      success: true,
      center: { lat: latitude, lng: longitude },
      radius: radiusInM,
      count: nearbyBusinesses.length,
      businesses: nearbyBusinesses
    });

  } catch (error) {
    console.error('Error en nearby endpoint:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
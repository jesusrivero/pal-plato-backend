// /api/nearby.js
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import admin from "firebase-admin";
import { geohashQueryBounds, distanceBetween } from "geofire-common";

// --- Inicializar Firebase Admin ---
if (!admin.apps.length) {
  try {
    console.log("Inicializando Firebase Admin...");
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
    console.log("Firebase Admin inicializado correctamente");
  } catch (e) {
    console.error("❌ Error al inicializar Firebase Admin:", e);
  }
}

const db = admin.firestore();

// --- Función auxiliar para distancia precisa (Haversine) ---
function calculatePreciseDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // metros
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

// --- Handler principal para Vercel ---
export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      const { lat, lng, radiusKm = 10, hasDelivery, isOpen, category } = req.body;

      if (typeof lat !== "number" || typeof lng !== "number") {
        return res.status(400).json({ error: "lat y lng inválidos" });
      }

      if (radiusKm <= 0 || radiusKm > 100) {
        return res.status(400).json({ error: "radiusKm debe estar entre 0 y 100" });
      }

      const center = [lat, lng];
      const bounds = geohashQueryBounds(center, radiusKm * 1000);

      let baseQuery = db.collection("businesses").where("state", "==", true);
      if (typeof hasDelivery === "boolean") {
        baseQuery = baseQuery.where("hasDelivery", "==", hasDelivery);
      }
      if (typeof isOpen === "boolean") {
        baseQuery = baseQuery.where("isOpen", "==", isOpen);
      }

      const snaps = await Promise.all(
        bounds.map((b) =>
          baseQuery.orderBy("geohash").startAt(b[0]).endAt(b[1]).get()
        )
      );

      const businesses = [];
      const seen = new Set();

      snaps.forEach((snap) => {
        snap.forEach((doc) => {
          if (seen.has(doc.id)) return;
          seen.add(doc.id);

          const data = doc.data();
          const dist = calculatePreciseDistance(lat, lng, data.latitude, data.longitude);

          if (dist <= radiusKm * 1000) {
            if (category) {
              const cats = Array.isArray(data.categories) ? data.categories : [];
              const match = cats.some(
                (c) => c?.name?.toLowerCase().trim() === category.toLowerCase().trim()
              );
              if (!match) return;
            }

            businesses.push({
  id: doc.id,
  businessId: doc.id, // 👈 lo mismo que id (por compatibilidad con tu data class)
  ownerId: data.ownerId || "",
  name: data.name || "",
  description: data.description || "",
  direction: data.direction || "",
  phone: data.phone || "",
  state: data.state ?? true,
  date: data.date || null,
  logoUrl: data.logoUrl || null,
  isOpen: !!data.isOpen,
  hasDelivery: !!data.hasDelivery,
  deliveryPrice: parseFloat(data.deliveryPrice) || 0,
  latitude: data.latitude,
  longitude: data.longitude,
  geohash: data.geohash || null,
  categories: Array.isArray(data.categories) ? data.categories : [],
  schedule: Array.isArray(data.schedule) ? data.schedule : [],
  addressNotes: data.addressNotes || null,

  // 💳 Datos de pago móvil
  bank: data.bank || "",
  phonePayment: data.phonePayment || "",
  idCardPayment: data.idCardPayment || "",

  // ⚡ Distancia
  distanceMeters: Math.round(dist),
});

          }
        });
      });

      businesses.sort((a, b) => a.distanceMeters - b.distanceMeters);

      res.status(200).json({ businesses });
    } catch (e) {
      console.error("🔥 Error en /api/nearby:", e);
      res.status(500).json({ error: "Error interno", message: e.message });
    }
  } else if (req.method === "GET") {
    res.status(200).json({ ok: true, message: "API Nearby funcionando 🚀" });
  } else {
    res.status(405).json({ error: "Método no permitido" });
  }
}

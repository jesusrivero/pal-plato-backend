import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import admin from "firebase-admin";
import { geohashQueryBounds } from "geofire-common";
// ✅ IMPORTACIÓN ÚNICA
import { checkIfOpen } from "../utils/businessUtils.js";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

function calculatePreciseDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ/2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { lat, lng, radiusKm = 10, hasDelivery, isOpen, category } = req.body;
    const center = [lat, lng];
    const bounds = geohashQueryBounds(center, radiusKm * 1000);

    let baseQuery = db.collection("businesses").where("state", "==", true);
    if (typeof hasDelivery === "boolean") baseQuery = baseQuery.where("hasDelivery", "==", hasDelivery);

    const snaps = await Promise.all(bounds.map(b => 
      baseQuery.orderBy("geohash").startAt(b[0]).endAt(b[1]).get()
    ));

    const businesses = [];
    const seen = new Set();

    snaps.forEach(snap => {
      snap.forEach(doc => {
        if (seen.has(doc.id)) return;
        seen.add(doc.id);

        const data = doc.data();
        const dist = calculatePreciseDistance(lat, lng, data.latitude, data.longitude);

        if (dist <= radiusKm * 1000) {
          // ✅ USAMOS LA FUNCIÓN DE UTILS
          // Agregamos !! para forzar a booleano y evitar problemas con undefined
          const isOpenNow = checkIfOpen(data.schedule, !!data.manualClosed);

          if (isOpen === true && !isOpenNow) return;

          if (category) {
            const cats = Array.isArray(data.categories) ? data.categories : [];
            if (!cats.some(c => c?.name?.toLowerCase().trim() === category.toLowerCase().trim())) return;
          }

          businesses.push({
            ...data,
            id: doc.id,
            businessId: doc.id,
            isOpen: isOpenNow,
            distanceMeters: Math.round(dist)
          });
        }
      });
    });

    res.status(200).json({ businesses: businesses.sort((a, b) => a.distanceMeters - b.distanceMeters) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
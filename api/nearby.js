import express from "express";
import admin from "firebase-admin";
import * as geofire from "geofire-common";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();
const app = express();
app.use(express.json());

app.post("/api/nearby", async (req, res) => {
  try {
    const { lat, lng, radius } = req.body;
    if (!lat || !lng) {
      return res.status(400).json({ error: "Lat y Lng son obligatorios" });
    }

    const radiusInM = (radius || 10) * 1000;
    const bounds = geofire.geohashQueryBounds([lat, lng], radiusInM);
    const promises = bounds.map(b =>
      db.collection("businesses").orderBy("geohash").startAt(b[0]).endAt(b[1]).get()
    );
    const snapshots = await Promise.all(promises);

    const matchingDocs = [];
    for (const snap of snapshots) {
      for (const doc of snap.docs) {
        const data = doc.data();
        const distanceInKm = geofire.distanceBetween([lat, lng], [data.lat, data.lng]);
        if (distanceInKm <= radiusInM / 1000) {
          matchingDocs.push({ id: doc.id, ...data, distanceKm: distanceInKm.toFixed(2) });
        }
      }
    }

    return res.json(matchingDocs);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error interno" });
  }
});

export default app;

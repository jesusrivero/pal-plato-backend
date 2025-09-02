// import express from "express";
// import cors from "cors";
// import dotenv from "dotenv";
// import admin from "firebase-admin";

// dotenv.config();

// if (!admin.apps.length) {
//   admin.initializeApp({
//     credential: admin.credential.applicationDefault(),
//   });
// }

// const app = express();
// app.use(express.json({ limit: "50mb" })); // 👈 importante si mandas imágenes en base64
// app.use(cors());

// app.use("/api/orders", orders);
// app.use("/api/products", products); // 👈 agrega esto


// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
//   console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
// });


import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";

// Rutas
import orders from "./api/orders/create.js";
import products from "./api/products/create.js";
import nearby from "./api/nearby.js";

dotenv.config({ path: ".env.local" });

// 🔥 Inicializar Firebase Admin
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
    console.log("✅ Firebase Admin inicializado");
  } catch (err) {
    console.error("❌ Error inicializando Firebase Admin:", err);
  }
}

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(cors());

// 👇 Rutas
app.use("/api/orders", orders);
app.use("/api/products", products);
app.use("/api/nearby", nearby);

// 🚀 Servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
});


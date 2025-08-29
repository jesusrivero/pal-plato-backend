import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import serverless from "serverless-http";

import nearbyRoutes from "./api/nearby.js";   // Rutas de negocios cercanos
import ordersRouter from "./api/orders.js";  // Rutas de pedidos
import admin from "firebase-admin";

dotenv.config();

// 🔹 Inicializar Firebase Admin una sola vez
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const app = express();
app.use(express.json());
app.use(cors());

// 🔹 Montar rutas
app.use("/api/nearby", nearbyRoutes);
app.use("/api/orders", ordersRouter);

// 🔹 Ruta de prueba
app.get("/api", (req, res) => {
  res.send("API PalPlato funcionando 🚀");
});

// ⚠️ Exporta como serverless function para Vercel
export const handler = serverless(app);

// Para pruebas locales
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
  });
}

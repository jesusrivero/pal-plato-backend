// index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import nearbyRoutes from "./api/nearby.js"; // tus rutas

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

app.use("/api", nearbyRoutes); // monta /api/nearby

// ⚠️ No uses app.listen en Vercel
// Exporta como serverless function
import serverless from "serverless-http";
export const handler = serverless(app);

// Para pruebas locales:
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
  });
}

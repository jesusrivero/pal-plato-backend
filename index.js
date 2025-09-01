import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config();

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const app = express();
app.use(express.json({ limit: "50mb" })); // 👈 importante si mandas imágenes en base64
app.use(cors());

app.use("/api/orders", orders);
app.use("/api/products", products); // 👈 agrega esto


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
});

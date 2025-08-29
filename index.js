import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";
import orders from "./api/orders.js"; // ahora es app serverless

dotenv.config();

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const app = express();
app.use(express.json());
app.use(cors());

app.use("/api/orders", orders);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
});

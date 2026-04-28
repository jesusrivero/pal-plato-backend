import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import admin from "firebase-admin";

console.log("🚦 /api/products/create v5 (solo JSON, sin imagen)");

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
    console.log("✅ Firebase Admin inicializado correctamente");
  } catch (e) {
    console.error("❌ Error inicializando Firebase Admin:", e);
  }
}
const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    console.log("📩 Body recibido:", req.body);

    const {
      businessId,
      name,
      price,
      description = "",
      category = "",
      preparationTime = 0,
      specialNotes = "",
      available = true,
      ingredients = [],
      size = null,
      type = null,
      imageUrl = ""
    } = req.body;

    if (!businessId) return res.status(400).json({ error: "businessId requerido" });
    if (!name) return res.status(400).json({ error: "name requerido" });

    // Verificar negocio
    const businessRef = db.collection("businesses").doc(businessId);
    const businessSnap = await businessRef.get();
    if (!businessSnap.exists) {
      return res.status(404).json({ error: "Negocio no encontrado" });
    }

    // Crear doc
    const productRef = businessRef.collection("products").doc();
    const productId = productRef.id;

    const newProduct = {
      id: productId,
      businessId,
      name,
      price: isNaN(Number(price)) ? 0 : Number(price),
      description,
      category,
      preparationTime: Number(preparationTime),
      specialNotes,
      date: Date.now(),
      ingredients: Array.isArray(ingredients) ? ingredients : [],
      available: Boolean(available),
      size,
      type,
      imageUrl,
    };

    await productRef.set(newProduct);

    return res.status(201).json({
      success: true,
      message: "Producto creado exitosamente",
      product: newProduct,
    });
  } catch (error) {
    console.error("❌ Error general al crear producto:", error);
    return res.status(500).json({ error: error.message || "Error interno" });
  }
}


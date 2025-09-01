import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import admin from "firebase-admin";
import { v2 as cloudinary } from "cloudinary";

// --- Inicializar Firebase Admin ---
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

// --- Configuración de Cloudinary ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const {
      businessId,
      name,
      price,
      description,
      category,
      preparationTime,
      specialNotes,
      ingredients,
      available,
      size,
      type,
      imageBase64, // 📌 Imagen enviada como Base64 desde la app
    } = req.body;

    // --- Validaciones ---
    if (!businessId) return res.status(400).json({ error: "businessId requerido" });
    if (!name) return res.status(400).json({ error: "name requerido" });
    if (typeof price !== "number") return res.status(400).json({ error: "price inválido" });

    // Verificar que el negocio existe
    const businessRef = db.collection("businesses").doc(businessId);
    const businessSnap = await businessRef.get();
    if (!businessSnap.exists) {
      return res.status(404).json({ error: "Negocio no encontrado" });
    }

    // Subir imagen a Cloudinary si existe
    let imageUrl = "";
    if (imageBase64) {
      const uploadResponse = await cloudinary.uploader.upload(imageBase64, {
        folder: `menus/${businessId}`,
        resource_type: "image",
      });
      imageUrl = uploadResponse.secure_url;
    }

    // Generar ID del producto
    const productRef = businessRef.collection("products").doc();
    const productId = productRef.id;

    const newProduct = {
      id: productId,
      businessId,
      name,
      price,
      description: description || "",
      category: category || "",
      preparationTime: preparationTime || 0,
      specialNotes: specialNotes || "",
      date: Date.now(),
      ingredients: ingredients || [],
      available: available ?? true,
      size: size || null,
      type: type || null,
      imageUrl, // ✅ URL de Cloudinary
    };

    // Guardar en Firestore
    await productRef.set(newProduct);

    res.status(201).json({
      success: true,
      message: "Producto creado exitosamente",
      product: newProduct,
    });
  } catch (error) {
    console.error("❌ Error al crear producto:", error);
    res.status(500).json({ error: "Error interno al crear producto", details: error.message });
  }
}

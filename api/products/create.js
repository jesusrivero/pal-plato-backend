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
    console.warn("⚠️ Método no permitido:", req.method);
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    console.log("📩 Body recibido:", req.body);

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
      imageBase64,
    } = req.body;

    // --- Validaciones ---
    if (!businessId) {
      console.error("❌ businessId requerido");
      return res.status(400).json({ error: "businessId requerido" });
    }
    if (!name) {
      console.error("❌ name requerido");
      return res.status(400).json({ error: "name requerido" });
    }
    if (typeof price !== "number") {
      console.error("❌ price inválido:", price);
      return res.status(400).json({ error: "price inválido" });
    }

    console.log("🔍 Verificando negocio:", businessId);
    const businessRef = db.collection("businesses").doc(businessId);
    const businessSnap = await businessRef.get();

    if (!businessSnap.exists) {
      console.error("❌ Negocio no encontrado:", businessId);
      return res.status(404).json({ error: "Negocio no encontrado" });
    }

    // Subir imagen a Cloudinary
    let imageUrl = "";
    if (imageBase64) {
      console.log("📤 Subiendo imagen a Cloudinary...");
      try {
        const uploadResponse = await cloudinary.uploader.upload(imageBase64, {
          folder: `menus/${businessId}`,
          resource_type: "image",
        });
        imageUrl = uploadResponse.secure_url;
        console.log("✅ Imagen subida:", imageUrl);
      } catch (cloudError) {
        console.error("❌ Error subiendo imagen a Cloudinary:", cloudError);
        return res.status(500).json({ error: "Error subiendo imagen", details: cloudError.message });
      }
    } else {
      console.log("ℹ️ No se recibió imagen para este producto");
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
      imageUrl,
    };

    console.log("📝 Guardando producto en Firestore:", newProduct);

    // Guardar en Firestore
    await productRef.set(newProduct);

    console.log("✅ Producto creado exitosamente:", productId);

    res.status(201).json({
      success: true,
      message: "Producto creado exitosamente",
      product: newProduct,
    });
  } catch (error) {
    console.error("❌ Error general al crear producto:", error);
    res.status(500).json({ error: "Error interno al crear producto", details: error.message });
  }
}

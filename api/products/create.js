import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import admin from "firebase-admin";
import formidable from "formidable";
import { v2 as cloudinary } from "cloudinary";

export const config = {
  api: {
    bodyParser: false, // 👈 necesario para que formidable maneje form-data
  },
};

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

  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("❌ Error parseando form-data:", err);
      return res.status(500).json({ error: "Error parseando form-data" });
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
      } = fields;

      // Validaciones básicas
      if (!businessId) return res.status(400).json({ error: "businessId requerido" });
      if (!name) return res.status(400).json({ error: "name requerido" });

      // Verificar negocio
      const businessRef = db.collection("businesses").doc(businessId);
      const businessSnap = await businessRef.get();
      if (!businessSnap.exists) {
        return res.status(404).json({ error: "Negocio no encontrado" });
      }

      // Subir imagen a Cloudinary si existe
      let imageUrl = "";
      if (files.image) {
        try {
          const uploadResponse = await cloudinary.uploader.upload(files.image.filepath, {
            folder: `menus/${businessId}`,
            resource_type: "image",
          });
          imageUrl = uploadResponse.secure_url;
        } catch (cloudError) {
          console.error("❌ Error subiendo imagen:", cloudError);
          return res.status(500).json({ error: "Error subiendo imagen", details: cloudError.message });
        }
      }

      // Generar ID de producto
      const productRef = businessRef.collection("products").doc();
      const productId = productRef.id;

      // Construir objeto producto
      const newProduct = {
        id: productId,
        businessId,
        name,
        price: Number(price),
        description: description || "",
        category: category || "",
        preparationTime: Number(preparationTime) || 0,
        specialNotes: specialNotes || "",
        date: Date.now(),
        ingredients: Array.isArray(ingredients) ? ingredients : [],
        available: available !== undefined ? available === "true" || available === true : true,
        size: size || null,
        type: type || null,
        imageUrl,
      };

      // Guardar en Firestore
      await productRef.set(newProduct);

      return res.status(201).json({
        success: true,
        message: "Producto creado exitosamente",
        product: newProduct,
      });
    } catch (error) {
      console.error("❌ Error creando producto:", error);
      return res.status(500).json({ error: error.message });
    }
  });
}

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import admin from "firebase-admin";

// Marca de versión
console.log("🚦 /api/products/create v4 (sin imagen en backend)");

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
      imageUrl, // 👈 ahora viene directo de Cloudinary
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



// // /api/products/create.js  (Pages Router)
// import dotenv from "dotenv";
// dotenv.config({ path: ".env.local" });

// import admin from "firebase-admin";
// import formidable from "formidable";
// import { v2 as cloudinary } from "cloudinary";

// export const config = {
//   api: {
//     bodyParser: false, // obligatorio para formidable
//   },
// };

// // Marca de versión para confirmar despliegue
// console.log("🚦 /api/products/create v3");

// if (!admin.apps.length) {
//   try {
//     admin.initializeApp({
//       credential: admin.credential.cert({
//         projectId: process.env.FIREBASE_PROJECT_ID,
//         clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
//         privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
//       }),
//     });
//     console.log("✅ Firebase Admin inicializado correctamente");
//   } catch (e) {
//     console.error("❌ Error inicializando Firebase Admin:", e);
//   }
// }
// const db = admin.firestore();

// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
// });

// // helper promisificado
// function parseForm(req) {
//   const form = formidable({ multiples: false });
//   return new Promise((resolve, reject) => {
//     form.parse(req, (err, fields, files) => {
//       if (err) return reject(err);
//       resolve({ fields, files });
//     });
//   });
// }

// export default async function handler(req, res) {
//   if (req.method !== "POST") {
//     return res.status(405).json({ error: "Método no permitido" });
//   }

//   try {
//     // Útil para diagnosticar si llega como multipart
//     console.log("🔎 content-type:", req.headers["content-type"]);

//     const { fields, files } = await parseForm(req);

//     // NUNCA uses req.body aquí
//     console.log("📩 Fields keys:", Object.keys(fields || {}));
//     console.log("📎 Files keys:", Object.keys(files || {}));

//     const getVal = (v) => (Array.isArray(v) ? v[0] : v);

//     const businessId = getVal(fields.businessId);
//     const name = getVal(fields.name);
//     const price = Number(getVal(fields.price));
//     const description = getVal(fields.description) || "";
//     const category = getVal(fields.category) || "";
//     const preparationTime = Number(getVal(fields.preparationTime) || 0);
//     const specialNotes = getVal(fields.specialNotes) || "";
//     const availableRaw = getVal(fields.available);
//     const size = getVal(fields.size) || null;
//     const type = getVal(fields.type) || null;

//     // ingredients puede venir como JSON string o "a,b,c"
//     let ingredients = getVal(fields.ingredients);
//     if (typeof ingredients === "string") {
//       try {
//         ingredients = JSON.parse(ingredients);
//       } catch {
//         ingredients = ingredients
//           ? ingredients.split(",").map((s) => s.trim()).filter(Boolean)
//           : [];
//       }
//     }
//     const available =
//       availableRaw !== undefined
//         ? availableRaw === "true" || availableRaw === true
//         : true;

//     if (!businessId) {
//       console.log("⛔ businessId ausente. fields:", fields);
//       return res.status(400).json({ error: "businessId requerido" });
//     }
//     if (!name) return res.status(400).json({ error: "name requerido" });

//     // Verificar negocio
//     const businessRef = db.collection("businesses").doc(businessId);
//     const businessSnap = await businessRef.get();
//     if (!businessSnap.exists) {
//       return res.status(404).json({ error: "Negocio no encontrado" });
//     }

//     // Subir imagen si llegó
//     let imageUrl = "";
//     const imageFile = Array.isArray(files?.image) ? files.image[0] : files?.image;
//     if (imageFile?.filepath) {
//       try {
//         const uploadResponse = await cloudinary.uploader.upload(imageFile.filepath, {
//           folder: `menus/${businessId}`,
//           resource_type: "image",
//         });
//         imageUrl = uploadResponse.secure_url;
//       } catch (cloudError) {
//         console.error("❌ Error subiendo imagen:", cloudError);
//         return res
//           .status(500)
//           .json({ error: "Error subiendo imagen", details: cloudError.message });
//       }
//     }

//     // Crear doc
//     const productRef = businessRef.collection("products").doc();
//     const productId = productRef.id;

//     const newProduct = {
//       id: productId,
//       businessId,
//       name,
//       price: isNaN(price) ? 0 : price,
//       description,
//       category,
//       preparationTime: isNaN(preparationTime) ? 0 : preparationTime,
//       specialNotes,
//       date: Date.now(),
//       ingredients: Array.isArray(ingredients) ? ingredients : [],
//       available,
//       size,
//       type,
//       imageUrl,
//     };

//     await productRef.set(newProduct);

//     return res.status(201).json({
//       success: true,
//       message: "Producto creado exitosamente",
//       product: newProduct,
//     });
//   } catch (error) {
//     console.error("❌ Error general al crear producto:", error);
//     return res.status(500).json({ error: error.message || "Error interno" });
//   }
// }

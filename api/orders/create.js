import dotenv from "dotenv";
dotenv.config({ path: ".env.local" }); // si lo necesitas localmente

import admin from "firebase-admin";

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
    console.warn("⚠️ Método no permitido:", req.method);
    return res.status(405).json({ error: "Método no permitido" });
  }

  console.log("📦 Body recibido:", req.body);

  try {
    const { businessId, customerId, customerName, customerPhone, items, deliveryFee, location, instructions, deliveryType } = req.body;

    if (!businessId) return res.status(400).json({ error: "businessId requerido" });
    if (!customerId) return res.status(400).json({ error: "customerId requerido" });
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Debe incluir al menos un producto" });
    }

    // Validar negocio
    const businessRef = db.collection("businesses").doc(businessId);
    const businessSnap = await businessRef.get();
    console.log("📍 Negocio obtenido:", businessSnap.exists);
    if (!businessSnap.exists) return res.status(404).json({ error: "Negocio no encontrado" });

    // Validar productos
    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      console.log("🔹 Procesando item:", item);
      if (!item.productId || item.quantity <= 0) {
        return res.status(400).json({ error: "Producto inválido en items" });
      }

      const productRef = businessRef.collection("products").doc(item.productId);
      const productSnap = await productRef.get();
      console.log(`📦 Producto ${item.productId} existe:`, productSnap.exists);

      if (!productSnap.exists)
        return res.status(404).json({ error: `Producto ${item.productId} no encontrado` });

      const productData = productSnap.data();
      if (!productData || typeof productData.price !== "number") {
        console.error("❌ Datos del producto inválidos:", productData);
        return res.status(500).json({ error: `Datos inválidos para el producto ${item.productId}` });
      }

      subtotal += productData.price * item.quantity;

      validatedItems.push({
        productId: item.productId,
        name: productData.name || "Sin nombre",
        quantity: item.quantity,
        price: productData.price,
        specialNotes: item.specialNotes || "",
      });
    }

    const total = subtotal + (deliveryFee || 0);

    const newOrderRef = db.collection("orders").doc();
    const newOrder = {
      orderId: newOrderRef.id,
      businessId,
      customerId,
      customerName,
      customerPhone,
      items: validatedItems,
      total,
      deliveryFee: deliveryFee || 0,
      location: deliveryType === "delivery" ? location : null,
      instructions: instructions || "",
      comprobanteUrl: "",
      reference: "",
      status: "pending",
      deliveryType,
      seenByOwner: false,
      createdAt: Date.now(),
    };

    console.log("✅ Pedido a crear:", newOrder);
    await newOrderRef.set(newOrder);

   res.status(201).json({
  success: true,
  message: "Pedido creado exitosamente",
  order: newOrder
});
  } catch (error) {
    console.error("❌ Error al crear pedido:", error);
    res.status(500).json({ error: "Error interno al crear pedido", details: error.message });
  }
}

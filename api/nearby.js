// /api/orders/create.js
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  try {
    const { businessId, customerId, customerName, customerPhone, items, deliveryFee, location, instructions, deliveryType } = req.body;

    if (!businessId) return res.status(400).json({ error: "businessId requerido" });
    if (!customerId) return res.status(400).json({ error: "customerId requerido" });
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Debe incluir al menos un producto" });
    }

    // Validaciones y creación de pedido (igual que antes)
    const businessRef = db.collection("businesses").doc(businessId);
    const businessSnap = await businessRef.get();
    if (!businessSnap.exists) return res.status(404).json({ error: "Negocio no encontrado" });

    let subtotal = 0;
    const validatedItems = [];
    for (const item of items) {
      if (!item.productId || item.quantity <= 0) {
        return res.status(400).json({ error: "Producto inválido en items" });
      }
      const productRef = businessRef.collection("products").doc(item.productId);
      const productSnap = await productRef.get();
      if (!productSnap.exists)
        return res.status(404).json({ error: `Producto ${item.productId} no encontrado` });

      const productData = productSnap.data();
      subtotal += productData.price * item.quantity;

      validatedItems.push({
        productId: item.productId,
        name: productData.name,
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

    await newOrderRef.set(newOrder);

    res.status(201).json({ message: "Pedido creado exitosamente", order: newOrder });
  } catch (error) {
    console.error("❌ Error al crear pedido:", error);
    res.status(500).json({ error: "Error interno al crear pedido" });
  }
}

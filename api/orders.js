import express from "express";
import cors from "cors";
import admin from "firebase-admin";
import serverless from "serverless-http";

const app = express();
app.use(express.json());
app.use(cors());

const db = admin.firestore();

/**
 * Crear un pedido
 * POST /api/orders/create
 */
app.post("/create", async (req, res) => {
  try {
    const {
      businessId,
      customerId,
      customerName,
      customerPhone,
      items,
      deliveryFee,
      location,
      instructions,
      deliveryType,
    } = req.body;

    if (!businessId) return res.status(400).json({ error: "businessId requerido" });
    if (!customerId) return res.status(400).json({ error: "customerId requerido" });
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Debe incluir al menos un producto" });
    }

    // Validar negocio
    const businessRef = db.collection("businesses").doc(businessId);
    const businessSnap = await businessRef.get();
    if (!businessSnap.exists) return res.status(404).json({ error: "Negocio no encontrado" });

    // Validar productos
    let subtotal = 0;
    const validatedItems = [];
    for (const item of items) {
      if (!item.productId || item.quantity <= 0) {
        return res.status(400).json({ error: "Producto inválido en items" });
      }
      const productRef = businessRef.collection("products").doc(item.productId);
      const productSnap = await productRef.get();
      if (!productSnap.exists) return res.status(404).json({ error: `Producto ${item.productId} no encontrado` });

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

    // Crear pedido
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

    return res.status(201).json({
      message: "Pedido creado exitosamente",
      order: newOrder,
    });
  } catch (error) {
    console.error("❌ Error al crear pedido:", error);
    return res.status(500).json({ error: "Error interno al crear pedido" });
  }
});

// Exportar como serverless function para Vercel
export default serverless(app);

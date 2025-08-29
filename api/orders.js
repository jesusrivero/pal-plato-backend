import express from "express";
import admin from "firebase-admin";

const router = express.Router();
const db = admin.firestore();

/**
 * Crear un pedido
 * POST /orders/create
 */
router.post("/create", async (req, res) => {
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
      deliveryType
    } = req.body;

    // 🔹 Validaciones iniciales
    if (!businessId) return res.status(400).json({ error: "businessId requerido" });
    if (!customerId) return res.status(400).json({ error: "customerId requerido" });
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Debe incluir al menos un producto" });
    }
    if (!["delivery", "pickup"].includes(deliveryType)) {
      return res.status(400).json({ error: "deliveryType inválido" });
    }
    if (deliveryType === "delivery" && !location) {
      return res.status(400).json({ error: "location requerido para delivery" });
    }

    // 🔹 Validar que el negocio existe
    const businessRef = db.collection("businesses").doc(businessId);
    const businessSnap = await businessRef.get();
    if (!businessSnap.exists) {
      return res.status(404).json({ error: "Negocio no encontrado" });
    }

    // 🔹 Validar productos y recalcular totales
    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      if (!item.productId || item.quantity <= 0) {
        return res.status(400).json({ error: "Producto inválido en items" });
      }

      const productRef = businessRef.collection("products").doc(item.productId);
      const productSnap = await productRef.get();

      if (!productSnap.exists) {
        return res.status(404).json({ error: `Producto ${item.productId} no encontrado` });
      }

      const productData = productSnap.data();

      // Usar siempre el precio oficial de Firestore
      const price = productData.price;
      const quantity = item.quantity;
      subtotal += price * quantity;

      validatedItems.push({
        productId: item.productId,
        name: productData.name, // sobrescribir con nombre oficial
        quantity,
        price,
        specialNotes: item.specialNotes || ""
      });
    }

    const total = subtotal + (deliveryFee || 0);

    // 🔹 Crear el pedido
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
      comprobanteUrl: "", // vacío hasta que cliente suba comprobante
      reference: "",
      status: "pending",
      deliveryType,
      seenByOwner: false,
      createdAt: Date.now()
    };

    await newOrderRef.set(newOrder);

    return res.status(201).json({
      message: "Pedido creado exitosamente",
      order: newOrder
    });
  } catch (error) {
    console.error("❌ Error al crear pedido:", error);
    return res.status(500).json({ error: "Error interno al crear pedido" });
  }
});

/**
 * Subir comprobante después de que negocio acepte
 * PATCH /orders/:orderId/proof
 */
router.patch("/:orderId/proof", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { comprobanteUrl, reference } = req.body;

    if (!comprobanteUrl || !reference) {
      return res.status(400).json({ error: "Faltan datos del comprobante" });
    }

    // 🔹 Validar que pedido existe
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }

    const orderData = orderSnap.data();
    if (orderData.status !== "accepted") {
      return res.status(400).json({ error: "Solo puedes subir comprobante si el pedido está aceptado" });
    }

    await orderRef.update({
      comprobanteUrl,
      reference
    });

    return res.json({ success: true, message: "Comprobante guardado correctamente" });
  } catch (err) {
    console.error("❌ Error subiendo comprobante:", err);
    return res.status(500).json({ error: "Error interno al subir comprobante" });
  }
});

/**
 * Cambiar estado del pedido (dueño lo acepta/rechaza)
 * PATCH /orders/:orderId/status
 */
router.patch("/:orderId/status", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Estado inválido" });
    }

    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }

    await orderRef.update({ status });

    return res.json({ success: true, message: `Pedido ${status}` });
  } catch (err) {
    console.error("❌ Error actualizando estado del pedido:", err);
    return res.status(500).json({ error: "Error interno al actualizar estado del pedido" });
  }
});

export default router;

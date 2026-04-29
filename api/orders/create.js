import { db } from "../../firebase.js";

// Importamos o pegamos la función aquí para que esté disponible
function checkIfOpen(schedule, isManualClosed = false) {
    if (isManualClosed === true) return false;
    if (!Array.isArray(schedule) || schedule.length === 0) return false;

    const now = new Date();
    const venezuelaOffset = -4 * 3600000;
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const venezuelaDate = new Date(utc + venezuelaOffset);

    const dayIndex = venezuelaDate.getDay();
    const currentMinutes = venezuelaDate.getHours() * 60 + venezuelaDate.getMinutes();

    const dayNames = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    const dayNamesNoTilde = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
    const todayName = dayNames[dayIndex];
    const todayNameNoTilde = dayNamesNoTilde[dayIndex];

    const todaySchedule = schedule.find(s => {
        const dbDay = s.day?.trim().toLowerCase();
        return dbDay === todayName || dbDay === todayNameNoTilde;
    });

    if (!todaySchedule || !todaySchedule.isOpen) return false;

    const [openH, openM] = (todaySchedule.openTime || "00:00").split(":").map(Number);
    const [closeH, closeM] = (todaySchedule.closeTime || "00:00").split(":").map(Number);

    const openMin = openH * 60 + openM;
    const closeMin = closeH * 60 + closeM;

    if (closeMin < openMin) {
        return currentMinutes >= openMin || currentMinutes < closeMin;
    }
    return currentMinutes >= openMin && currentMinutes < closeMin;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const { businessId, customerId, customerName, customerPhone, items, deliveryFee, location, instructions, deliveryType, reference } = req.body;

    // 1. Validaciones básicas de entrada
    if (!businessId || !customerId) return res.status(400).json({ error: "Datos incompletos" });
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Debe incluir al menos un producto" });
    }

    // 2. Obtener datos del negocio
    const businessRef = db.collection("businesses").doc(businessId);
    const businessSnap = await businessRef.get();
    
    if (!businessSnap.exists) return res.status(404).json({ error: "Negocio no encontrado" });
    
    const businessData = businessSnap.data();

    // 🔴 VALIDACIÓN CRÍTICA: ¿Está abierto ahora?
    const isOpenNow = checkIfOpen(businessData.schedule, businessData.manualClosed);
    
    if (!isOpenNow) {
      return res.status(400).json({
        success: false,
        message: "El negocio se encuentra cerrado en este momento. No puede procesar el pedido."
      });
    }

    // 3. VALIDACIÓN: Evitar pedidos pendientes (Tu lógica existente)
    const pendingOrdersQuery = await db.collection("orders")
      .where("customerId", "==", customerId)
      .where("status", "==", "pending")
      .get();

    if (!pendingOrdersQuery.empty) {
      return res.status(400).json({
        success: false,
        message: "Ya tienes un pedido pendiente. No puedes crear otro hasta que se complete."
      });
    }

    // 4. Validar productos y calcular total (Tu lógica existente)
    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const productRef = businessRef.collection("products").doc(item.productId);
      const productSnap = await productRef.get();

      if (!productSnap.exists)
        return res.status(404).json({ error: `Producto ${item.productId} no encontrado` });

      const productData = productSnap.data();
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

    // 5. Crear el pedido
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
      status: "pending",
      deliveryType,
      reference: reference || "",    
      seenByOwner: false,
      createdAt: Date.now(),
    };

    await newOrderRef.set(newOrder);

    return res.status(201).json({
      success: true,
      message: "Pedido creado exitosamente",
      order: newOrder
    });

  } catch (error) {
    console.error("❌ Error al crear pedido:", error);
    return res.status(500).json({ error: "Error interno", details: error.message });
  }
}
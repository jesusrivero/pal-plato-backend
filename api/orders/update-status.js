import { db } from "../../firebase.js"; // Usa la misma importación que tus otros archivos

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { orderId, newStatus, businessId } = req.body;

  // 1. Validación de campos básicos
  if (!orderId || !newStatus || !businessId) {
    return res.status(400).json({ error: "orderId, newStatus y businessId son requeridos" });
  }

  try {
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    const orderData = orderDoc.data();

    // 2. SEGURIDAD: Validar que el negocio que intenta actualizar es el dueño del pedido
    if (orderData.businessId !== businessId) {
      return res.status(403).json({ error: 'No tienes permiso para modificar este pedido' });
    }

    const currentStatus = orderData.status;

    // 3. CENTRALIZACIÓN DE LÓGICA
    const allowed = getAllowedTransitions(currentStatus, orderData.deliveryType);
    
    if (!allowed.includes(newStatus)) {
      return res.status(400).json({ 
        error: `Transición no permitida de ${currentStatus} a ${newStatus}` 
      });
    }

    // 4. Actualización
    const updateData = { 
      status: newStatus,
      updatedAt: Date.now() 
    };

    // Si el pedido se marca como listo, podemos registrar quién o cuándo se hizo
    await orderRef.update(updateData);

    console.log(`✅ Pedido ${orderId} actualizado a ${newStatus}`);

    return res.status(200).json({ 
      success: true, 
      message: "Estado actualizado correctamente",
      status: newStatus 
    });
    
  } catch (error) {
    console.error("❌ Error al actualizar estado:", error);
    return res.status(500).json({ error: "Error interno", details: error.message });
  }
}

function getAllowedTransitions(current, deliveryType = "pickup") {
  const transitions = {
    'pending': ['accepted', 'rejected'],
    'accepted': ['preparing', 'cancelled'],
    'preparing': ['ready', 'cancelled'],
    'ready': deliveryType === 'delivery' ? ['on_the_way', 'cancelled'] : ['delivered', 'cancelled'],
    'on_the_way': ['delivered', 'cancelled']
  };
  return transitions[current] || [];
}
// Ejemplo de estructura en Node.js para tu API
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { orderId, newStatus, businessId } = req.body;

  try {
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    const orderData = orderDoc.data();
    const currentStatus = orderData.status;

    // ✅ CENTRALIZACIÓN: Las mismas reglas que tienes en tu app
    const allowed = getAllowedTransitions(currentStatus, orderData.deliveryType);
    
    if (!allowed.includes(newStatus)) {
      return res.status(400).json({ 
        error: `Transición no permitida de ${currentStatus} a ${newStatus}` 
      });
    }

    // Actualizar en Firestore
    await orderRef.update({ 
      status: newStatus,
      updatedAt: Date.now() 
    });

    return res.status(200).json({ success: true, status: newStatus });
    
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

// Fuente de verdad única en el servidor
function getAllowedTransitions(current, deliveryType) {
  const transitions = {
    'pending': ['accepted', 'rejected'],
    'accepted': ['preparing', 'cancelled'],
    'preparing': ['ready'],
    'ready': deliveryType === 'delivery' ? ['on_the_way'] : ['delivered'],
    'on_the_way': ['delivered']
  };
  return transitions[current] || [];
}
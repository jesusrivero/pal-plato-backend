import { db } from '../../firebaseAdmin.js';

export default async function handler(req, res) {
  try {
    const snapshot = await db.collection('businesses').limit(3).get();
    const businesses = snapshot.docs.map(doc => doc.data());

    res.status(200).json({ businesses });
  } catch (error) {
    console.error('Error en /test:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

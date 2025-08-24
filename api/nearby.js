import dotenv from "dotenv";
dotenv.config({ path: '.env.local' });

import express from "express";
import admin from "firebase-admin";
import { geohashQueryBounds, distanceBetween } from "geofire-common";

const router = express.Router();

// --- Inicializar Firebase Admin ---
try {
  if (!admin.apps.length) {
    console.log("Inicializando Firebase Admin...");
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
    console.log("Firebase Admin inicializado correctamente");
  }
} catch (e) {
  console.error("❌ Error al inicializar Firebase Admin:", e);
}

const db = admin.firestore();

// --- Función auxiliar para calcular distancia con mayor precisión ---
function calculatePreciseDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Radio de la Tierra en metros
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distancia en metros
}

// --- Función para ejecutar consulta por radio ---
async function executeGeoQuery(center, radiusKm, baseQuery) {
  const bounds = geohashQueryBounds(center, radiusKm * 1000);
  console.log(`📦 Ejecutando ${bounds.length} consultas geohash para el radio de ${radiusKm}km`);

  const snaps = await Promise.all(
    bounds.map((b, i) => {
      console.log(`🔍 Query [${i}] radio ${radiusKm}km: startAt(${b[0]}), endAt(${b[1]})`);
      return baseQuery.orderBy("geohash").startAt(b[0]).endAt(b[1]).get();
    })
  );

  return snaps;
}

// --- Función para procesar resultados con filtrado preciso ---
function processBusinessResults(snaps, center, radiusKm, category) {
  const radiusMeters = radiusKm * 1000;
  const map = new Map();
  let processedCount = 0;
  let withinRadiusCount = 0;

  for (const snap of snaps) {
    snap.forEach((doc) => {
      processedCount++;
      const data = doc.data();
      const bizLat = data.latitude;
      const bizLng = data.longitude;

      // Validar coordenadas
      if (typeof bizLat !== "number" || typeof bizLng !== "number") {
        console.warn(`⚠️ Coordenadas inválidas para ${doc.id}:`, { bizLat, bizLng });
        return;
      }

      // Calcular solo con la fórmula precisa de Haversine
      const distGeofire = distanceBetween(center, [bizLat, bizLng]);
      const distPrecise = calculatePreciseDistance(center[0], center[1], bizLat, bizLng);
      
      console.log(`🧮 Negocio: ${data.name}`);
      console.log(`   📏 Distancia Geofire: ${Math.round(distGeofire)}m`);
      console.log(`   📏 Distancia Precisa (Haversine): ${Math.round(distPrecise)}m`);
      
      // ⚠️ CORRECCIÓN CRÍTICA: Solo usar distancia Haversine
      const finalDistance = distPrecise;
      
      console.log(`   📏 Distancia Final (SOLO HAVERSINE): ${Math.round(finalDistance)}m`);
      console.log(`   🎯 Radio límite: ${radiusMeters}m`);
      
      if (finalDistance > radiusMeters) {
        console.log(`   ❌ RECHAZADO: ${Math.round(finalDistance)}m > ${radiusMeters}m`);
        return;
      }
      
      console.log(`   ✅ ACEPTADO: ${Math.round(finalDistance)}m ≤ ${radiusMeters}m`);
      withinRadiusCount++;

      // Filtrar por categoría si se especifica
      if (category) {
        const cats = Array.isArray(data.categories) ? data.categories : [];
        const match = cats.some(
          (c) => c?.name?.toLowerCase().trim() === category.toLowerCase().trim()
        );
        if (!match) {
          console.log(`🏷️ Negocio ${data.name} no coincide con categoría: ${category}`);
          return;
        }
      }

      // Solo agregar si no existe o si esta distancia es menor
      const existingBusiness = map.get(doc.id);
      if (!existingBusiness || finalDistance < existingBusiness.distanceMeters) {
        map.set(doc.id, {
          id: doc.id,
          name: data.name || "",
          description: data.description || "",
          direction: data.direction || "",
          phone: data.phone || "",
          isOpen: !!data.isOpen,
          hasDelivery: !!data.hasDelivery,
          deliveryPrice: parseFloat(data.deliveryPrice) || 0,
          logoUrl: data.logoUrl || null,
          latitude: bizLat,
          longitude: bizLng,
          geohash: data.geohash,
          bank: data.bank || "",
          phonePayment: data.phonePayment || "",
          idCardPayment: data.idCardPayment || "",
          categories: Array.isArray(data.categories) ? data.categories : [],
          distanceMeters: Math.round(finalDistance),
          // Información de debugging
          _debug: {
            geofireDistance: Math.round(distGeofire),
            haversineDistance: Math.round(distPrecise),
            finalDistance: Math.round(finalDistance)
          }
        });
      }
    });
  }




  
  console.log(`📊 Procesados: ${processedCount} docs, Dentro del radio: ${withinRadiusCount}, Únicos: ${map.size}`);
  return map;
}

// --- Healthcheck ---
router.get("/health", (req, res) => {
  console.log("✔️  Endpoint /health llamado");
  res.json({ ok: true });
});

// --- Endpoint Nearby Corregido ---
router.post("/nearby", async (req, res) => {
  try {
    console.log("📍 POST /nearby con body:", req.body);

    const { lat, lng, radiusKm = 10, hasDelivery, isOpen, category } = req.body;

    // Validación mejorada de coordenadas
    if (typeof lat !== "number" || typeof lng !== "number" || 
        lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      console.warn("⚠️ Coordenadas inválidas:", { lat, lng });
      return res.status(400).json({ 
        error: "lat y lng son obligatorios y deben ser números válidos (-90≤lat≤90, -180≤lng≤180)" 
      });
    }

    // Validación del radio
    if (radiusKm <= 0 || radiusKm > 100) {
      return res.status(400).json({ 
        error: "radiusKm debe estar entre 0 y 100" 
      });
    }

    const center = [lat, lng];
    console.log(`🎯 Buscando negocios en ${radiusKm}km desde [${lat}, ${lng}]`);

    // Construir consulta base con filtros
    let baseQuery = db.collection("businesses").where("state", "==", true);

    if (typeof hasDelivery === "boolean") {
      baseQuery = baseQuery.where("hasDelivery", "==", hasDelivery);
      console.log(`🚚 Filtro delivery: ${hasDelivery}`);
    }
    if (typeof isOpen === "boolean") {
      baseQuery = baseQuery.where("isOpen", "==", isOpen);
      console.log(`🕒 Filtro abierto: ${isOpen}`);
    }

    // ESTRATEGIA DE BÚSQUEDA CORREGIDA
    const startTime = Date.now();
    let allBusinesses = new Map();

    // Primera consulta: Radio solicitado + margen del 20% para compensar imprecisión del geohash
    const searchRadius = radiusKm * 1.2; // Margen del 20%
    console.log(`🔍 CONSULTA 1: Radio de búsqueda ${searchRadius.toFixed(1)}km (margen para geohash)`);
    const wideSnaps = await executeGeoQuery(center, searchRadius, baseQuery);
    const wideResults = processBusinessResults(wideSnaps, center, radiusKm, category);
    
    // Agregar resultados de consulta amplia
    wideResults.forEach((business, id) => {
      allBusinesses.set(id, business);
    });

    // Segunda consulta: Solo si el radio es mayor a 5km, usar un radio más conservador
    if (radiusKm > 5) {
      const conservativeRadius = radiusKm * 0.8; // 80% del radio original
      console.log(`🔍 CONSULTA 2: Radio conservador de ${conservativeRadius.toFixed(1)}km`);
      const narrowSnaps = await executeGeoQuery(center, conservativeRadius, baseQuery);
      const narrowResults = processBusinessResults(narrowSnaps, center, radiusKm, category);
      
      // Agregar/actualizar con resultados más precisos
      narrowResults.forEach((business, id) => {
        const existing = allBusinesses.get(id);
        if (!existing || business.distanceMeters <= existing.distanceMeters) {
          allBusinesses.set(id, business);
        }
      });
    }

    // Ordenar por distancia y aplicar filtro final estricto
    const beforeFinalFilter = allBusinesses.size;
    const result = Array.from(allBusinesses.values())
      .filter(business => {
        const withinRadius = business.distanceMeters <= radiusKm * 1000;
        if (!withinRadius) {
          console.log(`🚫 FILTRO FINAL: Eliminando ${business.name} (${business.distanceMeters}m > ${radiusKm * 1000}m)`);
        }
        return withinRadius;
      })
      .sort((a, b) => {
        // Ordenamiento primario: por distancia
        if (a.distanceMeters !== b.distanceMeters) {
          return a.distanceMeters - b.distanceMeters;
        }
        // Ordenamiento secundario: por nombre (alfabético)
        return a.name.localeCompare(b.name);
      });

    console.log(`🔍 Antes del filtro final: ${beforeFinalFilter} negocios`);
    console.log(`🔍 Después del filtro final: ${result.length} negocios`);

    const queryTime = Date.now() - startTime;
    
    console.log(`✅ Búsqueda completada en ${queryTime}ms`);
    console.log(`📊 Resultados finales: ${result.length} negocios`);
    
    if (result.length > 0) {
      if (result.length === 1) {
        console.log(`📏 1 negocio encontrado a ${result[0].distanceMeters}m de distancia`);
      } else {
        console.log(`📏 Rango de distancias: ${result[0].distanceMeters}m (más cercano) - ${result[result.length-1].distanceMeters}m (más lejano)`);
      }
    } else {
      console.log(`📏 No se encontraron negocios en el radio de ${radiusKm}km`);
    }

    // Remover información de debug en producción
    const cleanResult = result.map(business => {
      const { _debug, ...cleanBusiness } = business;
      return cleanBusiness;
    });

    res.json({ 
      businesses: cleanResult,
      meta: {
        totalFound: result.length,
        radiusKm: radiusKm,
        queryTimeMs: queryTime,
        center: { lat, lng }
      }
    });

  } catch (err) {
    console.error("🔥 Error en /api/nearby:", err);
    res.status(500).json({ 
      error: "Error interno del servidor",
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

export default router;
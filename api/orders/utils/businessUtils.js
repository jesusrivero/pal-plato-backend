/**
 * Determina si un negocio está abierto basándose en su horario y un interruptor manual.
 */
export function checkIfOpen(schedule, isManualClosed = false) {
    if (isManualClosed === true) return false;
    if (!Array.isArray(schedule) || schedule.length === 0) return false;

    // 1. Obtener fecha en Venezuela (UTC-4)
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

// Aquí podrías agregar más funciones a futuro, por ejemplo:
// export function calculateDeliveryTime(distance) { ... }
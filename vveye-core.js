// ==========================================
//   VVeye: THE EYE OF AI - CORE ENGINE v1.0
// ==========================================

const VVeye = {
    version: "1.0.0",
    status: "ACTIVE",

    // Funcția principală de validare
    validateProof: async function(photoBlob, missionData, gpsData) {
        console.log('[VVeye] Analiză intel începută...');

        // 1. Verificare Integritate (Mărime fișier)
        if (photoBlob.size < 50000) { 
            return { valid: false, reason: "IMAGINE_NECORĂ: VVeye cere dovezi clare." };
        }

        // 2. Verificare GPS (Senzorul de Realitate)
        if (!gpsData || !gpsData.lat) {
            return { valid: false, reason: "LIPSA_GPS: VVeye nu acceptă date fără locație." };
        }

        // 3. Verificare Distanță (Calcul distanță între Insider și Țintă)
        const dist = this.calculateDistance(gpsData.lat, gpsData.lng, missionData.lat, missionData.lng);
        console.log(`[VVeye] Distanța calculată: ${dist.toFixed(2)} km`);

        if (dist > 0.5) { // 500 metri marjă de eroare
            return { valid: false, reason: "DISTANȚĂ_PREA_MARE: Te-am reperat, ești prea departe." };
        }

        return { valid: true, reason: "INTEL_VERIFICAT: ✓ Scos la lumină de VVeye." };
    },

    // Motorul matematic al VVeye
    calculateDistance: function(lat1, lon1, lat2, lon2) {
        const R = 6371; // Raza pământului
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }
};

console.log('👁️ VVeye: The Eye of AI has been initialized.');

package ru.sputnik.field.data.spk

import kotlin.math.*

/**
 * Преобразования координат: WGS-84 ↔ DMS, WGS-84 → МСК-86 (зоны 3, 4).
 *
 * МСК-86 — местная система координат для ЯНАО, основана на эллипсоиде Красовского
 * (СК-42 / Pulkovo 1942), проекция Гаусса-Крюгера. Зона 3: центральный меридиан
 * 70°30', false easting 3 300 000 м. Зона 4: 73°30', false easting 4 300 000 м.
 */
object CoordTransform {

    // ── DMS форматирование ─────────────────────────────────
    fun toDmsLat(dd: Double): String = toDmsCore(dd, true)
    fun toDmsLng(dd: Double): String = toDmsCore(dd, false)

    private fun toDmsCore(dd: Double, isLat: Boolean): String {
        val d = abs(dd).toInt()
        val mTotal = (abs(dd) - d) * 60
        val m = mTotal.toInt()
        val s = (mTotal - m) * 60
        val dir = if (isLat) (if (dd >= 0) "N" else "S") else (if (dd >= 0) "E" else "W")
        return "%d°%02d'%05.2f\"%s".format(d, m, s, dir)
    }

    // ── МСК-86 преобразование ──────────────────────────────
    data class Mck86(val north: Double, val east: Double)

    /** Параметры Helmert: WGS-84 → СК-42 (по ГОСТ 51794-2008, упрощённая модель). */
    private const val DX = 23.92; private const val DY = -141.27; private const val DZ = -80.9
    private const val WX_AS = 0.0; private const val WY_AS = -0.35; private const val WZ_AS = -0.82  // arc-sec
    private const val SCALE_PPM = -0.12

    // Эллипсоид Красовского (СК-42)
    private const val A_K = 6378245.0
    private const val F_K = 1.0 / 298.3
    // Эллипсоид WGS-84
    private const val A_W = 6378137.0
    private const val F_W = 1.0 / 298.257223563

    fun wgs84ToMsk86(latDeg: Double, lngDeg: Double, zone: Int): Mck86 {
        require(zone == 3 || zone == 4) { "МСК-86 поддерживает только зоны 3 и 4" }
        val centralMeridianDeg = if (zone == 3) 70.5 else 73.5
        val falseEasting = if (zone == 3) 3_300_000.0 else 4_300_000.0

        // 1) WGS-84 (lat,lng) → ECEF
        val (x1, y1, z1) = llhToEcef(Math.toRadians(latDeg), Math.toRadians(lngDeg), 0.0, A_W, F_W)

        // 2) Helmert WGS-84 → СК-42
        val wx = Math.toRadians(WX_AS / 3600.0)
        val wy = Math.toRadians(WY_AS / 3600.0)
        val wz = Math.toRadians(WZ_AS / 3600.0)
        val s = SCALE_PPM * 1e-6
        val x2 = DX + (1 + s) * (x1 + wz * y1 - wy * z1)
        val y2 = DY + (1 + s) * (-wz * x1 + y1 + wx * z1)
        val z2 = DZ + (1 + s) * (wy * x1 - wx * y1 + z1)

        // 3) ECEF (Krasovsky) → lat,lng
        val (latK, lngK) = ecefToLlh(x2, y2, z2, A_K, F_K)

        // 4) Гаусса-Крюгер вперёд (на эллипсоиде Красовского)
        return gaussKruger(latK, lngK, Math.toRadians(centralMeridianDeg), falseEasting)
    }

    private fun llhToEcef(lat: Double, lng: Double, h: Double, a: Double, f: Double): Triple<Double, Double, Double> {
        val e2 = 2 * f - f * f
        val n = a / sqrt(1 - e2 * sin(lat).pow(2))
        val x = (n + h) * cos(lat) * cos(lng)
        val y = (n + h) * cos(lat) * sin(lng)
        val z = (n * (1 - e2) + h) * sin(lat)
        return Triple(x, y, z)
    }

    /** Bowring-итеративная инверсия ECEF → широта/долгота. */
    private fun ecefToLlh(x: Double, y: Double, z: Double, a: Double, f: Double): Pair<Double, Double> {
        val e2 = 2 * f - f * f
        val p = sqrt(x * x + y * y)
        val lng = atan2(y, x)
        var lat = atan2(z, p * (1 - e2))
        repeat(8) {
            val n = a / sqrt(1 - e2 * sin(lat).pow(2))
            lat = atan2(z + e2 * n * sin(lat), p)
        }
        return lat to lng
    }

    /**
     * Гаусса-Крюгера прямая на эллипсоиде Красовского, ряд 6-го порядка.
     * Возвращает (north, east) в метрах.
     */
    private fun gaussKruger(lat: Double, lng: Double, lng0: Double, falseEasting: Double): Mck86 {
        val a = A_K
        val e2 = 2 * F_K - F_K * F_K
        val ePrime2 = e2 / (1 - e2)
        val n = a / sqrt(1 - e2 * sin(lat).pow(2))
        val t = tan(lat)
        val eta2 = ePrime2 * cos(lat).pow(2)
        val l = lng - lng0
        val cosL = cos(lat)

        // Длина дуги меридиана от экватора (СК-42, ряд)
        val m0 = a * (1 - e2)
        val a0 = 1 + 3.0/4*e2 + 45.0/64*e2.pow(2) + 175.0/256*e2.pow(3) + 11025.0/16384*e2.pow(4)
        val a2 = 3.0/4*e2 + 15.0/16*e2.pow(2) + 525.0/512*e2.pow(3) + 2205.0/2048*e2.pow(4)
        val a4 = 15.0/64*e2.pow(2) + 105.0/256*e2.pow(3) + 2205.0/4096*e2.pow(4)
        val a6 = 35.0/512*e2.pow(3) + 315.0/2048*e2.pow(4)
        val arc = m0 * (a0*lat - a2/2*sin(2*lat) + a4/4*sin(4*lat) - a6/6*sin(6*lat))

        // Север (X в МСК-86 = Northing)
        val north = arc +
            n/2 * sin(lat) * cosL.pow(2) * l.pow(2) +
            n/24 * sin(lat) * cosL.pow(3) * (5 - t.pow(2) + 9*eta2 + 4*eta2.pow(2)) * l.pow(4) +
            n/720 * sin(lat) * cosL.pow(5) * (61 - 58*t.pow(2) + t.pow(4) + 270*eta2 - 330*t.pow(2)*eta2) * l.pow(6)

        // Восток (Y в МСК-86 = Easting), c false easting
        val east = falseEasting +
            n * cosL * l +
            n/6 * cosL.pow(3) * (1 - t.pow(2) + eta2) * l.pow(3) +
            n/120 * cosL.pow(5) * (5 - 18*t.pow(2) + t.pow(4) + 14*eta2 - 58*t.pow(2)*eta2) * l.pow(5)

        return Mck86(north, east)
    }
}

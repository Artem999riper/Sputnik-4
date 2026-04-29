# ═══════════════════════════════════════════════════════════
# dem_export.py — генерация DXF R12 из ArcticDEM
# Запускается из OSGeo4W Python: python dem_export.py <params.json>
# Выходной DXF R12 — максимальная совместимость AutoCAD/Robur
#
# ИСПРАВЛЕНИЕ: имена слоёв только Latin (AutoCAD R12 не читает UTF-8),
#              файл записывается в cp1252 (Windows ANSI),
#              окончания строк CRLF, после EOF — перевод строки.
# ═══════════════════════════════════════════════════════════

import sys, os, json, math, random
from osgeo import gdal, ogr, osr

# ── Имена слоёв (только ASCII — R12 не поддерживает UTF-8) ─
LAYER_CONTOURS = 'GORIZONTALI'   # горизонтали
LAYER_LABELS   = 'PODPISI'       # подписи высот
LAYER_POINTS   = 'TOCHKI_VYSOT'  # точки сетки высот

def run(params_file):
    with open(params_file, 'r', encoding='utf-8') as f:
        p = json.load(f)

    contours_gpkg = p['contours_gpkg']   # горизонтали
    reproj_tif    = p['reproj_tif']       # перепроецированный растр
    output_dxf    = p['output_dxf']       # выходной DXF
    interval      = float(p.get('interval', 2))
    grid_step_m   = float(p.get('grid_step_m', 20))  # шаг в метрах
    label_step    = interval * 2          # каждая вторая горизонталь
    text_height   = float(p.get('text_height', 5))
    # Разброс положения точек в плане (имитация ручного полевого съёма)
    # jitter_min_m — минимальное смещение (мёртвая зона: точки не ближе этого к узлу сетки)
    # jitter_max_m — максимальное смещение (точки не дальше этого от узла сетки)
    # Если оба = 0 → строгая сетка
    jitter_min_m  = float(p.get('jitter_min_m', 0))
    jitter_max_m  = float(p.get('jitter_max_m', 0))

    print(f"[PY] contours: {contours_gpkg}")
    print(f"[PY] raster:   {reproj_tif}")
    print(f"[PY] output:   {output_dxf}")
    print(f"[PY] interval={interval}m, grid={grid_step_m}m, label_step={label_step}m, jitter={jitter_min_m}..{jitter_max_m}m")
    print(f"[PY] Layers: {LAYER_CONTOURS}, {LAYER_LABELS}, {LAYER_POINTS}")

    # ── DXF R12 writer ────────────────────────────────────
    # Используем список строк и записываем через CRLF
    lines = []

    def g(code, val):
        # Группа: код (выравнен вправо до 3 символов) + значение
        lines.append(f"{str(code).rjust(3)}")
        lines.append(str(val))

    # HEADER
    g(0,'SECTION'); g(2,'HEADER')
    g(9,'$ACADVER'); g(1,'AC1009')       # R12 — максимальная совместимость
    g(9,'$INSUNITS'); g(70,6)             # метры
    g(9,'$TEXTSIZE'); g(40,text_height)
    g(0,'ENDSEC')

    # TABLES
    g(0,'SECTION'); g(2,'TABLES')

    g(0,'TABLE'); g(2,'LTYPE'); g(70,1)
    g(0,'LTYPE'); g(2,'CONTINUOUS'); g(70,64)
    g(3,'Solid line'); g(72,65); g(73,0); g(40,0.0)
    g(0,'ENDTAB')

    g(0,'TABLE'); g(2,'LAYER'); g(70,3)
    for name, color in [(LAYER_CONTOURS,5),(LAYER_LABELS,2),(LAYER_POINTS,3)]:
        g(0,'LAYER'); g(2,name); g(70,0); g(62,color); g(6,'CONTINUOUS')
    g(0,'ENDTAB')

    g(0,'TABLE'); g(2,'STYLE'); g(70,1)
    g(0,'STYLE'); g(2,'STANDARD'); g(70,0); g(40,0); g(41,1.0)
    g(50,0); g(71,0); g(42,text_height); g(3,'txt'); g(4,'')
    g(0,'ENDTAB')

    g(0,'ENDSEC')

    # ENTITIES
    g(0,'SECTION'); g(2,'ENTITIES')

    # ── Горизонтали ────────────────────────────────────────
    ds_contours = ogr.Open(contours_gpkg)
    if ds_contours is None:
        raise RuntimeError(f"Не удалось открыть {contours_gpkg}")

    lyr = ds_contours.GetLayer(0)
    feat_count = lyr.GetFeatureCount()
    print(f"[PY] Contour features: {feat_count}")

    label_count = 0
    for feat in lyr:
        elev = feat.GetField('elevation')
        if elev is None:
            continue
        elev = float(elev)
        geom = feat.GetGeometryRef()
        if geom is None:
            continue

        # Поддержка LineString и MultiLineString
        gt = geom.GetGeometryType()
        if gt in (ogr.wkbLineString, ogr.wkbLineString25D,
                  ogr.wkbLineStringM, ogr.wkbLineStringZM):
            sub_geoms = [geom]
        elif gt in (ogr.wkbMultiLineString, ogr.wkbMultiLineString25D):
            sub_geoms = [geom.GetGeometryRef(i) for i in range(geom.GetGeometryCount())]
        else:
            continue

        for sg in sub_geoms:
            n = sg.GetPointCount()
            if n < 2:
                continue
            pts = [(sg.GetX(i), sg.GetY(i), sg.GetZ(i) if sg.Is3D() else elev)
                   for i in range(n)]

            # LINE сегменты
            for i in range(n - 1):
                x1,y1,z1 = pts[i]
                x2,y2,z2 = pts[i+1]
                g(0,'LINE')
                g(8,LAYER_CONTOURS); g(62,5)
                g(10,f"{x1:.3f}"); g(20,f"{y1:.3f}"); g(30,f"{z1:.3f}")
                g(11,f"{x2:.3f}"); g(21,f"{y2:.3f}"); g(31,f"{z2:.3f}")

            # Подпись каждой второй горизонтали
            elev_r = round(elev)
            if elev_r % round(label_step) == 0:
                mid = pts[len(pts)//2]
                p1  = pts[max(0, len(pts)//2 - 1)]
                p2  = pts[min(len(pts)-1, len(pts)//2 + 1)]
                ang = math.degrees(math.atan2(p2[1]-p1[1], p2[0]-p1[0]))
                mx, my, mz = mid
                g(0,'TEXT')
                g(8,LAYER_LABELS); g(62,2)
                g(10,f"{mx:.3f}"); g(20,f"{my:.3f}"); g(30,f"{mz:.3f}")
                g(40,f"{text_height:.3f}")
                g(1,str(elev_r))
                g(50,f"{ang:.1f}")
                g(72,1)   # центрирование
                g(11,f"{mx:.3f}"); g(21,f"{my:.3f}"); g(31,f"{mz:.3f}")
                label_count += 1

    ds_contours = None
    print(f"[PY] Labels written: {label_count}")

    # ── Точки сетки высот ─────────────────────────────────
    point_count = 0
    if grid_step_m > 0:
        ds_raster = gdal.Open(reproj_tif)
        if ds_raster:
            band = ds_raster.GetRasterBand(1)
            gt_r = ds_raster.GetGeoTransform()
            nodata = band.GetNoDataValue()
            pix_w = abs(gt_r[1])   # размер пикселя X в единицах СК
            pix_h = abs(gt_r[5])   # размер пикселя Y

            xsize = ds_raster.RasterXSize
            ysize = ds_raster.RasterYSize

            # Определяем единицы СК: градусы или метры
            # Получаем WKT проекции растра и проверяем IsGeographic
            srs_wkt = ds_raster.GetProjection()
            srs_obj = osr.SpatialReference()
            srs_obj.ImportFromWkt(srs_wkt)
            is_geographic = bool(srs_obj.IsGeographic())

            if is_geographic:
                # СК в градусах (WGS84 EPSG:4326, ГСК-2011 EPSG:4326 и т.п.)
                # Пересчитываем шаг в градусы через масштаб меридиана
                # 1° широты ≈ 111320 м; 1° долготы = 111320 * cos(lat) м
                center_lat = ds_raster.GetGeoTransform()[3] + ysize * ds_raster.GetGeoTransform()[5] / 2
                m_per_deg_lat = 111320.0
                m_per_deg_lon = 111320.0 * math.cos(math.radians(abs(center_lat)))
                step_px_x = max(1, int(round(grid_step_m / (pix_w * m_per_deg_lon))))
                step_px_y = max(1, int(round(grid_step_m / (pix_h * m_per_deg_lat))))
                print(f"[PY] Geographic SRS: 1deg_lon={m_per_deg_lon:.0f}m, 1deg_lat={m_per_deg_lat:.0f}m")
            else:
                # СК в метрах (МСК, СК-42, WGS84/UTM и т.п.)
                step_px_x = max(1, int(round(grid_step_m / pix_w)))
                step_px_y = max(1, int(round(grid_step_m / pix_h)))

            print(f"[PY] Grid: {xsize}x{ysize} px, step={step_px_x}x{step_px_y} px, is_geo={is_geographic}")
            print(f"[PY] Pixel size: {pix_w:.8f} x {pix_h:.8f} units/px")

            th_sm = text_height * 0.45
            off   = text_height * 0.4

            for row in range(0, ysize, step_px_y):
                for col in range(0, xsize, step_px_x):
                    arr = band.ReadAsArray(col, row, 1, 1)
                    if arr is None:
                        continue
                    z = float(arr[0, 0])
                    if nodata is not None and abs(z - nodata) < 1e-6:
                        continue
                    if z < -9000:
                        continue
                    # Координаты центра пикселя
                    x = gt_r[0] + (col + 0.5) * gt_r[1] + (row + 0.5) * gt_r[2]
                    y = gt_r[3] + (col + 0.5) * gt_r[4] + (row + 0.5) * gt_r[5]

                    # Разброс в плане с мёртвой зоной — имитация ручного полевого съёма
                    # Точка смещается на расстояние от jitter_min_m до jitter_max_m
                    # в случайном направлении (равномерно по углу).
                    # Мёртвая зона: если min > 0, точки никогда не остаются строго на узле сетки.
                    if jitter_max_m > 0:
                        j_min = min(jitter_min_m, jitter_max_m)
                        j_max = jitter_max_m
                        # Случайный радиус в диапазоне [j_min, j_max]
                        radius = random.uniform(j_min, j_max)
                        # Случайный угол — равномерно по всем направлениям
                        angle  = random.uniform(0, 2 * math.pi)
                        x += radius * math.cos(angle)
                        y += radius * math.sin(angle)

                    g(0,'POINT')
                    g(8,LAYER_POINTS); g(62,3)
                    g(10,f"{x:.3f}"); g(20,f"{y:.3f}"); g(30,f"{z:.3f}")

                    g(0,'TEXT')
                    g(8,LAYER_POINTS); g(62,3)
                    g(10,f"{x+off:.3f}"); g(20,f"{y+off:.3f}"); g(30,f"{z:.3f}")
                    g(40,f"{th_sm:.3f}")
                    g(1,f"{z:.2f}")
                    g(72,0); g(73,1)
                    g(11,f"{x+off:.3f}"); g(21,f"{y+off:.3f}"); g(31,f"{z:.3f}")
                    point_count += 1

            ds_raster = None
        print(f"[PY] Grid points written: {point_count}")

    g(0,'ENDSEC')
    g(0,'EOF')

    # ── Записываем DXF ────────────────────────────────────
    # ВАЖНО: кодировка cp1252 (Windows ANSI), окончания строк CRLF
    # AutoCAD R12 не поддерживает UTF-8 — только ASCII/cp1252
    dxf_text = '\r\n'.join(lines) + '\r\n'

    with open(output_dxf, 'w', encoding='cp1252', errors='replace', newline='') as f:
        f.write(dxf_text)

    size = os.path.getsize(output_dxf)
    print(f"[PY] DXF written: {output_dxf} ({size} bytes)")
    print(f"[PY] DONE: {feat_count} contours, {label_count} labels, {point_count} grid points")
    return True

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python dem_export.py params.json")
        sys.exit(1)
    try:
        run(sys.argv[1])
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

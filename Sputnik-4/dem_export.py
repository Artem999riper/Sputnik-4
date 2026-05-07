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

def _dist_point_to_segment(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx*dx + dy*dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (ax + t*dx), py - (ay + t*dy))

def _dist_to_route(px, py, route_pts):
    return min(_dist_point_to_segment(px, py, route_pts[i][0], route_pts[i][1],
                                      route_pts[i+1][0], route_pts[i+1][1])
               for i in range(len(route_pts) - 1))

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
    jitter_min_m  = float(p.get('jitter_min_m', 0))
    jitter_max_m  = float(p.get('jitter_max_m', 0))
    route_points_wgs = p.get('route_points')  # [{lat, lng}, ...] или None
    buffer_m      = float(p.get('buffer_m') or 50)
    route_bearing = p.get('route_bearing')  # градусы от севера, может быть None

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
            pix_w = abs(gt_r[1])
            pix_h = abs(gt_r[5])
            xsize = ds_raster.RasterXSize
            ysize = ds_raster.RasterYSize

            srs_wkt = ds_raster.GetProjection()
            srs_obj = osr.SpatialReference()
            srs_obj.ImportFromWkt(srs_wkt)
            is_geographic = bool(srs_obj.IsGeographic())

            th_sm = text_height * 0.45
            off   = text_height * 0.4

            def sample_at(x, y):
                """Вернуть высоту в точке (x,y) в единицах СК, или None."""
                col = int((x - gt_r[0]) / gt_r[1])
                row = int((y - gt_r[3]) / gt_r[5])
                if col < 0 or row < 0 or col >= xsize or row >= ysize:
                    return None
                arr = band.ReadAsArray(col, row, 1, 1)
                if arr is None:
                    return None
                z = float(arr[0, 0])
                if nodata is not None and abs(z - nodata) < 1e-6:
                    return None
                if z < -9000:
                    return None
                return z

            def write_point(x, y, z):
                if jitter_max_m > 0:
                    radius = random.uniform(min(jitter_min_m, jitter_max_m), jitter_max_m)
                    angle  = random.uniform(0, 2 * math.pi)
                    x += radius * math.cos(angle)
                    y += radius * math.sin(angle)
                g(0,'POINT')
                g(8,LAYER_POINTS); g(62,3)
                g(10,f"{x:.3f}"); g(20,f"{y:.3f}"); g(30,f"{z:.3f}")
                g(0,'TEXT')
                g(8,LAYER_POINTS); g(62,3)
                g(10,f"{x+off:.3f}"); g(20,f"{y+off:.3f}"); g(30,f"{z:.3f}")
                g(40,f"{th_sm:.3f}"); g(1,f"{z:.2f}"); g(72,0); g(73,1)
                g(11,f"{x+off:.3f}"); g(21,f"{y+off:.3f}"); g(31,f"{z:.3f}")

            # ── Режим трассы: повёрнутая сетка ────────────────
            if route_points_wgs and len(route_points_wgs) >= 2:
                # Трансформация WGS84 → целевая СК
                src_srs = osr.SpatialReference()
                src_srs.ImportFromEPSG(4326)
                src_srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
                tgt_srs = osr.SpatialReference()
                tgt_srs.ImportFromWkt(srs_wkt)
                tgt_srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
                ct = osr.CoordinateTransformation(src_srs, tgt_srs)

                route_proj = []
                for pt in route_points_wgs:
                    lng, lat = float(pt['lng']), float(pt['lat'])
                    try:
                        tx, ty, _ = ct.TransformPoint(lng, lat)
                        route_proj.append((tx, ty))
                    except Exception:
                        pass

                if len(route_proj) < 2:
                    print("[PY] Route transform failed, fallback to normal grid")
                    route_proj = None
                else:
                    # В единицах СК может быть географическая (градусы) — пересчитываем buffer_m
                    if is_geographic:
                        center_lat_r = math.radians(abs(sum(pt['lat'] for pt in route_points_wgs) / len(route_points_wgs)))
                        m_per_unit_x = 111320.0 * math.cos(center_lat_r)
                        m_per_unit_y = 111320.0
                        buf_x = buffer_m / m_per_unit_x
                        buf_y = buffer_m / m_per_unit_y
                        step_x = grid_step_m / m_per_unit_x
                        step_y = grid_step_m / m_per_unit_y
                        eff_buffer = buf_y  # в единицах СК (градусы)
                        eff_step = step_y
                    else:
                        buf_x = buf_y = buffer_m
                        step_x = step_y = grid_step_m
                        eff_buffer = buffer_m
                        eff_step = grid_step_m

                    # Угол поворота из bearing (от севера по часовой → в системе СК)
                    # bearing 0° = север = +Y; bearing 90° = восток = +X
                    # В декартовой системе: вектор = (sin(bearing), cos(bearing))
                    if route_bearing is not None:
                        theta = math.radians(float(route_bearing))
                    else:
                        # bearing по первой и последней точке трассы в проецированных координатах
                        dx_r = route_proj[-1][0] - route_proj[0][0]
                        dy_r = route_proj[-1][1] - route_proj[0][1]
                        theta = math.atan2(dx_r, dy_r)  # угол от +Y (севера)

                    sin_t, cos_t = math.sin(theta), math.cos(theta)
                    # Вдоль трассы: (sin_t, cos_t); поперёк: (cos_t, -sin_t)

                    # Центр трассы
                    cx = sum(rp[0] for rp in route_proj) / len(route_proj)
                    cy = sum(rp[1] for rp in route_proj) / len(route_proj)

                    # Проекции точек трассы на ось «вдоль трассы»
                    u_vals_route = [(rp[0] - cx)*sin_t + (rp[1] - cy)*cos_t for rp in route_proj]
                    u_min = min(u_vals_route) - eff_buffer
                    u_max = max(u_vals_route) + eff_buffer

                    u_range = u_min
                    while u_range <= u_max:
                        v_range = -eff_buffer
                        while v_range <= eff_buffer:
                            # Повёрнутые координаты → проецированные
                            x = cx + u_range * sin_t + v_range * cos_t
                            y = cy + u_range * cos_t - v_range * sin_t
                            # Проверка: в пределах буфера от трассы
                            d = _dist_to_route(x, y, route_proj)
                            if d <= eff_buffer * 1.01:
                                z = sample_at(x, y)
                                if z is not None:
                                    write_point(x, y, z)
                                    point_count += 1
                            v_range += eff_step
                        u_range += eff_step

                    ds_raster = None
                    print(f"[PY] Route grid points written: {point_count}")
                    # route_proj not None → skip normal grid below
                    route_proj = True  # sentinel

            else:
                route_proj = None

            # ── Обычная сетка (север вверх) ───────────────────
            if not route_proj:
                if is_geographic:
                    center_lat = gt_r[3] + ysize * gt_r[5] / 2
                    m_per_deg_lat = 111320.0
                    m_per_deg_lon = 111320.0 * math.cos(math.radians(abs(center_lat)))
                    step_px_x = max(1, int(round(grid_step_m / (pix_w * m_per_deg_lon))))
                    step_px_y = max(1, int(round(grid_step_m / (pix_h * m_per_deg_lat))))
                    print(f"[PY] Geographic SRS: 1deg_lon={m_per_deg_lon:.0f}m, 1deg_lat={m_per_deg_lat:.0f}m")
                else:
                    step_px_x = max(1, int(round(grid_step_m / pix_w)))
                    step_px_y = max(1, int(round(grid_step_m / pix_h)))

                print(f"[PY] Grid: {xsize}x{ysize} px, step={step_px_x}x{step_px_y} px, is_geo={is_geographic}")

                for row in range(0, ysize, step_px_y):
                    for col in range(0, xsize, step_px_x):
                        z = sample_at(
                            gt_r[0] + (col + 0.5) * gt_r[1] + (row + 0.5) * gt_r[2],
                            gt_r[3] + (col + 0.5) * gt_r[4] + (row + 0.5) * gt_r[5],
                        )
                        if z is None:
                            continue
                        x = gt_r[0] + (col + 0.5) * gt_r[1] + (row + 0.5) * gt_r[2]
                        y = gt_r[3] + (col + 0.5) * gt_r[4] + (row + 0.5) * gt_r[5]
                        write_point(x, y, z)
                        point_count += 1

                if ds_raster:
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

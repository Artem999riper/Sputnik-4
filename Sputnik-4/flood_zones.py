#!/usr/bin/env python3
"""
flood_zones.py — зоны затопления по рельефу ArcticDEM.

Вход (params.json):
  dem_tif         — растр высот в WGS-84, высоты в БСВ-77
  bbox            — {minLat, maxLat, minLng, maxLng}
  clip            — GeoJSON-полигон области расчёта ([lng, lat]) или null (весь bbox)
  level           — отметка уровня воды, м (БСВ-77)
  min_area        — не выводить зоны меньше, м²
  water_as_flood  — пиксели без данных (водоёмы) считать затопленными
  connected_only  — оставить только зоны, связанные с водоёмом или с краем области
                    (замкнутые понижения внутри области отбрасываются)
  out_geojson     — куда записать результат (WGS-84)

Расчёт идёт в метрической проекции (поперечный Меркатор с осевым меридианом по центру
области): пиксели квадратные, площади — в м². Затоплено всё, что ниже отметки
(модель «ванны»). Каждая зона — связная (8 соседей) область; в свойствах — площадь,
наибольшая и средняя глубина.
"""
import sys, json, math
from osgeo import gdal, ogr, osr
import numpy as np

gdal.UseExceptions()
ogr.UseExceptions()
osr.UseExceptions()

MAX_PIXELS = 16_000_000     # предел размера растра расчёта (≈ 4000 × 4000)
MAX_ZONES = 5000            # больше зон в ответ не отдаём (самые крупные)


def _srs(wkt_or_proj4, is_proj4=False):
    s = osr.SpatialReference()
    if is_proj4:
        s.ImportFromProj4(wkt_or_proj4)
    else:
        s.ImportFromEPSG(wkt_or_proj4)
    if hasattr(s, 'SetAxisMappingStrategy'):
        s.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)   # всегда lng, lat
    return s


def main(params_file):
    with open(params_file, 'r', encoding='utf-8') as f:
        p = json.load(f)
    level = float(p['level'])
    min_area = max(0.0, float(p.get('min_area', 100) or 0))
    water_as_flood = bool(p.get('water_as_flood', True))
    connected_only = bool(p.get('connected_only', False))
    b = p['bbox']
    clip = p.get('clip')

    lat0 = (b['minLat'] + b['maxLat']) / 2
    lon0 = (b['minLng'] + b['maxLng']) / 2
    wgs = _srs(4326)
    srs_m = _srs(f'+proj=tmerc +lat_0=0 +lon_0={lon0:.6f} +k=1 +x_0=500000 +y_0=0 '
                 f'+ellps=WGS84 +units=m +no_defs', is_proj4=True)
    to_m = osr.CoordinateTransformation(wgs, srs_m)
    to_wgs = osr.CoordinateTransformation(srs_m, wgs)

    # Граница расчёта в метрах: полигон или прямоугольник bbox
    if clip and clip.get('type') == 'Polygon':
        area_geom = ogr.CreateGeometryFromJson(json.dumps(clip))
    else:
        ring = [[b['minLng'], b['minLat']], [b['maxLng'], b['minLat']], [b['maxLng'], b['maxLat']],
                [b['minLng'], b['maxLat']], [b['minLng'], b['minLat']]]
        area_geom = ogr.CreateGeometryFromJson(json.dumps({'type': 'Polygon', 'coordinates': [ring]}))
    area_geom.Transform(to_m)
    if not area_geom.IsValid():
        area_geom = area_geom.Buffer(0)
    minx, maxx, miny, maxy = area_geom.GetEnvelope()

    # Размер пикселя: не мельче 2 м (разрешение ArcticDEM) и не больше MAX_PIXELS
    w_m, h_m = maxx - minx, maxy - miny
    res = max(2.0, math.sqrt(max(w_m * h_m, 1.0) / MAX_PIXELS))
    res = math.ceil(res * 10) / 10
    pad = res * 2
    bounds = (minx - pad, miny - pad, maxx + pad, maxy + pad)

    ds = gdal.Warp('', p['dem_tif'], options=gdal.WarpOptions(
        format='MEM', dstSRS=srs_m.ExportToWkt(), outputBounds=bounds,
        xRes=res, yRes=res, resampleAlg='bilinear', dstNodata=-9999, targetAlignedPixels=True))
    band = ds.GetRasterBand(1)
    raw_nodata = band.ReadAsArray() <= -9990          # водоёмы до заполнения пропусков
    # Мелкие пропуски ArcticDEM (до ~200 м) заполняем, как при выгрузке горизонталей
    try:
        gdal.FillNodata(band, None, max(5, int(200 / res)), 0)
    except Exception:
        pass
    dem = band.ReadAsArray().astype(np.float32)
    rows, cols = dem.shape
    gt = ds.GetGeoTransform()
    nodata = dem <= -9990

    # Маска «внутри области расчёта»
    mem = ogr.GetDriverByName('Memory').CreateDataSource('area')
    lyr = mem.CreateLayer('area', srs_m, ogr.wkbPolygon)
    ft = ogr.Feature(lyr.GetLayerDefn()); ft.SetGeometry(area_geom); lyr.CreateFeature(ft); ft = None
    ins_ds = gdal.GetDriverByName('MEM').Create('', cols, rows, 1, gdal.GDT_Byte)
    ins_ds.SetGeoTransform(gt); ins_ds.SetProjection(srs_m.ExportToWkt())
    gdal.RasterizeLayer(ins_ds, [1], lyr, burn_values=[1])
    inside = ins_ds.GetRasterBand(1).ReadAsArray().astype(bool)

    valid = inside & ~nodata
    water = inside & nodata
    # «Источник воды» для связности: водоёмы (пропуски ArcticDEM) и край области —
    # через край в область заходит река/залив, который сам в область не попал
    edge = np.zeros_like(inside)
    edge[1:, :] |= inside[1:, :] & ~inside[:-1, :]; edge[:-1, :] |= inside[:-1, :] & ~inside[1:, :]
    edge[:, 1:] |= inside[:, 1:] & ~inside[:, :-1]; edge[:, :-1] |= inside[:, :-1] & ~inside[:, 1:]
    edge[0, :] |= inside[0, :]; edge[-1, :] |= inside[-1, :]; edge[:, 0] |= inside[:, 0]; edge[:, -1] |= inside[:, -1]
    source = (inside & raw_nodata) | edge
    # Уровень воды: ровная отметка или с уклоном вдоль оси реки (levels = [в начале, в конце]):
    # для каждой ячейки — пикетаж её проекции на ось, уровень — линейно между отметками
    W = np.full(dem.shape, level, dtype=np.float64)
    axis, levels = p.get('axis'), p.get('levels')
    if axis and levels and len(axis) >= 2:
        ax = []
        for lng, lat in axis:
            q = to_m.TransformPoint(lng, lat); ax.append((q[0], q[1]))
        seg_len = [math.hypot(ax[i + 1][0] - ax[i][0], ax[i + 1][1] - ax[i][1]) for i in range(len(ax) - 1)]
        total = sum(seg_len) or 1.0
        xs = gt[0] + (np.arange(cols) + 0.5) * gt[1]; ys = gt[3] + (np.arange(rows) + 0.5) * gt[5]
        X, Y = np.meshgrid(xs, ys)
        best = np.full(dem.shape, np.inf); chain = np.zeros(dem.shape)
        acc = 0.0
        for i, L in enumerate(seg_len):
            (x1, y1), (x2, y2) = ax[i], ax[i + 1]
            if L <= 0:
                continue
            t = np.clip(((X - x1) * (x2 - x1) + (Y - y1) * (y2 - y1)) / (L * L), 0, 1)
            dd = np.hypot(X - (x1 + t * (x2 - x1)), Y - (y1 + t * (y2 - y1)))
            m = dd < best
            best[m] = dd[m]; chain[m] = acc + t[m] * L
            acc += L
        l0, l1 = float(levels[0]), float(levels[1])
        W = l0 + (l1 - l0) * chain / total
        level = max(l0, l1)
    flood = valid & (dem <= W)
    depth = W - dem
    if water_as_flood:
        flood |= water

    stats = {
        'level': level, 'res': res, 'levels': [float(x) for x in levels] if (axis and levels) else None,
        'dem_min': float(dem[valid].min()) if valid.any() else None,
        'dem_max': float(dem[valid].max()) if valid.any() else None,
        'water_pct': round(100.0 * water.sum() / max(1, inside.sum()), 1),
        'area_total_m2': float(inside.sum()) * res * res,
    }

    # Векторизация: каждая связная область маски — отдельный полигон
    fl_ds = gdal.GetDriverByName('MEM').Create('', cols, rows, 1, gdal.GDT_Byte)
    fl_ds.SetGeoTransform(gt); fl_ds.SetProjection(srs_m.ExportToWkt())
    fb = fl_ds.GetRasterBand(1); fb.WriteArray(flood.astype(np.uint8))
    vds = ogr.GetDriverByName('Memory').CreateDataSource('flood')
    vl = vds.CreateLayer('flood', srs_m, ogr.wkbPolygon)
    vl.CreateField(ogr.FieldDefn('DN', ogr.OFTInteger))
    gdal.Polygonize(fb, fb, vl, 0, ['8CONNECTED=8'])

    # Номер зоны → растр, чтобы посчитать глубины и связь с водоёмом по пикселям
    vl.CreateField(ogr.FieldDefn('zid', ogr.OFTInteger))
    n = 0
    vl.ResetReading()
    for f in vl:
        n += 1
        f.SetField('zid', n); vl.SetFeature(f)
    lab = np.zeros((rows, cols), dtype=np.int32)
    if n:
        lab_ds = gdal.GetDriverByName('MEM').Create('', cols, rows, 1, gdal.GDT_Int32)
        lab_ds.SetGeoTransform(gt); lab_ds.SetProjection(srs_m.ExportToWkt())
        gdal.RasterizeLayer(lab_ds, [1], vl, options=['ATTRIBUTE=zid'])
        lab = lab_ds.GetRasterBand(1).ReadAsArray().astype(np.int32)
        lab[~flood] = 0

    zmin = np.full(n + 1, np.inf, dtype=np.float64)
    zsum = np.zeros(n + 1, dtype=np.float64)
    zcnt = np.zeros(n + 1, dtype=np.int64)
    m = (lab > 0) & valid
    if m.any():
        np.minimum.at(zmin, lab[m], -depth[m])        # наибольшая глубина = −min(−глубина)
        np.add.at(zsum, lab[m], depth[m])
        np.add.at(zcnt, lab[m], 1)
    has_water = np.zeros(n + 1, dtype=bool)
    mw = (lab > 0) & source
    if mw.any():
        has_water[np.unique(lab[mw])] = True

    out = []
    dropped_small = dropped_isolated = 0
    vl.ResetReading()
    for f in vl:
        zid = f.GetField('zid')
        g = f.GetGeometryRef()
        if g is None:
            continue
        g = g.Clone()
        # Обрезаем по границе расчёта (ступеньки пикселей у края не вылезают за полигон)
        try:
            g = g.Intersection(area_geom)
        except Exception:
            pass
        if g is None or g.IsEmpty():
            continue
        area = g.GetArea()
        if area < min_area:
            dropped_small += 1
            continue
        if connected_only and not has_water[zid]:
            dropped_isolated += 1
            continue
        g = g.SimplifyPreserveTopology(res * 0.75)
        if g is None or g.IsEmpty():
            continue
        dmax = (-zmin[zid]) if np.isfinite(zmin[zid]) else None
        dmean = (zsum[zid] / zcnt[zid]) if zcnt[zid] else None
        g.Transform(to_wgs)
        try:
            gj = json.loads(g.ExportToJson(['COORDINATE_PRECISION=7']))
        except Exception:
            gj = json.loads(g.ExportToJson())
        out.append({'type': 'Feature', 'geometry': gj, 'properties': {
            'area_m2': round(area, 1),
            'depth_max': round(float(dmax), 2) if dmax is not None else None,
            'depth_mean': round(float(dmean), 2) if dmean is not None else None,
            'water': bool(has_water[zid]),
        }})

    out.sort(key=lambda f: -f['properties']['area_m2'])
    truncated = max(0, len(out) - MAX_ZONES)
    out = out[:MAX_ZONES]
    for i, f in enumerate(out, start=1):
        pr = f['properties']
        pr['name'] = f'Зона {i}'
        pr['level'] = level

    stats.update({
        'zones': len(out), 'dropped_small': dropped_small, 'dropped_isolated': dropped_isolated,
        'truncated': truncated,
        'flood_m2': round(sum(f['properties']['area_m2'] for f in out), 1),
        'depth_max': max([f['properties']['depth_max'] for f in out if f['properties']['depth_max'] is not None], default=None),
    })
    with open(p['out_geojson'], 'w', encoding='utf-8') as f:
        json.dump({'type': 'FeatureCollection', 'features': out, 'stats': stats}, f, ensure_ascii=False)
    print('FLOOD_OK ' + json.dumps(stats, ensure_ascii=False))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python flood_zones.py params.json')
        sys.exit(1)
    try:
        main(sys.argv[1])
    except Exception as e:
        print(f'ERROR: {e}', file=sys.stderr)
        sys.exit(1)

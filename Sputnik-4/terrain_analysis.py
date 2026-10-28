#!/usr/bin/env python3
"""
terrain_analysis.py — анализ рельефа ArcticDEM (высоты в БСВ-77):
  slope      — уклоны, градусы: раскраска по классам, площади, контуры крутых участков
  aspect     — экспозиция склонов (С, СВ, В … куда «смотрит» склон)
  flow       — линии стока (тальвеги): куда стекает вода, площадь водосбора у линии
  watershed  — водосбор точки (что стекает в выбранное место)
  compare    — сравнение со своей съёмкой: разница «съёмка − ArcticDEM» в точках,
               картограмма разницы и объёмы (выше / ниже)
Расчёт — в поперечном Меркаторе с осевым меридианом по центру области (метры).
Вход: params.json {mode, dem_tif, bbox, clip, cache_dir, ...}, результат — JSON в params.out.
Сток считается методом «priority-flood» (Barnes, 2014): понижения заполняются,
направления стока D8 задаются порядком затопления, площадь водосбора — накоплением.
"""
import sys, json, math, os, base64, heapq, hashlib
from osgeo import gdal, ogr, osr
import numpy as np

gdal.UseExceptions(); ogr.UseExceptions(); osr.UseExceptions()


def _srs(d):
    s = osr.SpatialReference()
    s.ImportFromEPSG(d) if isinstance(d, int) else s.ImportFromProj4(d)
    if hasattr(s, 'SetAxisMappingStrategy'):
        s.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return s


class Grid:
    """Рельеф области на метрической сетке + маска «внутри области расчёта»."""
    def __init__(self, p, max_cells, min_res=2.0):
        b = p['bbox']
        self.lon0 = (b['minLng'] + b['maxLng']) / 2
        self.wgs = _srs(4326)
        self.loc = _srs(f'+proj=tmerc +lat_0=0 +lon_0={self.lon0:.6f} +k=1 +x_0=500000 +y_0=0 +ellps=WGS84 +units=m +no_defs')
        self.to_m = osr.CoordinateTransformation(self.wgs, self.loc)
        self.to_w = osr.CoordinateTransformation(self.loc, self.wgs)
        clip = p.get('clip')
        if clip and clip.get('type') == 'Polygon':
            area = ogr.CreateGeometryFromJson(json.dumps(clip))
        else:
            r = [[b['minLng'], b['minLat']], [b['maxLng'], b['minLat']], [b['maxLng'], b['maxLat']], [b['minLng'], b['maxLat']], [b['minLng'], b['minLat']]]
            area = ogr.CreateGeometryFromJson(json.dumps({'type': 'Polygon', 'coordinates': [r]}))
        area.Transform(self.to_m)
        if not area.IsValid():
            area = area.Buffer(0)
        self.area = area
        x0, x1, y0, y1 = area.GetEnvelope()
        res = max(min_res, math.sqrt(max((x1 - x0) * (y1 - y0), 1) / max_cells))
        self.res = res = math.ceil(res * 10) / 10
        ds = gdal.Warp('', p['dem_tif'], options=gdal.WarpOptions(format='MEM', dstSRS=self.loc.ExportToWkt(),
            outputBounds=(x0 - res, y0 - res, x1 + res, y1 + res), xRes=res, yRes=res, resampleAlg='bilinear', dstNodata=-9999))
        band = ds.GetRasterBand(1)
        try:
            gdal.FillNodata(band, None, max(5, int(300 / res)), 0)
        except Exception:
            pass
        self.dem = band.ReadAsArray().astype(np.float64)
        self.gt = ds.GetGeoTransform()
        self.rows, self.cols = self.dem.shape
        self.nodata = self.dem <= -9990
        self.inside = self._rasterize(area).astype(bool)

    def _mem(self, dtype=gdal.GDT_Byte, n=1):
        d = gdal.GetDriverByName('MEM').Create('', self.cols, self.rows, n, dtype)
        d.SetGeoTransform(self.gt); d.SetProjection(self.loc.ExportToWkt())
        return d

    def _rasterize(self, geom):
        m = ogr.GetDriverByName('Memory').CreateDataSource('a'); l = m.CreateLayer('a', self.loc, ogr.wkbPolygon)
        f = ogr.Feature(l.GetLayerDefn()); f.SetGeometry(geom); l.CreateFeature(f)
        d = self._mem(); gdal.RasterizeLayer(d, [1], l, burn_values=[1])
        return d.GetRasterBand(1).ReadAsArray()

    def xy(self, r, c):        # центр ячейки → метры
        return self.gt[0] + (c + 0.5) * self.gt[1], self.gt[3] + (r + 0.5) * self.gt[5]

    def to_wgs(self, x, y):
        p = self.to_w.TransformPoint(x, y)
        return [round(p[0], 7), round(p[1], 7)]

    def overlay(self, rgba):
        """RGBA-картинка (rows×cols×4) → PNG в Web Mercator + границы для карты."""
        d = self._mem(gdal.GDT_Byte, 4)
        for i in range(4):
            d.GetRasterBand(i + 1).WriteArray(rgba[:, :, i])
        w = gdal.Warp('', d, options=gdal.WarpOptions(format='MEM', dstSRS='EPSG:3857', resampleAlg='near', dstAlpha=False))
        gdal.GetDriverByName('PNG').CreateCopy('/vsimem/ov.png', w)
        f = gdal.VSIFOpenL('/vsimem/ov.png', 'rb'); gdal.VSIFSeekL(f, 0, 2); n = gdal.VSIFTellL(f); gdal.VSIFSeekL(f, 0, 0)
        data = gdal.VSIFReadL(1, n, f); gdal.VSIFCloseL(f); gdal.Unlink('/vsimem/ov.png')
        gt = w.GetGeoTransform(); W, H = w.RasterXSize, w.RasterYSize
        merc = _srs(3857); ct = osr.CoordinateTransformation(merc, self.wgs)
        a = ct.TransformPoint(gt[0], gt[3] + gt[5] * H); b = ct.TransformPoint(gt[0] + gt[1] * W, gt[3])
        return {'png': base64.b64encode(data).decode(), 'bounds': [[a[1], a[0]], [b[1], b[0]]]}

    def polygons(self, mask, attrs_of=None, min_area=0, simplify=None):
        """Маска → полигоны GeoJSON (WGS-84) с площадью."""
        d = self._mem(); bnd = d.GetRasterBand(1); bnd.WriteArray(mask.astype(np.uint8))
        m = ogr.GetDriverByName('Memory').CreateDataSource('p'); l = m.CreateLayer('p', self.loc, ogr.wkbPolygon)
        l.CreateField(ogr.FieldDefn('DN', ogr.OFTInteger))
        gdal.Polygonize(bnd, bnd, l, 0, ['8CONNECTED=8'])
        out = []
        for f in l:
            g = f.GetGeometryRef().Clone()
            try:
                g = g.Intersection(self.area)
            except Exception:
                pass
            if g is None or g.IsEmpty():
                continue
            a = g.GetArea()
            if a < min_area:
                continue
            g = g.SimplifyPreserveTopology(simplify or self.res * 0.75)
            pr = {'area_ha': round(a / 1e4, 3)}
            if attrs_of:
                pr.update(attrs_of(f.GetField('DN'), g))
            g.Transform(self.to_w)
            out.append({'type': 'Feature', 'properties': pr, 'geometry': json.loads(g.ExportToJson(['COORDINATE_PRECISION=7']))})
        return out


def _grad(G):
    z = np.where(G.nodata, np.nan, G.dem)
    gr, gc = np.gradient(z, G.res)          # по строкам (на юг) и по столбцам (на восток)
    return gr, gc


SLOPE_CLASSES = [(0, 2, '#1a9850', 'до 2° — ровно'), (2, 5, '#91cf60', '2–5°'), (5, 10, '#d9ef8b', '5–10°'),
                 (10, 15, '#fee08b', '10–15°'), (15, 25, '#fc8d59', '15–25°'), (25, 90, '#d73027', 'круче 25°')]
ASPECTS = [('С', '#3b82f6'), ('СВ', '#06b6d4'), ('В', '#10b981'), ('ЮВ', '#84cc16'), ('Ю', '#eab308'), ('ЮЗ', '#f97316'), ('З', '#ef4444'), ('СЗ', '#a855f7')]


def _hex(c):
    return [int(c[i:i + 2], 16) for i in (1, 3, 5)]


def mode_slope(p):
    G = Grid(p, 4_000_000)
    gr, gc = _grad(G)
    sl = np.degrees(np.arctan(np.hypot(gr, gc)))
    ok = G.inside & ~G.nodata & np.isfinite(sl)
    rgba = np.zeros((G.rows, G.cols, 4), np.uint8)
    classes = []
    tot = ok.sum() or 1
    for lo, hi, col, lbl in SLOPE_CLASSES:
        m = ok & (sl >= lo) & (sl < hi)
        rgba[m, :3] = _hex(col); rgba[m, 3] = 165
        classes.append({'label': lbl, 'color': col, 'from': lo, 'to': hi, 'area_ha': round(float(m.sum()) * G.res ** 2 / 1e4, 2), 'pct': round(100 * float(m.sum()) / tot, 1)})
    steep = float(p.get('steep') or 10)
    zones = G.polygons(ok & (sl >= steep), lambda dn, g: {'name': f'Уклон ≥ {steep:g}°'}, min_area=float(p.get('min_area') or 200))
    v = sl[ok]
    return {'overlay': G.overlay(rgba), 'legend': classes, 'zones': {'type': 'FeatureCollection', 'features': zones},
            'stats': {'res': G.res, 'mean': round(float(v.mean()), 2) if v.size else None, 'max': round(float(v.max()), 2) if v.size else None, 'steep': steep}}


def mode_aspect(p):
    G = Grid(p, 4_000_000)
    gr, gc = _grad(G)
    sl = np.degrees(np.arctan(np.hypot(gr, gc)))
    asp = (np.degrees(np.arctan2(-gc, gr)) + 360) % 360      # куда смотрит склон, от севера по часовой
    ok = G.inside & ~G.nodata & np.isfinite(asp)
    flat = ok & (sl < 1)
    sec = ((asp + 22.5) // 45).astype(int) % 8
    rgba = np.zeros((G.rows, G.cols, 4), np.uint8)
    tot = ok.sum() or 1
    leg = []
    for i, (nm, col) in enumerate(ASPECTS):
        m = ok & ~flat & (sec == i)
        rgba[m, :3] = _hex(col); rgba[m, 3] = 150
        leg.append({'label': nm, 'color': col, 'pct': round(100 * float(m.sum()) / tot, 1)})
    rgba[flat, :3] = [200, 200, 200]; rgba[flat, 3] = 120
    leg.append({'label': 'ровно (< 1°)', 'color': '#c8c8c8', 'pct': round(100 * float(flat.sum()) / tot, 1)})
    return {'overlay': G.overlay(rgba), 'legend': leg, 'stats': {'res': G.res}}


# ── Сток ───────────────────────────────────────────────────
def _flow(G):
    """priority-flood: возвращает (down, order) — куда течёт ячейка и порядок от устьев вверх."""
    R, C = G.rows, G.cols
    z = np.where(G.nodata | ~G.inside, -1e9, G.dem).ravel().tolist()
    inside = (G.inside & ~G.nodata).ravel().tolist()
    N = R * C
    down = [-1] * N
    closed = bytearray(N)
    # стартовые ячейки — край области (у них есть сосед снаружи или край растра)
    ins = G.inside & ~G.nodata
    core = np.zeros_like(ins)
    core[1:-1, 1:-1] = ins[1:-1, 1:-1]
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            if dr or dc:
                core[1:-1, 1:-1] &= ins[1 + dr:R - 1 + dr, 1 + dc:C - 1 + dc]
    edge = np.flatnonzero((ins & ~core).ravel()).tolist()
    heap = [(z[i], i) for i in edge]
    for i in edge:
        closed[i] = 1
    heapq.heapify(heap)
    order = []
    nb = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    push, pop = heapq.heappush, heapq.heappop
    while heap:
        zc, i = pop(heap)
        order.append(i)
        r, c = divmod(i, C)
        for dr, dc in nb:
            rr, cc = r + dr, c + dc
            if rr < 0 or cc < 0 or rr >= R or cc >= C:
                continue
            j = rr * C + cc
            if closed[j] or not inside[j]:
                continue
            closed[j] = 1
            down[j] = i
            zj = z[j]
            push(heap, (zj if zj > zc else zc, j))
    return down, order


def _flow_cached(G, p):
    key = hashlib.md5(json.dumps([p.get('bbox'), p.get('clip'), G.res], sort_keys=True).encode()).hexdigest()[:16]
    fn = os.path.join(p.get('cache_dir') or '.', f'flow_{key}.npz')
    if os.path.exists(fn):
        d = np.load(fn)
        return d['down'].tolist(), d['order'].tolist()
    down, order = _flow(G)
    try:
        np.savez(fn, down=np.array(down, np.int64), order=np.array(order, np.int64))
    except Exception:
        pass
    return down, order


def _acc(down, order):
    acc = [1] * len(down)
    for i in reversed(order):
        d = down[i]
        if d >= 0:
            acc[d] += acc[i]
    return acc


def mode_flow(p):
    G = Grid(p, int(p.get('max_cells') or 600_000), min_res=5.0)
    down, order = _flow_cached(G, p)
    acc = _acc(down, order)
    cell = G.res ** 2
    tot_area = float(G.inside.sum()) * cell
    thr_km2 = float(p.get('threshold_km2') or 0) or max(0.02, round(tot_area / 1e6 * 0.01, 3))
    thr = max(2, int(thr_km2 * 1e6 / cell))
    C = G.cols
    stream = [a >= thr for a in acc]
    nup = [0] * len(down)
    for i, d in enumerate(down):
        if d >= 0 and stream[i] and stream[d]:
            nup[d] += 1
    lines = []
    starts = [i for i in range(len(down)) if stream[i] and nup[i] != 1]
    for s in starts:
        if nup[s] > 1:      # слияние — линии начинаются от каждого притока
            continue
        pts = [s]; i = s
        while True:
            d = down[i]
            if d < 0 or not stream[d]:
                break
            pts.append(d)
            if nup[d] > 1:
                break
            i = d
        if len(pts) < 2:
            continue
        coords = [G.to_wgs(*G.xy(*divmod(k, C))) for k in pts]
        lines.append({'type': 'Feature', 'properties': {'catchment_km2': round(acc[pts[-1]] * cell / 1e6, 3), 'length_m': round((len(pts) - 1) * G.res, 1)},
                      'geometry': {'type': 'LineString', 'coordinates': coords}})
    # слияния: линии от каждого слияния вниз
    for s in [i for i in range(len(down)) if stream[i] and nup[i] > 1]:
        pts = [s]; i = s
        while True:
            d = down[i]
            if d < 0 or not stream[d]:
                break
            pts.append(d)
            if nup[d] > 1:
                break
            i = d
        if len(pts) >= 2:
            coords = [G.to_wgs(*G.xy(*divmod(k, C))) for k in pts]
            lines.append({'type': 'Feature', 'properties': {'catchment_km2': round(acc[pts[-1]] * cell / 1e6, 3), 'length_m': round((len(pts) - 1) * G.res, 1)},
                          'geometry': {'type': 'LineString', 'coordinates': coords}})
    mx = max([f['properties']['catchment_km2'] for f in lines], default=0)
    for f in lines:
        a = f['properties']['catchment_km2']
        f['properties']['class'] = 3 if a >= mx * 0.3 else 2 if a >= mx * 0.05 else 1
        f['properties']['name'] = f"Сток, водосбор {a:g} км²"
    return {'lines': {'type': 'FeatureCollection', 'features': lines},
            'stats': {'res': G.res, 'threshold_km2': thr_km2, 'count': len(lines), 'area_km2': round(tot_area / 1e6, 3)}}


def mode_watershed(p):
    G = Grid(p, int(p.get('max_cells') or 600_000), min_res=5.0)
    down, order = _flow_cached(G, p)
    acc = _acc(down, order)
    lng, lat = p['point']
    x, y, _ = G.to_m.TransformPoint(lng, lat)
    c0 = int((x - G.gt[0]) / G.gt[1]); r0 = int((y - G.gt[3]) / G.gt[5])
    if not (0 <= r0 < G.rows and 0 <= c0 < G.cols):
        raise SystemExit('ERROR: точка вне области расчёта')
    # притягиваем к ячейке с наибольшим водосбором в радиусе ~50 м (точка «на тальвеге»)
    rad = max(1, int(50 / G.res)); best = None
    for r in range(max(0, r0 - rad), min(G.rows, r0 + rad + 1)):
        for c in range(max(0, c0 - rad), min(G.cols, c0 + rad + 1)):
            i = r * G.cols + c
            if best is None or acc[i] > acc[best]:
                best = i
    up = bytearray(len(down)); up[best] = 1
    for i in order:
        d = down[i]
        if d >= 0 and up[d]:
            up[i] = 1
    mask = np.frombuffer(bytes(up), dtype=np.uint8).reshape(G.rows, G.cols).astype(bool)
    polys = G.polygons(mask, lambda dn, g: {'name': 'Водосбор'}, min_area=G.res ** 2 * 4, simplify=G.res)
    area = float(mask.sum()) * G.res ** 2
    br, bc = divmod(best, G.cols)
    return {'polygon': {'type': 'FeatureCollection', 'features': polys}, 'outlet': G.to_wgs(*G.xy(br, bc)),
            'stats': {'res': G.res, 'area_km2': round(area / 1e6, 4), 'outlet_h': round(float(G.dem[br, bc]), 2),
                      'max_h': round(float(G.dem[mask].max()), 2) if mask.any() else None}}


def mode_compare(p):
    pts = [q for q in (p.get('points') or []) if q and len(q) >= 3 and q[2] is not None]
    if len(pts) < 3:
        raise SystemExit('ERROR: нужно минимум 3 точки съёмки с высотой')
    G = Grid(p, 4_000_000)
    zz = np.where(G.nodata, np.nan, G.dem)
    out, dzs, xy = [], [], []
    for lng, lat, h in pts:
        x, y, _ = G.to_m.TransformPoint(lng, lat)
        fc = (x - G.gt[0]) / G.gt[1] - 0.5; fr = (y - G.gt[3]) / G.gt[5] - 0.5
        c0, r0 = int(math.floor(fc)), int(math.floor(fr))
        if not (0 <= r0 < G.rows - 1 and 0 <= c0 < G.cols - 1):
            out.append({'type': 'Feature', 'properties': {'h': h, 'dem': None, 'dz': None}, 'geometry': {'type': 'Point', 'coordinates': [lng, lat]}}); continue
        tx, ty = fc - c0, fr - r0
        q = zz[r0:r0 + 2, c0:c0 + 2]
        dem = (q[0, 0] * (1 - tx) + q[0, 1] * tx) * (1 - ty) + (q[1, 0] * (1 - tx) + q[1, 1] * tx) * ty
        if not np.isfinite(dem):
            dem = None
        dz = None if dem is None else float(h) - float(dem)
        out.append({'type': 'Feature', 'properties': {'h': round(float(h), 3), 'dem': None if dem is None else round(float(dem), 3), 'dz': None if dz is None else round(dz, 3)},
                    'geometry': {'type': 'Point', 'coordinates': [lng, lat]}})
        if dz is not None:
            dzs.append(dz); xy.append((x, y))
    if len(dzs) < 3:
        raise SystemExit('ERROR: точки съёмки не попадают на рельеф ArcticDEM')
    d = np.array(dzs)
    # картограмма разницы: интерполяция dz внутри выпуклой оболочки точек
    mp = ogr.Geometry(ogr.wkbMultiPoint)
    for x, y in xy:
        g = ogr.Geometry(ogr.wkbPoint); g.AddPoint_2D(x, y); mp.AddGeometry(g)
    hull = mp.ConvexHull()
    vol = {'cut': 0.0, 'fill': 0.0, 'area_ha': 0.0}
    overlay = None
    if hull.GetGeometryType() in (ogr.wkbPolygon, ogr.wkbPolygon25D) and hull.GetArea() > G.res ** 2 * 10:
        ha = hull.GetArea(); x0, x1, y0, y1 = hull.GetEnvelope()
        res = max(G.res, math.sqrt(ha / 250_000))
        W, H = max(2, int((x1 - x0) / res)), max(2, int((y1 - y0) / res))
        csv = '/vsimem/pts.csv'
        gdal.FileFromMemBuffer(csv, ('x,y,dz\n' + '\n'.join(f'{x},{y},{v}' for (x, y), v in zip(xy, dzs))).encode())
        vrt = f'<OGRVRTDataSource><OGRVRTLayer name="pts"><SrcDataSource>{csv}</SrcDataSource><GeometryType>wkbPoint</GeometryType><GeometryField encoding="PointFromColumns" x="x" y="y" z="dz"/></OGRVRTLayer></OGRVRTDataSource>'
        gdal.FileFromMemBuffer('/vsimem/pts.vrt', vrt.encode())
        rad = max(res * 3, math.sqrt(ha / max(1, len(xy))) * 3)
        gd = gdal.Grid('', '/vsimem/pts.vrt', options=gdal.GridOptions(format='MEM', outputBounds=(x0, y1, x1, y0), width=W, height=H, zfield='dz',
                       algorithm=f'invdistnn:power=2:max_points=12:radius={rad}:nodata=-9999', outputSRS=G.loc.ExportToWkt()))
        g = gd.GetRasterBand(1).ReadAsArray().astype(np.float64)
        gt = gd.GetGeoTransform()
        hm = gdal.GetDriverByName('MEM').Create('', W, H, 1, gdal.GDT_Byte); hm.SetGeoTransform(gt); hm.SetProjection(G.loc.ExportToWkt())
        m = ogr.GetDriverByName('Memory').CreateDataSource('h'); l = m.CreateLayer('h', G.loc, ogr.wkbPolygon)
        f = ogr.Feature(l.GetLayerDefn()); f.SetGeometry(hull); l.CreateFeature(f); gdal.RasterizeLayer(hm, [1], l, burn_values=[1])
        inh = hm.GetRasterBand(1).ReadAsArray().astype(bool) & (g > -9990)
        cellA = abs(gt[1] * gt[5])
        vol = {'cut': round(float(g[inh & (g < 0)].sum()) * cellA, 1), 'fill': round(float(g[inh & (g > 0)].sum()) * cellA, 1), 'area_ha': round(float(inh.sum()) * cellA / 1e4, 3)}
        lim = max(0.25, float(np.nanpercentile(np.abs(d), 95)))
        t = np.clip(g / lim, -1, 1)
        rgba = np.zeros((H, W, 4), np.uint8)
        # синий — съёмка ниже ArcticDEM, красный — выше, белый — совпадает
        rgba[..., 0] = np.where(t > 0, 255, (255 * (1 + t))).astype(np.uint8)
        rgba[..., 1] = (255 * (1 - np.abs(t))).astype(np.uint8)
        rgba[..., 2] = np.where(t < 0, 255, (255 * (1 - t))).astype(np.uint8)
        rgba[..., 3] = np.where(inh, 170, 0).astype(np.uint8)
        G2 = G; G2.gt, G2.rows, G2.cols = gt, H, W
        overlay = G2.overlay(rgba); overlay['limit'] = round(lim, 2)
    st = {'n': len(dzs), 'mean': round(float(d.mean()), 3), 'median': round(float(np.median(d)), 3), 'rms': round(float(np.sqrt((d ** 2).mean())), 3),
          'std': round(float(d.std()), 3), 'min': round(float(d.min()), 3), 'max': round(float(d.max()), 3), **vol}
    return {'points': {'type': 'FeatureCollection', 'features': out}, 'overlay': overlay, 'stats': st}


def main(pf):
    p = json.load(open(pf, encoding='utf-8'))
    fn = {'slope': mode_slope, 'aspect': mode_aspect, 'flow': mode_flow, 'watershed': mode_watershed, 'compare': mode_compare}.get(p.get('mode'))
    if not fn:
        raise SystemExit('ERROR: неизвестный режим')
    r = fn(p)
    json.dump(r, open(p['out'], 'w', encoding='utf-8'), ensure_ascii=False)
    print('TA_OK')


if __name__ == '__main__':
    try:
        main(sys.argv[1])
    except SystemExit as e:
        print(str(e), file=sys.stderr); sys.exit(1)
    except Exception as e:
        print(f'ERROR: {e}', file=sys.stderr); sys.exit(1)

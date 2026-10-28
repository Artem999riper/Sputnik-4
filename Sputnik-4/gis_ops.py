#!/usr/bin/env python3
"""
gis_ops.py — геометрические операции над слоями (OGR/GEOS):
  buffer     — зона вокруг объектов слоя A на distance метров (dissolve — слить в одну)
  clip       — обрезать A по слою B (что из A попадает в B)
  difference — A без того, что перекрыто B
  select     — объекты A целиком, которые пересекают B (атрибуты не меняются)
  dissolve   — слить все объекты A в один (или по полю field)
Расчёт в поперечном Меркаторе с осевым меридианом по центру данных (метры),
результат — GeoJSON в WGS-84 с полями area_ha / length_m.
Вход/выход: params.json {op, a:FC, b:FC|null, distance, dissolve, field, out}
"""
import sys, json
from osgeo import ogr, osr

ogr.UseExceptions()
osr.UseExceptions()


def srs(defn):
    s = osr.SpatialReference()
    if isinstance(defn, int):
        s.ImportFromEPSG(defn)
    else:
        s.ImportFromProj4(defn)
    if hasattr(s, 'SetAxisMappingStrategy'):
        s.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return s


def feats(fc):
    out = []
    for f in (fc or {}).get('features', []) or []:
        g = f and f.get('geometry')
        if not g:
            continue
        try:
            geom = ogr.CreateGeometryFromJson(json.dumps(g))
        except Exception:
            continue
        if geom is None or geom.IsEmpty():
            continue
        out.append((geom, dict(f.get('properties') or {})))
    return out


def fix(g):
    if g is not None and not g.IsValid():
        try:
            g = g.Buffer(0) if g.GetDimension() == 2 else g.MakeValid()
        except Exception:
            pass
    return g


def union_all(geoms):
    if not geoms:
        return None
    coll = ogr.Geometry(ogr.wkbGeometryCollection)
    for g in geoms:
        coll.AddGeometry(g)
    try:
        return fix(coll.UnaryUnion())
    except Exception:
        u = geoms[0].Clone()
        for g in geoms[1:]:
            u = fix(u.Union(g))
        return u


def main(pf):
    p = json.load(open(pf, encoding='utf-8'))
    op = p['op']
    A = feats(p.get('a'))
    B = feats(p.get('b'))
    if not A:
        raise SystemExit('ERROR: в слое A нет объектов')
    # центр данных → локальная метрическая СК
    xs, ys = [], []
    for g, _ in A + B:
        e = g.GetEnvelope()
        xs += [e[0], e[1]]
        ys += [e[2], e[3]]
    lon0 = (min(xs) + max(xs)) / 2
    wgs = srs(4326)
    loc = srs(f'+proj=tmerc +lat_0=0 +lon_0={lon0:.6f} +k=1 +x_0=500000 +y_0=0 +ellps=WGS84 +units=m +no_defs')
    to_m, to_w = osr.CoordinateTransformation(wgs, loc), osr.CoordinateTransformation(loc, wgs)
    for g, _ in A + B:
        g.Transform(to_m)
    A = [(fix(g), pr) for g, pr in A]
    B = [(fix(g), pr) for g, pr in B]
    res = []
    if op == 'buffer':
        d = float(p.get('distance') or 0)
        if d <= 0:
            raise SystemExit('ERROR: укажите расстояние буфера больше 0')
        bufs = [(fix(g.Buffer(d, 16)), pr) for g, pr in A]
        if p.get('dissolve'):
            res = [(union_all([g for g, _ in bufs]), {'name': f'Буфер {d:g} м'})]
        else:
            res = [(g, {**pr, 'buffer_m': d}) for g, pr in bufs]
    elif op in ('clip', 'difference', 'select'):
        if not B:
            raise SystemExit('ERROR: в слое B нет объектов')
        ub = union_all([g for g, _ in B])
        for g, pr in A:
            if op == 'select':
                if g.Intersects(ub):
                    res.append((g, pr))
                continue
            try:
                r = g.Intersection(ub) if op == 'clip' else g.Difference(ub)
            except Exception:
                continue
            if r is not None and not r.IsEmpty():
                res.append((fix(r), pr))
    elif op == 'dissolve':
        fld = p.get('field') or None
        groups = {}
        for g, pr in A:
            groups.setdefault(str(pr.get(fld, '')) if fld else '', []).append(g)
        for k, gs in groups.items():
            res.append((union_all(gs), {fld: k} if fld else {'name': 'Объединение'}))
    else:
        raise SystemExit('ERROR: неизвестная операция ' + op)

    out = []
    tot_a = tot_l = 0.0
    for g, pr in res:
        if g is None or g.IsEmpty():
            continue
        dim = g.GetDimension()
        pr = {k: v for k, v in pr.items() if not str(k).startswith('_') or k in ('_color',)}
        if dim == 2:
            a = g.GetArea(); tot_a += a
            pr['area_ha'] = round(a / 1e4, 4)
        elif dim == 1:
            ln = g.Length(); tot_l += ln
            pr['length_m'] = round(ln, 2)
        g.Transform(to_w)
        try:
            gj = json.loads(g.ExportToJson(['COORDINATE_PRECISION=7']))
        except Exception:
            gj = json.loads(g.ExportToJson())
        out.append({'type': 'Feature', 'properties': pr, 'geometry': gj})
    stats = {'count': len(out), 'area_ha': round(tot_a / 1e4, 4), 'length_m': round(tot_l, 1), 'in_a': len(A), 'in_b': len(B)}
    json.dump({'type': 'FeatureCollection', 'features': out, 'stats': stats}, open(p['out'], 'w', encoding='utf-8'), ensure_ascii=False)
    print('GIS_OK ' + json.dumps(stats))


if __name__ == '__main__':
    try:
        main(sys.argv[1])
    except SystemExit as e:
        print(str(e), file=sys.stderr); sys.exit(1)
    except Exception as e:
        print(f'ERROR: {e}', file=sys.stderr); sys.exit(1)

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const { getDb } = require('./database');

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const TMP_DIR     = path.join(__dirname, 'uploads', '_tmp');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(TMP_DIR))     fs.mkdirSync(TMP_DIR,     { recursive: true });

const app  = express();
const PORT = process.env.PORT || 3100;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

let db;
const getDbInstance = () => db;

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next))
    .catch(e => {
      console.error('API error:', e);
      res.status(500).json({ error: e.message || 'Внутренняя ошибка' });
    });
}

const routeRefs        = require('./routes/refs');
const routeSites       = require('./routes/sites');
const routeVolumes     = require('./routes/volumes');
const routeBoreholes   = require('./routes/boreholes');
const routeTaskPoints  = require('./routes/task_points');
const routePhotos      = require('./routes/photos');
const routeBrigade     = require('./routes/brigade');
const routeKml         = require('./routes/kml');
const routeValidation  = require('./routes/validation');
const routeExport      = require('./routes/export_spk');
const routeVedomost    = require('./routes/vedomost');
const routeSummary     = require('./routes/summary');

getDb().then(database => {
  db = database;
  const ctx = { db: getDbInstance, wrap, UPLOADS_DIR, TMP_DIR };

  routeRefs(app, ctx);
  routeSites(app, ctx);
  routeVolumes(app, ctx);
  routeBoreholes(app, ctx);
  routeTaskPoints(app, ctx);
  routePhotos(app, ctx);
  routeBrigade(app, ctx);
  routeKml(app, ctx);
  routeValidation(app, ctx);
  routeExport(app, ctx);
  routeVedomost(app, ctx);
  routeSummary(app, ctx);

  app.get('/api/_ping', (req, res) => res.json({ ok: true, app: 'sputnik-polevik-pc', version: '1.0.0' }));

  app.listen(PORT, () => {
    console.log(`\n  🛰️  Спутник-Полевик ПК: http://localhost:${PORT}\n`);
  });
}).catch(err => console.error('Ошибка запуска:', err));

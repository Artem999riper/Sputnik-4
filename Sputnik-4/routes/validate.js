function required(fields, body) {
  for (const f of fields) {
    const v = body[f];
    if (v === undefined || v === null || v === '') return `Поле "${f}" обязательно`;
  }
  return null;
}

function wrap(fn) {
  return async (req, res) => {
    try { await fn(req, res); }
    catch (e) {
      console.error('[API Error]', req.method, req.path, e.message);
      // в журнал ошибок для админа (routes/health.js)
      try { let u = ''; try { u = decodeURIComponent(req.get('X-User-Name') || ''); } catch (_) {}
        require('./health').logError('server', e.message, { stack: e.stack, url: `${req.method} ${req.originalUrl || req.path}`, user: u }); } catch (_) {}
      if (!res.headersSent) res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  };
}

module.exports = { required, wrap };

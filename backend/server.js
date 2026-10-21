'use strict';
const http = require('node:http');
const port = Number(process.env.PORT || 10000);
const json = (res, status, body) => {
  const output = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(output),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(output);
};
http.createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (req.method === 'GET' && (path === '/health' || path === '/')) {
    return json(res, 200, { service: 'macsfinds-backend', status: 'ok', checkoutEnabled: false });
  }
  if (path === '/api/checkout') {
    return json(res, 503, { error: 'Checkout is not yet enabled. Please use the enquiry option.', code: 'CHECKOUT_DISABLED' });
  }
  return json(res, 404, { error: 'Not found' });
}).listen(port, '0.0.0.0', () => console.log('MacsFinds backend listening on port ' + port));

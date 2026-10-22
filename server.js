'use strict';
// MacsFinds sandbox-only checkout demo. No inventory reservation, fulfilment or real payments.
const http = require('node:http');
const { URLSearchParams } = require('node:url');
const PORT = Number(process.env.PORT || 10000);
const DEMO = Object.freeze({ id: 'MF-009', name: 'Grand Theft Auto (PS1)', amount: 2000, currency: 'aud' });
const rateBuckets = new Map();
const key = () => (process.env.STRIPE_SECRET_KEY || '').trim();
const isSandbox = () => /^(sk_test_|rk_test_)/.test(key());
const baseUrl = () => (process.env.PUBLIC_BASE_URL || 'https://macsfinds-backend.onrender.com').replace(/\/$/, '');
const csp = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
function send(res, status, body, type = 'application/json; charset=utf-8') {
  const out = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': type, 'Content-Length': Buffer.byteLength(out), 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': csp
  });
  res.end(out);
}
function throttle(req) {
  const ip = req.socket.remoteAddress || 'unknown', now = Date.now();
  let b = rateBuckets.get(ip);
  if (!b || now - b.time > 60000) b = { time: now, count: 0 };
  b.count++; rateBuckets.set(ip,b);
  if (rateBuckets.size > 3000) for (const [k,v] of rateBuckets) if (now - v.time > 60000) rateBuckets.delete(k);
  return b.count <= 15;
}
function readBody(req) { return new Promise((resolve,reject) => {
  let data = '', size = 0;
  req.on('data',chunk => {size += chunk.length; if(size > 2048) {reject(new Error('Body too large')); req.destroy();return;} data += chunk;});
  req.on('end',() => {try {resolve(JSON.parse(data || '{}'));} catch {reject(new Error('Invalid JSON'));}});
  req.on('error',reject);
}); }
const page = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>MacsFinds Sandbox Checkout</title><link rel="stylesheet" href="/sandbox.css"></head><body><main><h1>MacsFinds test checkout</h1><p><strong>Grand Theft Auto (PS1)</strong> · MF-009 · $20 AUD</p><p><strong>Test only:</strong> No real charge, order, delivery or stock reservation. This is a demonstration item, not a verified stock offer.</p><button id="pay" type="button">Test checkout with Stripe</button><p id="notice" role="status" aria-live="polite"></p><small>The real MacsFinds store remains enquiry-only. Shipping is not configured.</small></main><script src="/sandbox.js" defer></script></body></html>`;
const css = `body{font:16px system-ui;background:#f4f3ee;color:#152725;max-width:640px;margin:50px auto;padding:20px}main{background:#fff;padding:30px;border-radius:15px}button{background:#152725;color:white;border:0;padding:15px 20px;border-radius:10px;font:inherit;cursor:pointer}button:disabled{opacity:.5}small{color:#62716d}#notice{margin-top:20px}`;
const js = `document.querySelector('#pay').addEventListener('click',async()=>{const b=document.querySelector('#pay'),n=document.querySelector('#notice');b.disabled=true;n.textContent='Opening Stripe sandbox…';try{const r=await fetch('/api/test-checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemId:'MF-009'})});const x=await r.json();if(!r.ok)throw Error(x.error||'Checkout unavailable');if(!x.url||!x.url.startsWith('https://checkout.stripe.com/'))throw Error('Unexpected checkout URL');window.location.assign(x.url);}catch(e){n.textContent=e.message;b.disabled=false;}});`;
async function stripeCheckout(params) {
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method:'POST',headers:{'Authorization':'Bearer '+key(),'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams(params).toString(),signal:AbortSignal.timeout(10000)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Stripe failed');
  return data;
}
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url,'http://localhost');
  if(req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) return send(res,200,{service:'macsfinds-backend',status:'ok',checkoutEnabled:false,sandboxTestAvailable:isSandbox()});
  if(req.method === 'GET' && url.pathname === '/sandbox') return send(res,200,page,'text/html; charset=utf-8');
  if(req.method === 'GET' && url.pathname === '/sandbox.css') return send(res,200,css,'text/css; charset=utf-8');
  if(req.method === 'GET' && url.pathname === '/sandbox.js') return send(res,200,js,'application/javascript; charset=utf-8');
  if(url.pathname === '/api/checkout') return send(res,503,{error:'Live checkout disabled. Please enquire.',code:'CHECKOUT_DISABLED'});
  if(req.method === 'POST' && url.pathname === '/api/test-checkout') {
    if (!isSandbox()) return send(res,503,{error:'Stripe sandbox key missing or not test-mode.'});
    if (!throttle(req)) return send(res,429,{error:'Too many attempts. Try again later.'});
    let body;try{body=await readBody(req);}catch{return send(res,400,{error:'Invalid request'});}
    if(body?.itemId!==DEMO.id || Object.keys(body).some(k=>k!=='itemId')) return send(res,400,{error:'Only demo item MF-009 supported.'});
    const base=baseUrl();
    if(!base.startsWith('https://')) return send(res,503,{error:'Secure public URL required.'});
    try {
      const params={mode:'payment','line_items[0][price_data][currency]':DEMO.currency,'line_items[0][price_data][unit_amount]':String(DEMO.amount),'line_items[0][price_data][product_data][name]':'SANDBOX DEMO ONLY – '+DEMO.name,'line_items[0][quantity]':'1',success_url:base+'/sandbox?result=success',cancel_url:base+'/sandbox?result=cancel','metadata[demo]':'true','metadata[itemId]':DEMO.id};
      const session=await stripeCheckout(params);
      if(session.livemode!==false || !session.url?.startsWith('https://checkout.stripe.com/')) throw new Error('Unexpected Stripe response');
      return send(res,200,{url:session.url});
    } catch(e) {console.error('Sandbox checkout failed:',e.message);return send(res,502,{error:'Unable to start sandbox checkout. Check restricted key permissions and Render logs.'});}
  }
  return send(res,404,{error:'Not found'});
});
if(require.main===module)server.listen(PORT,'0.0.0.0',()=>console.log('MacsFinds sandbox backend listening on port '+PORT));
module.exports={server};

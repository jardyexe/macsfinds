'use strict';
// Sandbox checkout experiment only. No real purchases, inventory reservations or fulfilment.
const http = require('node:http');
const { URLSearchParams } = require('node:url');
const PORT = Number(process.env.PORT || 10000);
const MAX_BODY = 2048;
const rateBuckets = new Map();
const DEMO = Object.freeze({ id: 'MF-009', name: 'Grand Theft Auto (PS1)', amount: 2000, currency: 'aud' });
const key = () => (process.env.STRIPE_SECRET_KEY || '').trim();
const isSandbox = () => /^(sk_test_|rk_test_)/.test(key());
const host = () => process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') || `http://localhost:${PORT}`;
function respond(res, status, body, contentType = 'application/json; charset=utf-8') {
  const out = contentType.startsWith('application/json') ? JSON.stringify(body) : body;
  res.writeHead(status, {'Content-Type':contentType,'Content-Length':Buffer.byteLength(out),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
  res.end(out);
}
function throttle(req) {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const prev = rateBuckets.get(ip) || {time:now,count:0};
  if(now-prev.time > 60_000) {prev.time=now;prev.count=0;}
  prev.count++;
  rateBuckets.set(ip,prev);
  if (rateBuckets.size > 3000) for(const [k,v] of rateBuckets) if(now-v.time>60_000) rateBuckets.delete(k);
  return prev.count <= 15;
}
function readBody(req) {return new Promise((resolve,reject)=>{
  let data='';req.on('data',chunk=>{data+=chunk;if(data.length>MAX_BODY){reject(new Error('Request too large'));req.destroy();}});
  req.on('end',()=>{try{resolve(JSON.parse(data||'{}'));}catch{reject(new Error('Invalid JSON'));}});
  req.on('error',reject);
});}
async function stripe(path, params) {
  const response = await fetch('https://api.stripe.com/v1/'+path, {
    method:'POST',headers:{Authorization:'Bearer '+key(),'Content-Type':'application/x-www-form-urlencoded'},body: new URLSearchParams(params).toString(),signal:AbortSignal.timeout(10000)
  });
  const obj=await response.json();
  if(!response.ok) throw new Error(obj.error?.message || 'Stripe declined the request');
  return obj;
}
const html = `<!doctype html><html lang="en-AU"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MacsFinds Sandbox Checkout</title><style>body{font:16px system-ui;background:#f4f3ee;color:#152725;max-width:640px;margin:50px auto;padding:20px}main{background:white;padding:30px;border-radius:15px}button{background:#152725;color:white;border:0;padding:15px 20px;border-radius:10px;font:inherit;cursor:pointer}button:disabled{opacity:.5}small{color:#62716d}#notice{margin-top:20px}</style><main><h1>MacsFinds test checkout</h1><p><strong>Grand Theft Auto (PS1)</strong> · MF-009 · $20 AUD</p><p><strong>Test only:</strong> No real charge, order, delivery or stock reservation. This is a demonstration item, not a verified stock offer.</p><button id="pay">Test checkout with Stripe</button><p id="notice" role="status"></p><small>The real MacsFinds store remains enquiry-only. Shipping is not configured.</small></main><script>document.querySelector('#pay').onclick=async()=>{const b=document.querySelector('#pay'),n=document.querySelector('#notice');b.disabled=true;n.textContent='Opening Stripe sandbox…';try{const r=await fetch('/api/test-checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemId:'MF-009'})});const x=await r.json();if(!r.ok)throw Error(x.error||'Checkout unavailable');location.href=x.url;}catch(e){n.textContent=e.message;b.disabled=false;}};</script></html>`;
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET' && (url.pathname==='/' || url.pathname==='/health')) return respond(res,200,{service:'macsfinds-backend',status:'ok',checkoutEnabled:false,sandboxTestAvailable:isSandbox()});
  if(req.method==='GET' && url.pathname==='/sandbox') return respond(res,200,html,'text/html; charset=utf-8');
  if(url.pathname==='/api/checkout') return respond(res,503,{error:'Live checkout disabled. Please enquire.',code:'CHECKOUT_DISABLED'});
  if(req.method==='POST' && url.pathname==='/api/test-checkout') {
    if(!isSandbox()) return respond(res,503,{error:'Stripe sandbox key is missing or not a test/restricted test key.'});
    if(!throttle(req)) return respond(res,429,{error:'Too many attempts. Please try again later.'});
    let body;try{body=await readBody(req);}catch{return respond(res,400,{error:'Invalid request'});}
    if(body.itemId!==DEMO.id || Object.keys(body).some(k=>k!=='itemId')) return respond(res,400,{error:'Only demo item MF-009 is supported.'});
    try {
      const base=host();
      const params={mode:'payment','line_items[0][price_data][currency]':DEMO.currency,'line_items[0][price_data][unit_amount]':String(DEMO.amount),'line_items[0][price_data][product_data][name]':'SANDBOX DEMO ONLY – '+DEMO.name,'line_items[0][quantity]':'1',success_url:base+'/sandbox?result=success',cancel_url:base+'/sandbox?result=cancel', 'metadata[demo]':'true','metadata[itemId]':DEMO.id};
      const session=await stripe('checkout/sessions',params);
      if(!session.url || session.livemode) throw Error('Stripe response was not a sandbox checkout.');
      return respond(res,200,{url:session.url});
    } catch(e){console.error('Sandbox checkout failed:',e.message);return respond(res,502,{error:'Unable to start sandbox checkout. Check Stripe restricted-key permissions and Render logs.'});}
  }
  return respond(res,404,{error:'Not found'});
});
if(require.main===module)server.listen(PORT,'0.0.0.0',()=>console.log('MacsFinds sandbox backend listening on port '+PORT));
module.exports={server};

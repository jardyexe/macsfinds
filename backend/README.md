# MacsFinds backend foundation

This version does not accept payments, save orders or reserve stock.

Render settings:
- Language: Node
- Root Directory: backend
- Build Command: npm install
- Start Command: npm start
- Health Check Path: /health

Do not create Stripe secret keys until the secure checkout implementation is ready. Before accepting payment, the backend needs server-side stock management, secure checkout sessions, signed Stripe webhooks, shipping charges and Australian consumer law compliant policies.

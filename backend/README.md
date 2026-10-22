# MacsFinds Stripe sandbox demonstration (v0.2)

The app runs **test-only Checkout** for a **single demo item** (MF-009, $20 AUD). No real payment is possible through these endpoints; `/api/checkout` always returns HTTP 503. Stripe must have an `sk_test_` or `rk_test_` key in Render `STRIPE_SECRET_KEY`.

The demo does not reserve stock, send real orders, handle shipping, reconcile webhooks, mark games sold or confirm a paid order. Don't use this for customers or publish it as a real checkout. The demo price is hardcoded in the backend and ignores prices supplied by browsers.

## Render
- Repo: `jardyexe/macsfinds`
- Root Directory: `backend`
- Runtime: Node >=20
- Build command: `npm install`
- Start command: `npm start`
- Environment variable: `STRIPE_SECRET_KEY` (Stripe sandbox restricted key, secret, never in GitHub)
- Recommended additional environment variable: `PUBLIC_BASE_URL=https://macsfinds-backend.onrender.com`

After deploying visit `https://macsfinds-backend.onrender.com/health` and expect `sandboxTestAvailable: true`. Then visit `https://macsfinds-backend.onrender.com/sandbox` and test with Stripe sandbox payment details. The Stripe key needs Checkout Sessions Write; any additional API permissions must be justified by actual error messages. Render free hosting sleeps when idle.

**Before live sales:** verified inventory, safe single-copy reservations and persistent database, checkout fulfilment method / shipping rules, Stripe webhook signature verification with idempotency, refund/cancellation and consumer law policies, real product details, actual paid-order confirmation, rate limits and security review.

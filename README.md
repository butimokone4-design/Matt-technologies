# Matt Technologies — Full Online Store

This package upgrades the original static site into a Node.js + PostgreSQL ecommerce MVP.

## Features
- Product catalogue and categories
- Search
- Customer accounts and login
- Cart/checkout flow
- Orders stored in PostgreSQL
- Inventory/stock deduction
- Customer order history
- Admin dashboard
- Product management
- Order status/payment-status management
- WhatsApp order support
- PayFast-ready checkout adapter
- Render deployment configuration

## Important
Payment credentials are NOT included. Set them as environment variables on Render. Never commit secret API keys/passwords to GitHub.

## Local setup
1. Install Node.js 20+.
2. Create a PostgreSQL database.
3. Copy `.env.example` to `.env` and fill in `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `BUSINESS_WHATSAPP`.
4. Run `npm install`.
5. Run `npm start`.
6. Visit `/admin` for the dashboard. In this starter, admin authentication is intentionally separated for the next hardening step; production should add a proper admin login route and rate limiting before public launch.

## Render
Render supports Node web services and managed PostgreSQL. Connect this repository, use `npm install` as the build command and `npm start` as the start command. The included `render.yaml` can be used as a starting point.

## Payment
PayFast is included as a configuration-ready hosted checkout path. You must create/verify your merchant account and supply the current production credentials/URLs. Test in sandbox before going live.

Yoco is another South African gateway option; a Yoco integration can be added if that is the provider you choose.

## Production hardening still recommended
- Proper admin authentication/role table
- CSRF protection
- Rate limiting
- Secure session store
- Product image uploads/object storage
- Shipping-rate integration
- Email/SMS order notifications
- Payment webhook signature verification according to the provider's current documentation
- VAT/invoice rules if applicable
- Returns/privacy/terms pages

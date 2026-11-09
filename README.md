# Matcha Cafe Ordering System

This project rebuilds the original Matcha café menu into a QR ordering application with Arabic RTL support, a customer ordering flow, and a protected cashier dashboard.

## Features

- Mobile-first Arabic-first menu for dine-in, takeaway, and delivery orders.
- Product catalog derived from the original HTML prototype.
- Cart, customization, checkout, and confirmation flow.
- MongoDB-backed order persistence and validation.
- Staff dashboard for new, preparing, ready, and completed orders.
- Contact actions for phone and Google Maps.
- Confirmed receipt preview and browser printing for 58mm and 80mm paper.
- Local role-based staff accounts, shift tracking, and admin user management.
- Staff-managed menu catalog: create and edit products, prices and offers, display order, categories, option groups, and add-on prices; archive entries without removing historical order details.
- Orders are persisted in MongoDB and shown in the cashier dashboard when refreshed.

## Local development

Install dependencies and run the app locally:

```sh
npm install
npm run dev
```

Open `http://localhost:3000` for the customer menu and `http://localhost:3000/dashboard/cashier` for the cashier dashboard.

For local development without a database, set `DATA_PROVIDER=mock` in `.env.local` (or omit it). The app uses in-memory data and does not need a MongoDB connection.

For MongoDB-backed local development, set `DATA_PROVIDER=mongodb` and configure `MONGODB_URI`, `NEXTAUTH_SECRET`, `STAFF_EMAIL`, and `STAFF_PASSWORD` in `.env.local`. MongoDB mode requires the database host to be reachable and its DNS records to resolve; connection failures are reported instead of silently switching to non-persistent mock data. `.env.local` is excluded from Git. The first successful login using `STAFF_EMAIL` and `STAFF_PASSWORD` creates the initial Admin account in MongoDB with a salted password hash. Staff accounts, shifts, expenses, orders, catalog, inventory, and pricing then use MongoDB repositories, so this is the same persistence path used by production. There is no public account-registration endpoint. Configure `STAFF_EMAIL` and `STAFF_PASSWORD` in the hosting environment only for first-account setup if the collection is empty; never commit real credentials.

Without `DATA_PROVIDER=mongodb`, local development uses in-memory mock data. Orders and changes are lost when the server process restarts; mock storage cannot be selected in production. The dashboard checks for order updates every four seconds.

In mock mode, the local demo accounts are:

- Admin: `demo@local.test` / `demo1234`
- Day employee: `day@local.test` / `day12345` (`Matcha_Day_AM`)
- Night employee: `night@local.test` / `night12345` (`Matcha_Night_PM`)

Mock accounts and shift records are held in memory and are lost when the server restarts. To test production persistence locally, use a separate development MongoDB database with `DATA_PROVIDER=mongodb`; never point local testing at production data. Browser receipt printing requires a configured system/browser printer; silent thermal printing is not available through a normal browser. Choose 58mm or 80mm in the receipt preview before confirming print.

An employee shift starts automatically on successful login; refreshing the dashboard restores the current shift without starting another one. Ending a shift or logging out completes the employee's shift for that Cairo business day; another shift cannot be started until the next day. Completed orders are attributed to the employee and active shift that completes them; when an Admin completes an order, it is attributed only if exactly one employee shift covers that time. Admins can view and print a separate report for each completed employee shift, including completed sales, cash/card totals, expenses, net sales, and elapsed time. Employees can view their shift history but cannot access or print shift reports. Older completed orders without a shift ID are included in a report only when their completion timestamp (`updatedAt`) falls unambiguously within that shift; overlapping or otherwise ambiguous orders are not misattributed and are flagged in the report. Historical expenses without a saved shift ID are not retroactively assigned.

Inventory is deducted automatically for products and recipe ingredients once a positive opening balance or a low-stock threshold is recorded; no per-item deduction checkbox is required. Items with no recorded stock balance remain available for sale until initialized, so an unknown zero balance does not unexpectedly stop orders.

The menu is seeded in `lib/menu-data.ts`. Order storage is isolated behind `lib/order-repository.ts`.

Menu changes are managed from the cashier dashboard. In local mock mode they last while the server process is running; with MongoDB the catalog is stored in the `cafe_settings` collection. Product and category removal is a reversible archive/hide action so existing orders keep their original item snapshots. The Expenses section records electricity, water, food/raw materials, supplies, maintenance, rent, and other costs by date, shift, and employee in the `cafe_expenses` collection. Employees can record their own expenses; Admin can review and delete all records and manage staff profiles and passwords.

## Production build

npm run build

Run the checks before deployment:

```sh
npm run typecheck
npm test
npm run lint
```

## Deployment

This app can be deployed to Vercel as a Next.js application. Use Node.js 22 (the project requires Node.js 20.19 or newer). Set these variables in the Vercel Production environment:

- `DATA_PROVIDER=mongodb`
- `MONGODB_URI`
- `NEXTAUTH_SECRET` (at least 32 random characters; generate a unique value)
- `CRON_SECRET` (at least 32 random characters; authorizes the scheduled weekly deletion of every order)
- `STAFF_EMAIL` (initial staff account email; used only to bootstrap the first account if `staff_accounts` is empty)
- `STAFF_PASSWORD` (at least 12 characters; initial account password, stored in MongoDB as a salted hash)

The MongoDB deployment must support multi-document transactions because inventory changes and order creation/cancellation are transactional. MongoDB Atlas supports this; for another host, use a replica set. Configure network access for Vercel and a least-privilege database user. Use separate credentials and preferably a separate database for Preview deployments. Production does not fall back to mock data.

Vercel runs `/api/cron/clear-orders` every Sunday at 00:00 UTC. The endpoint requires the `CRON_SECRET` bearer token and deletes every document in the `orders` collection; this permanently removes order history, so export any records you need before the scheduled run. It does not delete catalog, inventory, pricing settings, or staff accounts. Deleted MongoDB storage is generally reusable by the database, but this does not necessarily reduce Atlas's already allocated storage immediately.

## Pricing rules

The server uses the catalog's base product price plus every selected add-on price, multiplied by the item quantity. Service fees and tax are disabled by default and can be independently enabled and configured (0–100%) in the cashier dashboard. When enabled, service is calculated from the subtotal and tax from the subtotal plus service; amounts are rounded to two decimal places. The browser uses the same calculation function for the cart preview, and the server recalculates totals using the saved settings at submission time. In local mock mode, settings last while the server process is running; with MongoDB they are stored in the `cafe_settings` collection.

## Production checklist

- Confirm the production build, tests, typecheck, and lint all pass.
- Configure backups and retention for the MongoDB database.
- Verify dine-in/table and takeaway checkout flows against production catalog and prices.
- Configure monitoring and an external rate limit for public order creation and staff login before opening the app to untrusted traffic.
- Online card processing is not integrated; orders currently record the selected payment method only.
- The cashier dashboard polls every four seconds; push-based realtime notifications are not implemented.

## Data migration notes

The original HTML file includes product names, categories, and options that have been captured into the seeded catalog. The application keeps Arabic product names and prices as originally provided.

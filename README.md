# Matcha Café Ordering System

An Arabic-first, right-to-left ordering and café operations app. Customers can browse the menu and place dine-in, takeaway, and delivery orders; staff use a protected dashboard to manage orders, shifts, expenses, inventory, and the menu.

## Features

- Responsive Arabic menu with product search, categories, customizations, and cart.
- Dine-in, takeaway, and delivery checkout with server-side validation and pricing.
- Staff dashboard for order preparation, status updates, and receipt printing.
- Employee accounts, automatic shift tracking, and per-shift sales and expense reports.
- Menu and add-on management, ingredient recipes, stock deductions, and low-stock monitoring.
- Customer directory with order history summaries, contact actions, follow-up notes, and contact status.
- Configurable service charge and tax.
- In-memory mock data for local development and MongoDB persistence for production.

## Technology

- Next.js 16 App Router, React, TypeScript, and Tailwind CSS.
- MongoDB with Mongoose for persistent production data.
- Vitest and ESLint for tests and code quality.

## Requirements

- Node.js 20.19 or newer (Node.js 22 recommended).
- npm.
- MongoDB configured as a replica set for persistent operation; MongoDB Atlas is supported.

## Run locally

```sh
npm install
npm run dev
```

By default, local development uses in-memory mock data and does not require MongoDB. To set it explicitly, add the following to `.env.local`:

```dotenv
DATA_PROVIDER=mock
```

Open:

- Customer menu: `http://localhost:3000`
- Staff dashboard: `http://localhost:3000/dashboard/cashier`

Mock data, accounts, orders, and settings are held in memory and reset when the server restarts. Demo sign-ins:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `demo@local.test` | `demo1234` |
| Day employee | `day@local.test` | `day12345` |
| Night employee | `night@local.test` | `night12345` |

Use only a separate development database when testing persistent data. Never point local development at production.

## Environment configuration

`.env.local` is excluded from Git. `.env.example` contains placeholders for a MongoDB-backed deployment; replace them with unique values and never commit real credentials.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATA_PROVIDER` | Production | Set to `mongodb`. Mock mode is development-only. |
| `MONGODB_URI` | MongoDB mode | Connection string for the application database. |
| `NEXTAUTH_SECRET` | MongoDB mode | Unique secret of at least 32 characters used to sign staff sessions. |
| `CRON_SECRET` | If the Vercel cleanup schedule remains enabled | Random token of at least 32 characters used to authorize the order cleanup request. |
| `STAFF_EMAIL` | Initial account setup | Email for creating the first Admin account when no staff account exists. |
| `STAFF_PASSWORD` | Initial account setup | Initial Admin password; use at least 12 characters. |

The initial Admin credentials are used to bootstrap the first account only. The password is stored as a salted hash. There is no public account-registration endpoint. Once the first Admin is created, manage staff accounts from the dashboard.

In MongoDB mode, connection errors are reported rather than silently switching to mock storage. Production requires `DATA_PROVIDER=mongodb`.

## Project structure

```text
app/
  api/                 API route handlers
  dashboard/cashier/   Staff dashboard route
  globals.css          Global styles
  layout.tsx           Root layout and metadata
components/            Customer menu and dashboard UI
lib/                   Domain logic, validation, and data repositories
  store.test.ts        Unit and integration-focused tests
public/                App-served static assets
docs/
  brand/               Café brand and design references
  reference/           Original menu prototype
```

The menu's initial catalog is defined in `lib/menu-data.ts`. Order, shift, inventory, and expense persistence is handled through the repositories in `lib/`.

## Staff and operations

- An employee's assigned day or night shift starts automatically after successful login. Refreshing the dashboard restores the current shift.
- Ending a shift or logging out closes that employee's shift for the Cairo business day; another shift can begin the following day.
- If an employee's shift was ended or logged out by mistake, an Admin can reactivate that same shift from today's shift record, provided the employee has no other active shift. The shift keeps its original ID and day/night assignment; its report adds the work periods while excluding the time between closing and reactivation.
- Completed orders are attributed to the employee and shift that completes them. Admin-completed orders are assigned only when exactly one employee shift matches the completion time.
- Admins can view and print a separate report for each completed shift; employees can print reports for their own shifts only. Ambiguous legacy orders are not misattributed and are flagged; historical expenses without a shift ID are not retroactively assigned.
- A customer phone number is required with every new order. The customer directory groups order history by normalized phone number and lets signed-in staff track follow-up status, notes, and the last contact time. Existing orders with phone numbers are included.
- Inventory is deducted automatically after a positive opening balance or low-stock threshold is recorded. Items without a recorded balance remain sellable until initialized.
- Product and category removal is reversible: entries are hidden while historical order snapshots remain intact.
- Service charges and tax are disabled by default. When enabled, service is calculated on the subtotal, then tax on the subtotal plus service. The server recalculates totals at checkout.
- The dashboard refreshes order and shift data every four seconds.

## Commands

```sh
npm run dev        # Start the development server
npm run build      # Create a production build
npm run start      # Start the production server
npm run typecheck  # Run TypeScript checks
npm test           # Run Vitest
npm run lint       # Run ESLint
```

Run all checks before deployment:

```sh
npm run typecheck
npm test
npm run lint
npm run build
```

## Deploy to Vercel

1. Connect the repository to Vercel and use Node.js 22.
2. Set the production environment variables listed above.
3. Configure MongoDB network access for Vercel and use a least-privilege database user.
4. Use a replica-set deployment because order creation, cancellation, and inventory updates use transactions.
5. Use separate credentials and preferably a separate database for Preview deployments.
6. Run the production checks and verify checkout, staff login, stock deductions, and receipts against the production catalog.

### Scheduled order cleanup

`vercel.json` schedules `/api/cron/clear-orders` for Sundays at 00:00 UTC. When configured with `CRON_SECRET`, this endpoint permanently deletes **all documents in the `orders` collection**. It does not delete staff, catalog, inventory, or pricing data. Export any order history that must be retained before enabling the schedule; remove or change the cron configuration if automatic deletion is not intended.

## Known limitations

- Card is recorded as the selected payment method; online card processing is not integrated.
- Receipt printing uses the browser's print dialog and requires a configured printer. Silent thermal printing is not supported.
- The cashier dashboard uses polling rather than push-based realtime updates.

## Design references

The brand guide and original menu prototype are retained under [`docs/`](./docs/).

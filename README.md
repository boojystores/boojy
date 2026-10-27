# Boojy Storefront & Admin

Modern, high-performance e-commerce platform and management dashboard for **Boojy**, a contemporary clothing and lifestyle brand. Built with [Next.js](https://nextjs.org), [Supabase](https://supabase.com), and integrated with [Bachs.io](https://bachs.io) for secure online payments.

---

## Overview

Boojy provides a frictionless, premium shopping experience for customers and an administrative dashboard for order fulfillment, inventory tracking, product management, and delivery logistics.

- **Storefront**: Guest-first shopping with persistent bag management, size variant selections, dynamic Nigerian shipping calculations, store pickup hubs, and instant online checkout.
- **Admin Portal** (`/admin`): Role-gated dashboard for tracking sales, updating order fulfillment states, managing clothing collections and imagery, configuring delivery zones, and downloading order reports.

---

## Core Features

### 🛍️ Storefront
- **Modern Catalog**: Curated apparel collections with live search, category filters, and sorting.
- **Product Details & Sizing**: Multi-image product showcases, clothing size selector (e.g. S, M, L, XL, XXL), and real-time inventory validation.
- **Persistent Shopping Bag**: Powered by Zustand and local storage with automatic catalog synchronization.
- **Dynamic Nigerian Delivery & Pickups**: Real-time shipping calculation across Nigerian States and LGAs, custom delivery zones, and free Store Pickup locations.
- **Bachs Payment Gateway**: Seamless card, bank transfer, and USSD payments with webhook verification and automatic status reconciliation.
- **Inventory Protection Flow**: Stock availability is validated at checkout, but inventory is **deducted only after payment is confirmed**. Abandoned, cancelled, or failed checkouts never deplete store inventory.
- **Order Tracking & Receipts**: Real-time order tracking and downloadable PDF customer receipts with full order and delivery details.

### ⚙️ Admin Dashboard (`/admin`)
- **Key Metrics & KPIs**: Live metrics covering total revenue, order volume, pending fulfillment, customer counts, and product catalog health.
- **Product Management**: Create, edit, and archive products; multi-image uploads with automatic server-side WebP optimization; size variants and stock counts.
- **Order Processing**: End-to-end lifecycle management (`pending → confirmed → preparing → shipped → completed`) with automated stock restoration upon cancellation.
- **Logistics & Locations**: Manage delivery zones, state/LGA shipping rates, and physical store pickup hubs.
- **Data Export**: One-click CSV export for order fulfillment and accounting.

---

## Technology Stack

- **Framework**: [Next.js 16](https://nextjs.org) (App Router, Server Components, Server Actions)
- **Database & Auth**: [Supabase](https://supabase.com) (PostgreSQL with Row Level Security, SSR Cookies, Realtime)
- **Payment Gateway**: [Bachs.io](https://bachs.io) via `@bachs/sdk`
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Styling**: Tailwind CSS & Radix UI primitives
- **Testing**: [Vitest](https://vitest.dev) (216+ automated unit tests across 23 test suites)

---

## Getting Started

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/boojystores/boojy.git
cd boojy
npm install
```

### 2. Environment Configuration

Create a `.env.local` file in the root directory:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Bachs.io Payment Gateway
BACHS_SECRET_KEY=sk_live_...
BACHS_WEBHOOK_SECRET=whsec_...
BACHS_ENVIRONMENT=production

# Public Site URL
NEXT_PUBLIC_SITE_URL=https://boojy.vercel.app

# Image Storage (Optional / Cloudinary)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### 3. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Starts the Next.js development server |
| `npm run build` | Builds the production bundle |
| `npm run start` | Starts the production server |
| `npm run lint` | Runs ESLint checks |
| `npm test` | Runs the test suite via Vitest (216 tests) |

---

## Database & Migrations

Database schema and functions are version-controlled under `supabase/migrations/`.

To apply migrations using the Supabase CLI:

```bash
supabase db push
```

Key database functions and triggers:
- `place_order`: Validates cart line items, customer details, and shipping rate calculations; creates the pending order without pre-deducting inventory.
- `confirm_bachs_payment`: Validates charge amount and currency; atomically marks the order paid and deducts inventory inside a single transaction.
- `transition_order_status`: Enforces legal order state transitions and restores stock on cancellation.
- `handle_bachs_payment_failure`: Manages failed or expired payment sessions safely without phantom inventory changes.

---

## Project Structure

Feature-driven layout where domain logic, server actions, components, and tests are grouped together:

```
app/                      # Next.js App Router routes & API endpoints
├── (storefront)/         # Customer-facing routes (catalog, bag, checkout, tracking)
├── admin/                # Role-protected management dashboard
└── api/                  # API routes (webhooks, payment handoff bridge)
features/
├── admin/                # Admin features (KPIs, order manager, catalog manager)
├── cart/                 # Persistent shopping bag and reconciliation hooks
├── catalog/              # Product browsing, filters, sorting, and detail views
├── checkout/             # Checkout form, validation, and Bachs redirect logic
├── shipping/             # Nigerian state/LGA calculations and pickup hubs
└── tracking/             # Order status tracking and PDF receipt generation
components/               # Shared UI elements and Boojy brand preloader
lib/                      # Supabase clients, Bachs client, and utility helpers
supabase/migrations/      # Versioned SQL migrations and RLS policies
```

---

## Testing

Run the Vitest test suite:

```bash
npm test
```

Unit tests cover:
- Catalog filtering, sorting, and pagination.
- Cart persistence and real-time inventory reconciliation.
- Checkout validation and Bachs payment gateway redirection.
- Webhook signature verification and atomic payment confirmation.
- Admin order lifecycle transitions and automated stock restoration.

# Airport Operations Dashboard

A multi-tenant React web application for airport operations reporting. Each site (airport) gets isolated access to its own flight data through a configurable, JWT-secured interface.

---

## Project Overview

The Airport Operations Dashboard connects to the APVe flight information system and presents operational data through a suite of purpose-built reports. It supports multiple airports (sites) from a single deployment, with per-site field configuration, role-based access control, and export capabilities for Excel and PDF.

---

## Tech Stack

### Frontend
| Library | Version | Purpose |
|---|---|---|
| React | 18.2 | UI framework |
| TypeScript | 5.3 | Type safety |
| Vite | 5.1 | Build tool and dev server |
| Tailwind CSS | 3.4 | Utility-first styling |
| Zustand | 4.5 | Global state management (session, sites, reports) |
| Recharts | 2.12 | Charts (bar, line, area, scatter, pie) |
| date-fns | 3.3 | Date parsing and arithmetic |
| lucide-react | 0.344 | Icon library |
| react-router-dom | 6.22 | Client-side routing |
| react-hot-toast | 2.4 | Toast notifications |
| react-datepicker | 6.2 | Date range picker |
| axios | 1.6 | HTTP client |
| xlsx | 0.18 | Excel export |
| jspdf + jspdf-autotable | 4.2 / 5.0 | PDF export |

### Backend
- **Node.js / Express** — REST API server (`api/`)
- **Azure SQL Database** — Persistence for sites, admins, reports, field definitions, and audit log
- **mssql** — SQL Server driver

### Infrastructure
- **Docker** — Multi-stage build (frontend + API compiled into a single image)
- **Azure Container Registry (ACR)** — Container image storage
- **Azure Container Apps** — Serverless container hosting with auto-scaling

---

## Architecture

```
Browser (React SPA)
    │
    │  HTTP (same origin in prod)
    ▼
Express API  (api/src/index.ts, port 8080 in prod)
    ├── /api/auth        JWT login (admin + site users)
    ├── /api/sites       Site CRUD (admin only)
    ├── /api/sites/:id/fields  Per-site field definitions
    ├── /api/reports     Saved custom reports
    ├── /api/admins      App admin management
    └── /api/proxy       Server-side proxy to APVe API
            │
            ▼
      APVe Flight API (external, per-site base URL)
            │
            ▼
      Azure SQL Database (sites, reports, field_definitions, app_admins, audit_log)
```

In production, the Express server serves the compiled React SPA from `/dist` as static files and handles all API calls. There is no separate frontend server.

In development, Vite runs on port 5173 and Express runs on port 3001, with CORS enabled for local origins.

### Authentication Flow

1. User visits `/login` and enters credentials.
2. The backend exchanges credentials with the APVe API to obtain an `accessToken` and `publicAccessToken`.
3. The backend issues a **site JWT** containing the site context and token data, signed with `JWT_SECRET`.
4. App admins receive a separate **admin JWT** that grants access to all sites and the `/admin` panel.
5. On protected routes, the JWT is sent in the `Authorization: Bearer` header.
6. The `ProtectedRoute` component redirects unauthenticated users to `/login`. The `AdminRoute` component further restricts admin-only pages.

### Multi-Tenancy

Each site is identified by a `siteId` and has its own:
- APVe base URL and credentials
- Field definitions (which raw data fields map to report columns)
- Saved custom reports (owned by `siteId`)
- localStorage namespace for field configuration

App admins can switch between sites using the admin panel and create template reports that are cloned to sites.

---

## Reports

### OTP Scorecard (`/reports/otp-scorecard`)
Ranks airlines by On-Time Performance percentage. Displays a ranked table with color-coded badges (Excellent ≥90%, Good ≥80%, Fair ≥65%, Poor <65%), a bar chart of OTP by airline, and a scatter plot of OTP vs. volume. Identifies top and bottom performers.

### Delay Analysis (`/reports/delay-analysis`)
Configurable delay breakdown across the fleet. Shows KPIs (total delayed, average delay, cancellation rate), a status distribution pie chart, delay distribution by band (1-15, 16-30, 31-60, 61-120, 120+ minutes), delay by scheduled hour, and a ranked table of most-delayed flights. The actual time field name is configurable.

### Airline Performance (`/reports/airline-performance`)
Per-airline operational statistics. Shows a summary table of on-time, delayed, and cancelled counts per airline with average delay, a comparative bar chart, and overall airport KPIs. Useful for SLA monitoring and airline benchmarking.

### Gate Utilization (`/reports/gate-utilization`)
Gate occupancy analysis. Computes gate occupancy duration as the difference between arrival actual and departure actual times. Displays a Gantt-style bar chart of gate activity, occupancy by concourse, and a ranked gate utilization table. Field names for arrival/departure gate, scheduled, and actual times are all configurable.

### Taxi Time (`/reports/taxi-time`)
Measures ground movement efficiency for both arriving and departing aircraft.
- **Taxi-In**: time from landing (`actualtime`) to on-chocks (`onchk`) — SLA target 15 minutes.
- **Taxi-Out**: time from off-block (`ofchk`) to takeoff (`actualtime`) — SLA target 20 minutes.

Shows KPI cards, bar charts by airline, hourly trend lines, and scatter plots. All six field names are configurable.

### Baggage Belt (`/reports/baggage-belt`)
Arrival baggage delivery performance at the belt level. Tracks time-to-first-bag (SLA: 20 min), belt active duration (SLA: 30 min), and total delivery time (SLA: 45 min). Displays SLA breach rates, per-belt performance bars, trend lines, and a detailed flight table. Fields for first bag time, last bag time, and belt identifier are configurable.

### Baggage Performance (`/reports/baggage-performance`)
Per-carousel breakdown of delayed arrivals. Groups flights by baggage claim carousel and computes on-time vs. delayed counts and average delay by claim. Arrivals only. The claim field name is configurable.

### Passenger Flow (`/reports/passenger-flow`)
Estimates hourly passenger volume using a default of 150 passengers per flight movement (industry narrow-body average). Shows hourly area charts for deplaning (arrivals) and boarding (departures), concourse congestion levels, and peak hour identification. Congestion is rated Low/Moderate/High/Critical based on relative load.

---

## Field Configuration System

Each report that relies on non-standard data fields exposes a **Field Configuration** panel (gear icon). Users enter the raw field names that exist in their site's APVe data feed, then click **Apply** to update the report calculations without a page reload.

These settings are stored per-site in `localStorage` using a namespaced key, so each site's configuration persists across browser sessions without requiring a backend round-trip.

Built-in fields (`linecode`, `number`, `adi`, `gate`, `schedule`, `actual`, `status`, `delayMinutes`, `claim`, `scheduleDate`) are always available. Custom field definitions can be created through the Report Designer and stored in Azure SQL per site.

---

## Authentication

| Role | Access |
|---|---|
| App Admin | Full access to all sites, admin panel, site/report/admin CRUD |
| Site Admin | Full access to their site's reports and field definitions |
| Site User | Read-only access to their site's active reports |

Login credentials are validated against the APVe external API. App admin credentials are stored in Azure SQL (`app_admins` table) with bcrypt-hashed passwords.

---

## Development Setup

### Prerequisites
- Node.js 20+
- npm 9+

### Frontend
```bash
# From project root
npm install
npm run dev         # starts Vite dev server on http://localhost:5173
```

### API
```bash
cd api
npm install
# Copy and configure environment variables
cp .env.example .env
# Edit .env with your SQL connection string and JWT secret
npm run dev         # starts Express on http://localhost:3001
```

### Environment Variables

#### Frontend (`.env.local`)
| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | API base URL (e.g., `http://localhost:3001/api` in dev) |

#### API (`api/.env`)
| Variable | Description |
|---|---|
| `SQL_CONNECTION_STRING` | Full Azure SQL connection string |
| `JWT_SECRET` | Secret for signing JWTs (min. 32 characters) |
| `PORT` | Server port (default: `3001`; `8080` in production) |
| `NODE_ENV` | `development` or `production` |

---

## Deployment

The application is packaged as a single Docker image containing both the compiled React SPA and the Express API.

### Build and Push to Azure Container Registry
```bash
# Build and push (replace values as appropriate)
az acr build \
  --registry <your-acr-name> \
  --image airport-reports:latest \
  .
```

### Deploy to Azure Container Apps
```bash
az containerapp update \
  --name <app-name> \
  --resource-group <resource-group> \
  --image <your-acr-name>.azurecr.io/airport-reports:latest
```

### Required Container Environment Variables
| Variable | Value |
|---|---|
| `SQL_CONNECTION_STRING` | Azure SQL connection string |
| `JWT_SECRET` | Secure random string (32+ chars) |
| `NODE_ENV` | `production` |
| `PORT` | `8080` |

The Dockerfile uses a multi-stage build:
1. **Stage 1** — Builds the React frontend with Vite (`npm run build` → `/dist`)
2. **Stage 2** — Compiles the TypeScript API (`npm run build` → `api/dist`)
3. **Stage 3** — Final minimal image: copies both build outputs, exposes port 8080, and runs `node api/dist/index.js`

---

## Project Structure

```
airport-reports/
├── src/
│   ├── pages/          # One file per report page + auth pages
│   ├── components/     # Shared UI (Layout, FilterBar, ExportMenu, etc.)
│   ├── store/          # Zustand stores (session, sites, reports, settings)
│   ├── hooks/          # useFlights and other data-fetching hooks
│   ├── types/          # TypeScript types and constants (index.ts)
│   └── App.tsx         # Router and top-level auth guards
├── api/
│   └── src/
│       ├── routes/     # Express route handlers (auth, sites, fields, reports, admins, proxy)
│       ├── db.ts       # Azure SQL connection and migration runner
│       └── index.ts    # Express app entry point
├── Dockerfile          # Multi-stage production build
├── package.json        # Frontend dependencies
└── .env.local          # Frontend environment variables (not committed)
```

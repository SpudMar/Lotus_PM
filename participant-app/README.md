# Lotus PM — Participant App

React Native (Expo) mobile app for NDIS participants to view their plan budget, invoice status, and communications.

**REQ-018** · **REQ-012 (WCAG 2.1 AA)** · **REQ-016 (encrypted storage)**

---

## Screens

| Screen | Description |
|--------|-------------|
| Login | NDIS number + PIN authentication |
| Budget | Active plan with category-level spend progress bars |
| Invoices | Invoice list with processing status |
| Messages | Communications log from plan managers |
| Profile | Account details and sign-out |

---

## Setup

```bash
# Install dependencies (from participant-app/ directory)
npm install

# Start Expo dev server
npm start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android
```

---

## Configuration

Set the API base URL before building:

```bash
# .env (not committed — copy from .env.example)
EXPO_PUBLIC_API_URL=https://planmanager.lotusassist.com.au
```

For local development against the dev server:

```bash
EXPO_PUBLIC_API_URL=http://localhost:3000
```

---

## Accessibility

WCAG 2.1 AA compliance (REQ-012):

- All interactive elements have `accessibilityLabel` and `accessibilityRole`
- Progress bars use `accessibilityRole="progressbar"` with `accessibilityValue`
- Form fields use `accessibilityLabelledBy` to link labels to inputs
- Error messages use `accessibilityLiveRegion="polite"`
- Loading states use `accessibilityLabel` on `ActivityIndicator`
- Status badges include full context in the parent element's `accessibilityLabel`

---

## Architecture

```
participant-app/
├── App.tsx                    # Root — auth gate, navigation container
├── src/
│   ├── api/
│   │   └── client.ts          # Fetch wrapper + SecureStore token management
│   ├── hooks/
│   │   └── useAuth.ts         # Auth state hook
│   ├── navigation/
│   │   └── TabNavigator.tsx   # Bottom tab navigator (Budget/Invoices/Messages/Profile)
│   ├── screens/
│   │   ├── LoginScreen.tsx    # NDIS number + PIN login
│   │   ├── BudgetScreen.tsx   # Active plan + category spend breakdown
│   │   ├── InvoicesScreen.tsx # Invoice list with status
│   │   ├── MessagesScreen.tsx # Communication log
│   │   └── ProfileScreen.tsx  # Account info + sign-out
│   └── types/
│       └── index.ts           # Shared TypeScript types
├── app.json                   # Expo config (bundle ID, scheme, plugins)
├── tsconfig.json              # Strict TypeScript
└── babel.config.js            # Expo preset
```

---

## API endpoints required (Phase 2)

These participant-specific API routes need to be built in the Next.js backend:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/participant/auth/login` | POST | Authenticate participant with NDIS number + PIN |
| `/api/participant/plan/active` | GET | Get participant's active plan with budget lines |
| `/api/participant/invoices` | GET | List participant's invoices |
| `/api/participant/messages` | GET | List communications for participant |
| `/api/participant/documents` | GET | List participant's documents |

> These endpoints are **not yet built** — this app is the frontend skeleton.
> Build the participant API routes in Phase 2 when the mobile app is ready for testing.

---

## Notes

- `expo-secure-store` used for JWT token storage — never AsyncStorage for auth tokens
- All API calls use HTTPS — enforced by the API client
- Data stays in AWS ap-southeast-2 (REQ-011) via the backend; the app itself holds no persistent data beyond the auth token

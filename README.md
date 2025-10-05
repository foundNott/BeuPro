# Her Choice PH — Local backend (Node + SQLite)

This workspace contains a minimal static frontend and a simple Node.js + SQLite backend for demo purposes.

What I added

This project now uses Supabase for backend persistence and the static site in the repository serves the admin UI.

Quick setup (fish shell)

1) Install Node.js (if you don't have it). On many Linux distros you can install Node 18+ via your package manager or nvm.

2) From the workspace root, install dependencies:

```fish
cd /home/kyusi/Downloads/BeuPro
npm install
```

3) Start the server (development):

```fish
cd /home/kyusi/Downloads/BeuPro
npm install
npm start    # starts the included minimal static server (writes .server.pid)
```

To stop the server that was started with `npm start` run:

```fish
npm stop
```

The dev server listens on http://localhost:3000 by default.

API endpoints (examples)

- GET /api/orders — list orders (oldest-first)
- POST /api/orders — create order (body: JSON with fullname, phone, address, cart, total, ...)
- POST /api/orders/dequeue — pop oldest order and return it

- GET /api/deliveries — list deliveries
- POST /api/deliveries — schedule delivery (body: {date, time, note})
- POST /api/deliveries/dequeue — pop oldest delivery

- GET /api/couriers — list couriers
- POST /api/couriers — add courier (body: {name, vehicle})
- POST /api/couriers/dequeue — pop oldest courier

- GET /api/comments — list visible comments
- POST /api/comments — add a comment (body: {author, body})
- POST /api/comments/hide — hide a comment (body: {id})

Sample requests (fish)

```fish
# create a courier
curl -X POST http://localhost:3000/api/couriers -H 'Content-Type: application/json' -d '{"name":"Juan","vehicle":"Motorbike"}'

# list couriers
curl http://localhost:3000/api/couriers

# enqueue an order
curl -X POST http://localhost:3000/api/orders -H 'Content-Type: application/json' -d '{"fullname":"Ana", "phone":"0917", "address":"Street 1", "cart":{}, "total":1000}'
```

Notes & next steps

- The provided frontend pages currently use localStorage for demo queues. I can update the admin pages and cart page to talk to these HTTP endpoints instead (recommended).
- The `beupro.sqlite` database file will be created automatically next to `server.js` when you first run the server.
- If you want me to run `npm install` and start the server here, I can attempt it now — tell me to proceed and I'll run the appropriate fish commands.

Security & deployment

- This demo is not hardened for production. If you plan to deploy, add input validation, authentication, rate-limiting, and TLS.

To run a local static server for testing:

1. Install a tiny static server if you don't have one: `npm install -g http-server` (or use the included npm script which uses `npx`).
2. Run `npm start` which will serve the folder on port 3000 by default.

Configuration:
- Provide a `public/js/supabase-config.js` (copy `public/js/supabase-config.example.js`) and fill in your Supabase project URL and anon key.
- Apply the RLS policies in `supabase-policies.sql` in your Supabase SQL editor if you want permissive client access for this demo.

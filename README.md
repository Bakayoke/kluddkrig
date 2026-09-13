# Kluddkrig

Färgglad party-brawler — rita din fighter, styr via mobilen, dunka kompisarna på TV:n.

**Domän:** [kluddkrig.com](https://kluddkrig.com)

## Koncept (hybrid)

1. **Lobby** — skapa rum, visa QR på stor skärm, spelare går med via mobilen  
2. **Doodle** — varje spelare ritar en avatar och trycker Klar när man är nöjd (ingen tidsgräns)  
3. **Fight (≈75 s)** — hoppa, slå, styr; samla lootlådor för sabotage-abilities  
4. **Results** — poängrace över flera korta rundor (inte last-man-standing)

### Kontroller (mobil)

- Vänster / höger  
- Hoppa  
- Slå  
- Använd loot (när du plockat upp en låda)

### Loot-abilities (v1)

| Ability | Effekt |
|---------|--------|
| `teleport` | Flytta en random motståndare till random ställe |
| `freeze` | Frys en motståndare kort |
| `invert` | Spegelvänd styrning |
| `giant` | Du blir större / starkare en stund |
| `inkblot` | “Blinda” en motståndare kort |

Banor: handgjorda layouts (`platforms`, `pit`, `bridge`) — en slumpas per runda.

Fight-fasen tickar på servern (~20 Hz); telefonen skickar intents (`move`, `jump`, `punch`, `ability`). TV:n interpolerar via room-snapshots.

## Stack

- **Client:** React + Vite → Cloudflare (`wrangler`)
- **Server:** Express + Socket.io → Railway
- **Persist:** Redis (rum överlever restart)

## Lokal utveckling

```bash
npm install
npm install --prefix client
npm run dev
```

Öppna http://localhost:5173 — API på :3001.

## Produktion

### Railway (API + sockets)

1. Skapa tjänst från GitHub-repot (Node start: `npm start`)
2. Lägg till Redis-plugin och koppla `REDIS_URL`
3. Sätt bland annat:
   - `PUBLIC_APP_URL=https://kluddkrig.com`
   - `CORS_ORIGIN=https://kluddkrig.com,https://www.kluddkrig.com`
4. Verifiera: `GET /api/health` → `persist.configured: true`

Utan Redis försvinner rum vid restart. Alternativ: volume + `KLUDDKRIG_DATA_DIR=/data`.

### Cloudflare (frontend)

```bash
npm run deploy:cf
```

Sätt `VITE_SOCKET_URL` till Railway-URL:en i `client/.env.production` före client-build.  
Koppla custom domain `kluddkrig.com` / `www` i Cloudflare.

## Status

Party-shell + placeholder-fysik/arena är på plats. Nästa steg: riktig plattformsfysik, polish, balans och snyggare doodle→fighter-rendering.

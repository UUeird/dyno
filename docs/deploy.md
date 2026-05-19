# Deploying Dyno

This is the step-by-step guide for a clean deploy. We use:

- **Frontend**: Vercel
- **Backend**: Render
- **Database**: MongoDB Atlas (free M0 tier)
- **Auth**: Clerk
- **Photo storage**: Cloudinary

The first deploy will take a focused hour or two, mostly clicking through dashboards. After that, deploys are just `git push`.

---

## 1. MongoDB Atlas (database)

1. Sign up at [cloud.mongodb.com](https://cloud.mongodb.com) (free tier — no credit card needed).
2. Create a new **Project** (e.g. "Dyno"). Inside the project, click **Build a Database** and pick the **Free / M0** tier. Pick the region closest to where your backend will run.
3. While the cluster provisions, create a **Database User** (Security → Database Access):
   - Choose **Password** auth
   - Generate a strong password and save it somewhere
   - Built-in role: **Atlas admin** (fine for one-app use; tighten later)
4. **Network Access** → Allow access from anywhere (`0.0.0.0/0`). Render's IPs change so we can't allowlist them specifically. Production auth still requires the database user's password, so this is the standard pattern for free-tier deploys.
5. Once the cluster is **Active**, click **Connect** → **Drivers** → **Node.js**. Copy the connection string, which looks like:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. **Add the database name** to the URI before `?`:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/carsDB?retryWrites=true&w=majority
   ```
   Save this — it's `MONGODB_URI` later.

---

## 2. Clerk (production instance)

You currently have a Clerk **Development** instance (the `pk_test_` / `sk_test_` keys). For production we need to switch to **Production** keys.

1. In the Clerk dashboard, top-left dropdown → **Create Production instance** (or you may have one already)
2. Add your future production domain (you can use the Vercel auto-generated `*.vercel.app` URL initially, swap to your real domain later)
3. From **API Keys** (Production instance), copy:
   - `pk_live_...` → becomes `REACT_APP_CLERK_PUBLISHABLE_KEY` on Vercel
   - `sk_live_...` → becomes `CLERK_SECRET_KEY` on Render
4. Make sure **Magic link** is the only enabled sign-in method (same as dev)

Until production is set up, you can deploy with the dev keys (`pk_test_` / `sk_test_`) — Clerk treats `*.vercel.app` URLs as development-allowed by default. Switch to production keys before sharing with anyone else.

---

## 3. Backend on Render

1. Sign up at [render.com](https://render.com)
2. **New** → **Web Service** → connect your GitHub account → pick the `dyno` repo
3. Configure:
   - **Name**: `dyno-api` (or similar)
   - **Region**: Same as your Atlas cluster
   - **Branch**: `main` (or whichever branch you want deployed)
   - **Root Directory**: `dyno-react-app/backend`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free
4. **Environment Variables** (Render dashboard → Environment):
   - `MONGODB_URI` = the Atlas URI from step 1
   - `CLERK_PUBLISHABLE_KEY` = `pk_test_...` (or `pk_live_...` if production Clerk)
   - `CLERK_SECRET_KEY` = matching secret
   - `CLOUDINARY_URL` = `cloudinary://<key>:<secret>@<cloud-name>`
   - `FRONTEND_ORIGIN` = (fill in after Vercel deploy; e.g. `https://dyno-foo.vercel.app`)
   - `NODE_ENV` = `production`
5. **Health Check Path**: `/healthz`
6. Click **Create Web Service**. First deploy takes 3–5 minutes.
7. Once it says "Live", grab the URL (e.g. `https://dyno-api.onrender.com`) — that's your backend.
8. Sanity check: `curl https://dyno-api.onrender.com/healthz` → should return `{"ok":true,"db":"up"}`

**Note on cold starts**: Render's free tier spins down after 15 minutes of inactivity. First request after that takes ~30 seconds. If this matters, the cheapest paid plan ($7/mo) keeps it warm.

---

## 4. Frontend on Vercel

1. Sign up at [vercel.com](https://vercel.com) with GitHub
2. **Add New** → **Project** → import the `dyno` repo
3. Configure:
   - **Framework Preset**: Create React App
   - **Root Directory**: `dyno-react-app`
   - **Build Command**: (default; `npm run build`)
   - **Output Directory**: (default; `build`)
4. **Environment Variables**:
   - `REACT_APP_API_URL` = `https://dyno-api.onrender.com` (your Render URL, no trailing slash, no `/api` suffix)
   - `REACT_APP_CLERK_PUBLISHABLE_KEY` = matching key
5. Deploy. First build takes 2–3 minutes.
6. Grab the URL (e.g. `https://dyno-foo.vercel.app`)
7. **Go back to Render** and set `FRONTEND_ORIGIN` to this URL. Trigger a redeploy of the backend so the new CORS rule takes effect.

---

## 5. Smoke test

1. Visit your Vercel URL
2. Sign up via magic link
3. Confirm `/api/me` returns your Human record (Network tab in browser devtools)
4. Log an experience with a photo upload
5. Verify the photo URL points at `res.cloudinary.com/...`

If anything fails, check:
- Browser console for CORS errors → backend `FRONTEND_ORIGIN` env mismatch
- Render logs for Clerk auth errors → Clerk key mismatch between frontend and backend
- Network tab 503 from `/healthz` → Atlas connection issue (check user/password in URI)

---

## 6. Adding a custom domain (later)

When you buy a domain (Cloudflare Registrar, Namecheap, etc.):

1. In Vercel project settings → **Domains** → add your domain (e.g. `dyno.app`)
2. Vercel shows you DNS records to add (CNAME or A record)
3. Add those at your registrar; propagation takes a few minutes
4. Once Vercel says "Valid Configuration", visit your domain — Vercel auto-provisions HTTPS
5. Update Render: change `FRONTEND_ORIGIN` to the new domain
6. Update Clerk: add the new domain to allowed origins on the production instance
7. (Optional) Subdomain for backend: `api.dyno.app` → CNAME to Render's URL, then update `REACT_APP_API_URL` on Vercel

---

## Re-deploys after the first

Both Vercel and Render auto-deploy on every push to the configured branch. So:

- Push to `main` (or whatever branch each is wired to) → both rebuild and redeploy
- Render shows logs in real time; Vercel shows build progress
- Roll back: each has a "promote previous deploy" button in their dashboard

---

## Operational notes

- **Photos**: Stored in Cloudinary under `dyno/cars/<carId>/` folders. `Photo.cloudinaryPublicId` field tracks the public_id so `DELETE /api/photos/:id` cleans them up. External URLs added via `POST /photos/url` have no public_id and just disappear on DB delete.
- **Database name** in the URI matters. `MONGO_DB` env var is only used as a fallback when `MONGODB_URI` isn't set (i.e. local dev). In production, the database name is baked into the URI.
- **Test backend** uses the dev MongoDB on localhost — Playwright tests do not run against Atlas. Atlas only sees prod traffic.
- **Clerk webhooks** (not yet wired up): if you want backend-side notification when a user updates their Clerk profile (renamed, changed email), set up a webhook later. For now we auto-provision Humans lazily.

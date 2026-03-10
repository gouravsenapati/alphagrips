# AlphaGrips Railway Deploy

## Start command

Railway should run:

```bash
npm start
```

## Required environment variables

Set these in Railway:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `JWT_SECRET`

Optional:

- `PLAYER_PHOTO_BUCKET`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `NODE_ENV=production`

## App structure

The Railway app serves both:

- frontend pages from `/Public/...`
- backend APIs from `/api/...`

Root path:

- `/` redirects to `/Public/index.html`

Health check:

- `/health`

## Post-deploy smoke test

Open these after deploy:

- `/health`
- `/Public/index.html`
- `/Public/login.html`
- `/Public/tournament.html`

Then verify:

- login works
- academy admin loads
- tournament viewer loads
- API calls use the same Railway domain via `/api`

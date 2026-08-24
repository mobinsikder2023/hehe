# Science Bee One-Link Studio V10 — deployment

## Important before deploying
This version is designed for Vercel + Supabase. Vercel currently supports FastAPI/Python, but this production package uses Next.js/Node for the poster renderer because the previous Playwright-based local renderer is not a good fit for Vercel serverless. The renderer uses Satori + resvg and keeps the 2160×2700 poster format, Bengali font, image-first/text-first layouts, fade/darkening, logo and source controls.

Vercel Hobby is free but is restricted to personal/non-commercial use. For a real Science Bee team/commercial deployment, use a Vercel plan that permits that use. Supabase Free currently includes Postgres, Auth and 1 GB Storage, which is suitable for initial testing.

## 1. Create Supabase project
1. Create a Supabase project.
2. Open SQL Editor and run `supabase/schema.sql`.
3. In Authentication → Users, create the 2–3 team accounts yourself. Give each person their own email/password.
4. In Project Settings → API, copy the Project URL, anon key and service-role key.

## 2. Create Vercel project
1. Put this folder in a private GitHub repository.
2. Import the repository into Vercel.
3. Framework preset: Next.js.
4. Add environment variables from `.env.example`.
5. Deploy.

## 3. Environment variables
NEXT_PUBLIC_SUPABASE_URL = Supabase Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY = Supabase anon/publishable key
SUPABASE_SERVICE_ROLE_KEY = Supabase service-role key (server only)
OPENAI_API_KEY = your OpenAI API key
OPENAI_MODEL = gpt-5.6-luna (or a model available to your API account)
PEXELS_API_KEY = optional image-search key
NEXT_PUBLIC_SITE_URL = your Vercel URL or custom domain

Never put SUPABASE_SERVICE_ROLE_KEY or OPENAI_API_KEY in NEXT_PUBLIC_ variables.

## 4. Local test
npm install
npm run dev
Open http://localhost:3000.

## 5. Team workflow
Create users in Supabase Auth. They log in at `/login`. Each person can generate posters. The generated PNG is stored in the Supabase `posters` bucket and the metadata is stored in Postgres. The Share button creates `/share/<token>`, which can be sent to anyone without giving them editor access.

## 6. Storage note
The Supabase Free plan currently includes 1 GB Storage. A 2160×2700 PNG can be several MB, so the free tier is suitable for testing but will eventually fill up. Keep an eye on Storage usage.

## 7. API cost
OpenAI API usage is separate from Vercel/Supabase. Set spending limits/budgets in your OpenAI account.

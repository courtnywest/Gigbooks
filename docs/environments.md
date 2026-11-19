# Dev, test and production

GigBooks runs in three places, so changes can be tried safely before real users see them.

| | What it is | Web address | Database |
| --- | --- | --- | --- |
| **Production** | The live app real users see. Built from the `main` branch. | Your live address (Vercel production) | Production Supabase project |
| **Dev** | Where finished changes are tried out before release. Built from the `dev` branch. | https://gigbooks-git-dev-gigbooks.vercel.app | Dev Supabase project |
| **Test** | Every pull request gets automatic tests plus its own preview link. | The "Preview" link on each pull request | Dev Supabase project |

Outside production, a small badge at the bottom of the screen says **DEV** or **TEST PREVIEW** and which database it's using. If it says **LIVE database**, the dev database isn't connected yet.

The app works out which environment it's in from the web address (see `APP_ENV` at the top of the script in `index.html`). Any address it doesn't recognise counts as production, so the live site can never use the dev database by mistake.

## How a change goes live

1. **Build:** each change is made on its own branch, and a pull request is opened **into `dev`**.
2. **Test:** GitHub runs the automated tests on the pull request, and Vercel posts a preview link. If the tests fail, it isn't merged.
3. **Try it:** once merged into `dev`, the change appears on the dev site, with dev data.
4. **Release:** when `dev` looks good, a pull request from **`dev` into `main`** is opened. The tests run again, and merging it puts everything live.
   - Use **"Create a merge commit"** for release pull requests, not "Squash", so `dev` and `main` stay in step.
5. **Database changes:** a new file in `supabase/migrations` is run in the **dev** SQL Editor first, and in **production** at release time.

## One-time setup: the dev database (about 15 minutes)

1. **Create the dev project:**
   - In Supabase, click **New project** and name it `gigbooks-dev`. The free plan allows two projects.
   - Pick any database password and keep it somewhere safe.
2. **Copy the structure, not the data:**
   - In the **production** project, open **SQL Editor** and paste the contents of [`supabase/dev/export-schema.sql`](../supabase/dev/export-schema.sql). Click **Run**.
   - It returns one cell called `dev_setup_sql`. Copy everything in it: right-click the cell, then **Copy cell content**.
   - In the **dev** project's **SQL Editor**, paste it and click **Run**. It's safe to run more than once.

   This copies tables, security rules, functions, triggers and storage buckets. It never copies anyone's data.
3. **Sign-in settings:**
   - In the dev project, go to **Authentication → URL Configuration**.
   - Set **Site URL** to `https://gigbooks-git-dev-gigbooks.vercel.app`.
   - Add these **Redirect URLs**:
     - `https://gigbooks-git-dev-gigbooks.vercel.app/**`
     - `https://gigbooks-*-gigbooks.vercel.app/**` (for the preview links)
4. **Connect it to the app:**
   - In the dev project, go to **Project Settings → API**.
   - Send Claude the **Project URL** and the **publishable key**. Both are designed to be public, so they're fine to paste.
   - They go into `DATABASES.dev` at the top of `index.html`.
5. **Make a dev account:**
   - Sign up on the dev site with any email.
   - Go to **Settings → Data → Sample data** to fill it with example figures.

### What doesn't work in dev yet

Bank sync (Plaid), reading your Gmail, Ask Giggy's AI answers, the contract reader, emailing invoices, and Stripe all run as Supabase Edge Functions. Those are deployed to the production project only, so in dev those buttons show an error.

To use them in dev, the functions and their secrets have to be deployed to the dev project too. Use **test** keys there (Stripe test mode, the Plaid sandbox), never live ones.

## Recommended GitHub settings

To make sure nothing reaches production without passing the tests:

1. Go to **GitHub → Settings → Branches → Add branch ruleset** (or "Add rule") for `main`.
2. Turn on **Require a pull request before merging**.
3. Turn on **Require status checks to pass**, and choose **test**.

## Sample data

**Settings → Data → Sample data** adds fictional brands, invoices (one late), deals, expenses (some missing receipts), reimbursements, a monthly income goal, and payments spotted in email.

- It's tracked row by row, and **Remove sample data** deletes exactly those rows. That includes anything created from them, such as income logged when a sample invoice is marked paid.
- A banner shows while it's there.
- Remove it before sending real invoices or doing your taxes, because your totals include it while it's in the account.

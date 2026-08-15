# qs-web

Web port of [qs-automation](https://github.com/Gautham-Karuppaiah/quantity-surveyor), the desktop app for marking up construction drawings and counting what's on them.

Upload a set of PDFs, mark the things that need counting, split a sheet into zones, and export the totals as a spreadsheet. Projects live on a server instead of in a file on one machine, so they open in a browser with nothing to install.

Live at [quantity-takeoff.vercel.app](https://quantity-takeoff.vercel.app), or [run from source](#run-from-source).

Still being built. Automatic counting isn't ported yet, so marking is by hand, and an organisation only ever holds one person because there's no way to invite anyone.

## Features

- Organisations and projects. Everything is scoped to an organisation, so separate accounts can't see each other's drawings.
- Manual marking, with a legend of symbols and hotkeys to switch the active entry.
- Sections and zones. Split a sheet into named areas, each carrying its own counts.
- Counts panel, legend entries across the top and areas down the side.
- Multiple drawings per project, with pages marked off as they're finished.
- Export to xlsx, laid out as a bill of quantities and broken down by section and zone.
- Undo and redo.

## Run from source

Node 22, a Supabase project, and an S3 bucket.

`web/.env.local`:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_API_URL=http://localhost:8787
```

`api/.env`:

```
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
AWS_REGION=
S3_BUCKET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
PORT=8787
```

```bash
npm --prefix api install && npm --prefix api run dev
npm --prefix web install && npm --prefix web run dev
```

The bucket's CORS has to allow whatever origin the app is served from, and that origin has to be in Supabase Auth's redirect list.

## Stack

- React and TypeScript, built with Vite.
- TanStack Query for data fetching and caching, TanStack Router for routing.
- Supabase for Postgres, auth and row-level security.
- pdfium via WebAssembly for page rendering, in a web worker.
- Konva for the marker layer over the canvas.
- Tailwind and shadcn/ui for the interface.
- Express and AWS S3 for file upload and download.
- ExcelJS for spreadsheet export.

## Planned

- Automatic counting, running the desktop's matcher as a service.
- Background removal.
- Member invitations. Organisations already hold multiple members, there's just no way to add one.
- Realtime, so two people on the same sheet see each other's markers.
- Trash panel. Deletes are already recoverable, there's just no UI for it.

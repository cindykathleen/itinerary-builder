# Itinerary Builder

A trip planning app that lets users create itineraries, organize activities by stop and category, schedule plans on a day-by-day timeline, and visualize Google Places on an interactive map.

Built with Next.js, React, PostgreSQL, GraphQL Yoga, Better Auth, and Google Places. Tests use Vitest and Playwright.

## Features

### Accounts

Sign up and sign in with email and password. Itinerary pages require a session.

### Itinerary library

Create an itinerary with a name and a date range. The library is a grid of cards that show the itinerary name and a cover image when one is stored. A sidebar filters the list into active itineraries, archived itineraries, and trash.

### Lifecycle

From a card menu you can rename, archive, or delete an itinerary. Archived and trashed itineraries can be restored. Trash can also be deleted permanently. Trashed itineraries are removed automatically after 14 days.

### Schedule

The first time you open an itinerary, you set stop names, the start and end of each day, and a 30- or 60-minute grid. New itineraries start with two trip-wide logistics categories: Transportation and Accommodations. You can later edit the name, dates, day window, and interval.

### Stops and categories

Stops can be added, renamed, and deleted. Each stop has its own colored categories. Logistics categories stay trip-wide.

### Activities

An activity has a name, an optional note, a category, a stop, and an optional Google Place chosen from autocomplete. Unscheduled activities stay in the sidebar and can be dragged onto the timeline. Scheduled blocks can be moved, resized within a day or across days, and returned to the sidebar. Overlapping blocks share a column. Each day has an editable heading.

### Map

Each itinerary toggles between Activities and Map. The map shows place pins colored from their activities, and an info window lists the activities at that place. Hovering an activity or place highlights it across the sidebar, timeline, and map.

## Setup

Create a PostgreSQL database, then apply the auth schema and migrations in order:

```bash
psql "$DATABASE_URL" -f db/auth.sql
for file in db/migrations/*.sql; do
  psql "$DATABASE_URL" -f "$file"
done
```

Copy the variables below into `.env.local`:

```bash
DATABASE_URL=postgres://user:password@localhost:5432/itinerary_builder_app
BETTER_AUTH_SECRET=generate-a-long-random-secret
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_PLACES_API_KEY=your-google-places-key
```

`GOOGLE_PLACES_FIXTURES=1` stubs Google Places. End-to-end tests set it; leave it unset for a real key.

Install dependencies and start the app:

```bash
npm install
npm run dev
```

`npm run db:seed` loads sample itineraries into the database named by `DATABASE_URL`. End-to-end tests apply `db/auth.sql` and `db/migrations` to a separate test database on their own.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Build for production |
| `npm run start` | Run the production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit tests |
| `npm run test:e2e` | Run Playwright tests |
| `npm run db:seed` | Load sample itineraries |

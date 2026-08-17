# Life Logger

Log what you do each day, then look at the graphs to see where the time actually
went. Installs to an iPhone Home Screen as a PWA and runs offline. No account, no
server, no cost.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle into dist/
npm run preview  # serve dist/ locally
```

## How it's put together

| Path | What's in it |
|---|---|
| `src/App.jsx` | Shell: header, three tabs, bottom nav |
| `src/components/QuickLog.jsx` | The entry form |
| `src/components/EntryList.jsx` | Entries grouped by day |
| `src/components/Insights.jsx` | Range filter, stat tiles, three charts |
| `src/components/DataPanel.jsx` | Export / restore / delete |
| `src/lib/storage.js` | `useEntries` — localStorage read/write and validation |
| `src/lib/stats.js` | Aggregation for the charts |
| `src/lib/dates.js` | Local-time day keys and duration formatting |
| `src/lib/categories.js` | The eight categories and their colours |

### Data

One entry is `{ id, day, category, activity, minutes, note, createdAt }`. Days are
local-time `YYYY-MM-DD` keys, so something logged at 11pm belongs to that evening
rather than to the next UTC day. Everything lives under the `life-logger/entries/v1`
key in `localStorage` and is re-validated on read, so a corrupt or hand-edited
value can't crash the app.

There is no backend. That is what makes it free, and it is also the trade-off:
clearing Safari's website data, or deleting the app from the Home Screen, deletes
the entries. The Data tab exports a JSON backup and restores one.

### Colours

The eight category colours are a fixed, ordered palette validated for
colour-vision deficiency against this app's dark card surface (`#141821`) — worst
adjacent pair ΔE 8.4, all eight above 3:1 contrast. **Do not re-order the list or
add a ninth**; the order is what makes adjacent categories distinguishable. Every
category is also labelled by name wherever its colour appears, so colour is never
the only way to read the chart. Each chart has a table view for the same reason.

## Tailwind

This is Tailwind **v4**. There is no `tailwind.config.js` and no
`postcss.config.js` — v4 removed both, along with the `npx tailwindcss init`
command. Configuration is the `@theme` block at the top of `src/index.css`, and
the build runs through the `@tailwindcss/vite` plugin in `vite.config.js`.

## Putting it on an iPhone

The service worker only registers over HTTPS, so it has to be deployed — Safari
will not install it from `localhost` on your phone. Any static host works, and the
free tiers are enough:

1. `npm run build`
2. Deploy `dist/` — drag the folder onto [app.netlify.com/drop](https://app.netlify.com/drop),
   or run `npx vercel deploy --prod`, or push to GitHub and enable Pages.
3. Open the deployed URL in **Safari** on the iPhone (Chrome on iOS cannot install
   PWAs), tap Share → **Add to Home Screen**.

For a GitHub Pages *project* site the app is served from a subpath, so set
`base: '/<repo-name>/'` in `vite.config.js` and rebuild — otherwise the assets
404.

## Regenerating the icons

`public/icon-*.png` and `public/apple-touch-icon.png` are generated, not drawn.
Edit the colours or geometry in `scripts/make-icons.mjs`, then:

```bash
npm run icons
```

# Mindset

A mood tracker that treats your mood like a stock. Check in with how you feel and what's bothering you. Watch the line go up and down. Open "positions" on your worries and close them out when they're done.

## What it does

- **Check in** in about 10 seconds. You give a mood from 1 to 10, write what's bothering you right now, link it to a worry, and add tags if you like.
- **Mood chart** works like a stock screen. Pick 1D / 1W / 1M / 3M / 1Y / ALL. The line is green when you're up for that range and red when you're down. The dotted line is where you started the range. Drag across the line to read any past check-in and its note.
- **Positions**: each worry gets a ticker (`$WORK`, `$RENT`) with a sparkline and your average mood when it comes up.
- **Is this in my control?** Each position asks. Answer *some of it* to write one small next step. Answer *not really* to get a prompt for letting go.
- **Close a position** when it's over, and say how it ended: *Resolved*, *Faded on its own* or *Let it go*. Closed worries stay in an archive.
- **Look back** shows something like: "You opened 4 worries in the last 30 days. 3 are already closed."
- **Insights** include a weekly recap (best moment, heaviest worry), tag patterns (for example, "walk +1.4 vs your average") and your full history.
- **Support**: after three rough check-ins in a row, the app gently shows where to find help (988 in the US, findahelpline.com elsewhere).

## Privacy

Everything stays in your browser's `localStorage`. There is no server, account or analytics. Use **Insights → Your data** to download, copy or import a backup.

On first open you see clearly labelled example data. Your first real check-in clears it, or you can tap **Clear now**.

## Run it

It's plain HTML, CSS and JavaScript modules with no build step and no dependencies.

```sh
npm start        # serves on http://localhost:8080 (uses python3)
npm test         # unit tests for the logic in js/logic.js (Node 20+)
```

To put it on your phone, host the folder anywhere static, such as GitHub Pages, Netlify or Cloudflare Pages. Open the site and use **Add to Home Screen**. A service worker caches the app so it works offline.

## Layout

```
index.html            app shell + tab bar
styles.css            all styles; light and dark themes
js/app.js             screens, sheets, event handling
js/chart.js           SVG mood line with drag-to-read, and sparklines
js/logic.js           pure functions: ranges, change %, tickers, insights
js/store.js           localStorage load/save
js/sample.js          example data for first open
sw.js                 offline cache
tests/logic.test.js   node:test unit tests
```

Mindset is a reflection tool, not therapy.

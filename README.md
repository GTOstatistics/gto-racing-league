# GTO Racing League — Championship Archive

This is a self-contained static website built from the Season 1–4 tabs of the supplied workbook. It includes race finishes, points, laps led, qualifying positions, pole positions, fastest laps, and average qualifying position. Drivers without a start are excluded from that season’s standings, and every standings column can be sorted by clicking its heading. The “Funny stats” tab is intentionally not included.

Open `index.html` in a browser to use it. No install, web server, or external services are required.

For deployment, upload the four site files together to any static hosting service:

- `index.html`
- `styles.css`
- `app.js`
- `data.js`

## Publish on GitHub Pages

Use the public repository name `gto-racing-league` under the GitHub account `GTOstatistics`.

1. Create a new **public** GitHub repository named `gto-racing-league`.
2. Upload every file in this folder, including `.nojekyll`.
3. In the repository, open **Settings → Pages** and choose **Deploy from a branch**.
4. Select the `main` branch and the `/(root)` folder, then save.

The public site address will be `https://gtostatistics.github.io/gto-racing-league/`.


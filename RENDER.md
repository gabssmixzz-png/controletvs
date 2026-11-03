# Render settings for controletvs

## Settings
- Root Directory: (empty)
- Build Command: (empty) — do NOT use npm install or yarn
- Start Command: `node server.js`

## Why deploy failed
The error `Cannot find module .../src/src/server.js` means Start Command was `node src/server.js`.
In this repo, server.js is at the **root**, so use:

```
node server.js
```

## After save
Manual Deploy → Deploy latest commit

Login: admin@escola.local / admin123

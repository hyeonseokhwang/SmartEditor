# Hanwool SmartEditor 2.0 Paste Demo

A minimal Node.js/Express scaffold to test SmartEditor-like paste behavior with image uploads to Cloudinary or local storage.

## Features

- Paste or drop images; they get uploaded and inserted as hosted URLs
- Cloudinary support via environment variables; local fallback to `/public/uploads`
- Simple contenteditable placeholder (you can swap in Naver SmartEditor 2.0)

## Setup

1. Install dependencies
2. Copy `.env.example` to `.env` and fill Cloudinary credentials (optional)
3. Start the dev server

### Windows CMD

```cmd
copy .env.example .env
npm install
npm run dev
```

Now open <http://localhost:3000>

## Swap to Naver SmartEditor 2.0

- Replace the demo editor in `views/index.ejs` with the real SmartEditor scripts and container.
- Hook into paste/drop events similar to `public/js/paste-handler.js` to send images to `/api/upload` and set the returned URL.

### Installing SmartEditor2 files locally

1. Download SmartEditor2 release or the gh-pages build (demo) from:

- https://github.com/naver/smarteditor2/releases
- or clone https://github.com/naver/smarteditor2 and build / use `gh-pages` contents

2. Place the editor files under `public/vendor/smarteditor2` so the path to the main script is:

`public/vendor/smarteditor2/js/SmartEditor.js`

3. Reload the app; `views/index.ejs` will attempt to load that script automatically and `public/js/se-init.js` will attach paste/drop handlers into the editor iframe.

## Notes

- Local uploads are served under `/public/uploads`. These are not persisted to a cloud.
- Increase body limits in `app/server.js` if you hit large clipboard content.

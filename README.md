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

Now open <http://localhost:8080>

## Naver SmartEditor 2.0

- We serve the vendor demo directly at `/public/vendor/smarteditor2/static/SmartEditor2.html` (root redirects there).
- `public/js/se-init.js` injects paste/drop handlers to upload images to `/api/upload` and replaces data URLs after paste.

### Installing SmartEditor2 files locally

1. Download SmartEditor2 release or the gh-pages build (demo) from:

- https://github.com/naver/smarteditor2/releases
- or clone https://github.com/naver/smarteditor2 and build / use `gh-pages` contents

1. We reference the SmartEditor core bundle from CDN inside `public/vendor/smarteditor2/static/SmartEditor2Skin.html` to avoid missing local build artifacts.
2. `public/js/se-init.js` attaches paste/drop handlers into the editor iframe once loaded.

## Notes

 CLOUDINARY_FOLDER (optional, default: Hanwool)

Per-request folder override: append `?folder=Hanwool/Sub` to `/api/upload` or include `{ folder: "Hanwool/Sub" }` in the request body.

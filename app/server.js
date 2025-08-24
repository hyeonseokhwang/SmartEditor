import express from 'express';
import path from 'path';
import multer from 'multer';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Raise body size limits to accommodate large data: URLs from Hangul paste
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

app.set('views', path.join(__dirname, '..', 'views'));
app.set('view engine', 'ejs');

// Configure Cloudinary if available
const hasCloudinary = process.env.CLOUDINARY_URL || (
  process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
);

if (hasCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

let upload;
if (hasCloudinary) {
  const DEFAULT_CLOUD_FOLDER = process.env.CLOUDINARY_FOLDER || 'Hanwool';
  const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
      // Allow per-request override via ?folder= or body.folder, else default
      folder: (req.query.folder || req.body?.folder || DEFAULT_CLOUD_FOLDER),
      public_id: uuidv4(),
      resource_type: 'image',
      overwrite: false,
    }),
  });
  upload = multer({ storage });
} else {
  // Fallback to local storage
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const dest = path.join(__dirname, '..', 'public', 'uploads');
      try {
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(dest, { recursive: true });
        }
      } catch (e) {
        // ignore mkdir errors; multer will surface if path invalid
      }
      cb(null, dest);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '.png');
      cb(null, `${uuidv4()}${ext}`);
    },
  });
  upload = multer({ storage });
}

// Root: redirect to vendor SmartEditor2 demo for guaranteed editability
app.get('/', (req, res) => {
  res.redirect('/public/vendor/smarteditor2/static/SmartEditor2.html');
});

// Optional: keep an alternate route to our custom page if needed later
app.get('/custom', (req, res) => {
  res.render('index', { hasCloudinary: !!hasCloudinary });
});

// Upload endpoint for pasted images or inline data URLs
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (req.file && req.file.path && !hasCloudinary) {
      // Local file URL
      const urlPath = `/public/uploads/${path.basename(req.file.path)}`;
      return res.json({ url: urlPath });
    }

    if (req.file && req.file.path && hasCloudinary) {
      // multer-storage-cloudinary already uploaded; get path from req.file
      return res.json({ url: req.file.path || req.file.secure_url });
    }

    // Handle base64 image via JSON
    const { dataUrl, fileName } = req.body;
    if (!dataUrl) return res.status(400).json({ error: 'No dataUrl' });

    if (hasCloudinary) {
  const DEFAULT_CLOUD_FOLDER = process.env.CLOUDINARY_FOLDER || 'Hanwool';
      const targetFolder = req.query.folder || req.body.folder || DEFAULT_CLOUD_FOLDER;
      const uploadRes = await cloudinary.uploader.upload(dataUrl, {
        folder: targetFolder,
        public_id: uuidv4(),
        resource_type: 'image',
      });
      return res.json({ url: uploadRes.secure_url });
    } else {
      // Save base64 locally
      const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
      if (!match) return res.status(400).json({ error: 'Invalid data URL' });
      const mime = match[1];
      const buf = Buffer.from(match[2], 'base64');
      const ext = mime.split('/')[1] || 'png';
      const name = `${uuidv4()}.${ext}`;
      const destDir = path.join(__dirname, '..', 'public', 'uploads');
      const fs = await import('fs/promises');
      await fs.mkdir(destDir, { recursive: true });
      await fs.writeFile(path.join(destDir, name), buf);
      return res.json({ url: `/public/uploads/${name}` });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

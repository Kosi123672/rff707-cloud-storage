// RFF707 Cloud Storage Server
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'PUT'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));
app.use(express.static('public'));

// Create uploads directory if not exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Determine userId from header or body; sanitize to prevent path traversal
        const rawUserId = (req.headers['x-user-id'] || req.body.userId || 'default');
        const safeUserId = String(rawUserId).replace(/[^a-zA-Z0-9_\-]/g, '_') || 'default';
        const userDir = path.join(uploadDir, safeUserId);
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }
        cb(null, userDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.\- ]/g, '_');
        cb(null, uniqueSuffix + '_' + safeName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

// Serve uploaded files
app.use('/files', express.static(uploadDir));

// Upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
        const file = req.file;
        const { userId, folder, fileType, originalSize } = req.body;
        
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        res.json({
            success: true,
            file: {
                id: file.filename,
                name: file.originalname,
                size: file.size,
                path: `/files/${userId || 'default'}/${file.filename}`,
                uploadedAt: new Date().toISOString(),
                type: fileType || 'file',
                folder: folder || 'root'
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get user files list
app.get('/api/files/:userId', (req, res) => {
    const { userId } = req.params;
    const userDir = path.join(uploadDir, userId || 'default');
    
    if (!fs.existsSync(userDir)) {
        return res.json({ files: [] });
    }
    
    try {
        const files = fs.readdirSync(userDir).map(filename => {
            const filePath = path.join(userDir, filename);
            const stats = fs.statSync(filePath);
            const originalName = filename.substring(filename.indexOf('_') + 1);
            
            return {
                id: filename,
                name: originalName,
                size: stats.size,
                path: `/files/${userId || 'default'}/${filename}`,
                uploadedAt: stats.birthtime.toISOString(),
                type: getFileType(originalName),
                ext: path.extname(originalName).toLowerCase()
            };
        });
        
        res.json({ files: files.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete file
app.delete('/api/files/:userId/:fileId', (req, res) => {
    const { userId, fileId } = req.params;
    const filePath = path.join(uploadDir, userId || 'default', fileId);
    
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get file info
app.get('/api/file/:userId/:fileId/info', (req, res) => {
    const { userId, fileId } = req.params;
    const filePath = path.join(uploadDir, userId || 'default', fileId);
    
    try {
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            const originalName = fileId.substring(fileId.indexOf('_') + 1);
            res.json({
                id: fileId,
                name: originalName,
                size: stats.size,
                path: `/files/${userId || 'default'}/${fileId}`,
                uploadedAt: stats.birthtime.toISOString()
            });
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Helper: Get file type category
function getFileType(filename) {
    const ext = path.extname(filename).toLowerCase();
    
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico'];
    const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp'];
    const audioExts = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.wma'];
    const documentExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.rtf'];
    const archiveExts = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'];
    
    if (imageExts.includes(ext)) return 'image';
    if (videoExts.includes(ext)) return 'video';
    if (audioExts.includes(ext)) return 'audio';
    if (documentExts.includes(ext)) return 'document';
    if (archiveExts.includes(ext)) return 'archive';
    return 'other';
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ╔════════════════════════════════════════════════════════╗
    ║     RFF707 CLOUD STORAGE SERVER                        ║
    ║     Running on http://localhost:${PORT}                ║
    ║                                                        ║
    ║  API Endpoints:                                        ║
    ║  POST   /api/upload      - Upload file                 ║
    ║  GET    /api/files/:id   - Get user files              ║
    ║  DELETE /api/files/:id/:file - Delete file             ║
    ║  GET    /files/*         - Serve uploaded files        ║
    ╚════════════════════════════════════════════════════════╝
    `);
});
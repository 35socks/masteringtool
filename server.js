const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const app = express();
const port = 3000; //change the port to your liking

const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

async function masterAudio(inputFile, outputFile) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(inputFile)) {
            reject(new Error('Input file does not exist'));
            return;
        }

        const command = `sox "${inputFile}" "${outputFile}" \
            gain -n -3 \
            compand 0.005,0.1 6:-54,-90,-36,-36,-24,-24,0,-12 0 -90 0.1 \
            equalizer 50 0.5q -6 \
            equalizer 100 0.5q -2 \
            equalizer 300 0.5q +3 \
            equalizer 1000 0.5q +2 \
            equalizer 3000 0.5q +3 \
            equalizer 10000 0.5q +1 \
            gain -n -1 \
            norm -6`.replace(/\s+/g, ' ').trim();

        console.log('Executing command:', command);

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('SoX Error:', stderr);
                reject(new Error(`SoX processing failed: ${stderr || error.message}`));
                return;
            }
            
            if (!fs.existsSync(outputFile)) {
                reject(new Error('Output file was not created'));
                return;
            }
            resolve();
        });
    });
}

if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}
if (!fs.existsSync('./processed')) {
    fs.mkdirSync('./processed');
}

app.use(express.static('public'));
app.use('/download', express.static('processed'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/main.html'));
});

app.post('/api/master', upload.single('audioFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No audio file uploaded' });
        }

        const allowedTypes = ['.mp3', '.wav', '.aiff', '.flac'];
        const fileExt = path.extname(req.file.originalname).toLowerCase();
        if (!allowedTypes.includes(fileExt)) {
            return res.status(400).json({
                error: `Unsupported file type. Allowed types: ${allowedTypes.join(', ')}`
            });
        }

        const inputFile = req.file.path;
        const outputFile = path.join('./processed', `mastered-${req.file.filename}`);

        await masterAudio(inputFile, outputFile);

        res.json({
            success: true,
            message: 'Audio mastered successfully',
            downloadLink: `/download/${path.basename(outputFile)}`
        });

    } catch (error) {
        console.error('Mastering error:', error);
        res.status(500).json({
            error: 'Error processing audio file',
            details: error.message
        });
        
        try {
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
        } catch (cleanupError) {
            console.error('Cleanup error:', cleanupError);
        }
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

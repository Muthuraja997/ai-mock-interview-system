const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public folder
const publicPath = path.join(__dirname, '..', 'public');
if (!fs.existsSync(publicPath)) {
    console.error('Error: Public folder not found at:', publicPath);
    process.exit(1);
}
app.use(express.static(publicPath));

// Explicit route for root URL
app.get('/', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        console.log('Serving index.html for GET /');
        res.sendFile(indexPath);
    } else {
        console.error('Error: index.html not found at:', indexPath);
        res.status(404).send('Error: index.html not found');
    }
});

// Resume upload endpoint (mock response)
app.post('/api/upload-resume', upload.single('resume'), async (req, res) => {
    try {
        if (!req.file) throw new Error('No file uploaded');
        console.log('Processing resume upload');
        // Mock resume text extraction (replace with pdf-parse in production)
        res.send('Mock resume text: Experienced software engineer with 5 years in JavaScript and Python.');
    } catch (error) {
        console.error('Error processing resume:', error.message);
        res.status(500).send(`Error processing resume: ${error.message}`);
    }
});

// Question generation endpoint (mock response)
app.post('/api/generate-questions', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) throw new Error('Prompt is required');
        console.log('Generating mock questions');
        // Mock response (replace with Google Gemini API in production)
        res.json([
            "Tell me about a challenging project you worked on.",
            "How do you handle tight deadlines?",
            "Describe your experience with JavaScript frameworks.",
            "What strategies do you use for team collaboration?",
            "How do you stay updated with industry trends?"
        ]);
    } catch (error) {
        console.error('Error generating questions:', error.message);
        res.status(500).send(`Error generating questions: ${error.message}`);
    }
});

// Feedback generation endpoint (mock response)
app.post('/api/generate-feedback', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) throw new Error('Prompt is required');
        console.log('Generating mock feedback');
        // Mock response (replace with Google Gemini API in production)
        res.json([
            { title: "Overall Performance", content: "You provided clear and concise answers." },
            { title: "Strengths Identified", content: "Strong technical knowledge in JavaScript." },
            { title: "Areas for Improvement", content: "Consider adding more specific examples." }
        ]);
    } catch (error) {
        console.error('Error generating feedback:', error.message);
        res.status(500).send(`Error generating feedback: ${error.message}`);
    }
});

// Transcription endpoint (mock response)
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) throw new Error('No audio file uploaded');
        console.log('Processing audio transcription');
        // Mock transcription (replace with Google Cloud Speech-to-Text in production)
        res.send('Mock transcription: This is a sample response.');
    } catch (error) {
        console.error('Error transcribing audio:', error.message);
        res.status(500).send(`Error transcribing audio: ${error.message}`);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
}).on('error', (error) => {
    console.error('Server startup error:', error.message);
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Try a different port in .env or close the conflicting process.`);
    }
});
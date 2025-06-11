const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdfParse = require('pdf-parse');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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

// Resume upload endpoint (real parsing with pdf-parse)
app.post('/api/upload-resume', upload.single('resume'), async (req, res) => {
    try {
        if (!req.file) throw new Error('No file uploaded');
        console.log('Parsing resume file:', req.file.originalname);

        let resumeText;
        try {
            const data = await pdfParse(req.file.buffer);
            resumeText = data.text.trim();
            if (!resumeText) throw new Error('Empty resume text extracted');
            console.log('Extracted resume text:', resumeText.substring(0, 200) + '...'); // Log first 200 chars
        } catch (parseError) {
            console.error('PDF parsing failed:', parseError.message);
            throw new Error(`Failed to parse resume: ${parseError.message}`);
        }

        res.send(resumeText);
    } catch (error) {
        console.error('Error processing resume:', error.message);
        res.status(500).send(`Error processing resume: ${error.message}`);
    }
});

// Manual resume text input endpoint
app.post('/api/upload-resume-text', async (req, res) => {
    try {
        const { resumeText } = req.body;
        if (!resumeText || !resumeText.trim()) throw new Error('No resume text provided');
        console.log('Received manual resume text:', resumeText.substring(0, 200) + '...');
        res.send(resumeText.trim());
    } catch (error) {
        console.error('Error processing manual resume text:', error.message);
        res.status(500).send(`Error processing resume text: ${error.message}`);
    }
});

// Question generation endpoint (using Gemini API)
app.post('/api/generate-questions', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) throw new Error('Prompt is required');
        console.log('Generating realistic interview questions with Gemini API');

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Parse the JSON response
        let questions;
        try {
            const cleanedText = text.replace(/```json\n|\n```/g, '').trim();
            questions = JSON.parse(cleanedText);
        } catch (parseError) {
            throw new Error(`Failed to parse Gemini response: ${parseError.message}`);
        }

        if (!Array.isArray(questions) || questions.length === 0) {
            throw new Error('Invalid or empty questions generated');
        }

        console.log('Generated questions:', questions.map(q => q.question));
        res.json(questions);
    } catch (error) {
        console.error('Error generating questions:', error.message);
        res.status(500).send(`Error generating questions: ${error.message}`);
    }
});

// Answer evaluation endpoint (using Gemini API)
app.post('/api/evaluate-answer', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) throw new Error('Prompt is required');
        console.log('Evaluating answer with Gemini API');

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Parse the JSON response
        let feedback;
        try {
            const cleanedText = text.replace(/```json\n|\n```/g, '').trim();
            feedback = JSON.parse(cleanedText);
        } catch (parseError) {
            throw new Error(`Failed to parse Gemini response: ${parseError.message}`);
        }

        if (!feedback.title || !feedback.content) {
            throw new Error('Invalid feedback format');
        }

        res.json(feedback);
    } catch (error) {
        console.error('Error evaluating answer:', error.message);
        res.status(500).send(`Error evaluating answer: ${error.message}`);
    }
});

// Feedback generation endpoint (using Gemini API)
app.post('/api/generate-feedback', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) throw new Error('Prompt is required');
        console.log('Generating personalized feedback with Gemini API');

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Parse the JSON response
        let feedback;
        try {
            const cleanedText = text.replace(/```json\n|\n```/g, '').trim();
            feedback = JSON.parse(cleanedText);
        } catch (parseError) {
            throw new Error(`Failed to parse Gemini response: ${parseError.message}`);
        }

        if (!Array.isArray(feedback) || feedback.length === 0) {
            throw new Error('Invalid or empty feedback generated');
        }

        res.json(feedback);
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
        res.send('Mock transcription: I led a team to build a Python pipeline at XYZ Corp.');
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
        console.error(`Port ${PORT} is already in use. Try a different port or close the conflicting process.`);
    }
});
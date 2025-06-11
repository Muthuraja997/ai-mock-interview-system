// Global variables
let currentQuestionIndex = 0;
let questions = []; // Array of { question: string, context: string }
let answers = [];
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let stream = null;
let resumeText = '';
let questionFeedback = []; // Store per-question feedback

// Retry utility for API calls
async function fetchWithRetry(url, options, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            return response;
        } catch (error) {
            if (i === retries - 1) throw error;
            console.warn(`Retrying ${url} (${i + 1}/${retries})...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Page navigation
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
}

// Validate file type and size
function validateFile(file) {
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (!allowedTypes.includes(file.type)) {
        document.getElementById('resume-error').textContent = 'Please upload a valid PDF or DOC/DOCX file.';
        document.getElementById('resume-error').style.display = 'block';
        return false;
    }
    if (file.size > maxSize) {
        document.getElementById('resume-error').textContent = 'File size exceeds 5MB limit.';
        document.getElementById('resume-error').style.display = 'block';
        return false;
    }
    document.getElementById('resume-error').style.display = 'none';
    return true;
}

// Generate questions via backend API
async function generateQuestions() {
    const resumeFile = document.getElementById('resume').files[0];
    const companyName = document.getElementById('company-name').value.trim();
    const manualResumeText = document.getElementById('manual-resume-text')?.value.trim();

    if (!resumeFile && !manualResumeText) {
        document.getElementById('resume-error').textContent = 'Please upload a resume or enter resume text.';
        document.getElementById('resume-error').style.display = 'block';
        return;
    }

    showPage('loading-page');

    try {
        // Upload resume or use manual text
        let resumeResponse;
        if (resumeFile && validateFile(resumeFile)) {
            const formData = new FormData();
            formData.append('resume', resumeFile);
            resumeResponse = await fetchWithRetry('/api/upload-resume', {
                method: 'POST',
                body: formData
            });
        } else if (manualResumeText) {
            resumeResponse = await fetchWithRetry('/api/upload-resume-text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ resumeText: manualResumeText })
            });
        } else {
            throw new Error('Invalid resume input');
        }

        resumeText = await resumeResponse.text();
        if (!resumeText.trim()) throw new Error('Empty resume text received');

        // Generate questions
        const prompt = `
            Based solely on the following resume, generate 5 realistic interview questions for the candidate, as if asked by a human interviewer. Include a mix of behavioral, technical, and situational questions, each tied to specific details in the resume (e.g., skills, projects, experiences). Do NOT assume or include skills not explicitly listed in the resume (e.g., avoid JavaScript if not mentioned). Ensure questions are natural, role-specific, and phrased professionally.
            Resume: ${resumeText}
            Company Name: ${companyName || 'Not provided'}
            For each question, provide a brief context explaining why it was chosen, referencing specific resume content.
            Format the response as a JSON array of objects, e.g., [
                {"question": "Can you describe your experience with X at Y?", "context": "Based on your work with X at Y listed in the resume."},
                {"question": "How would you handle Z in a team setting?", "context": "Given your role in Z project."}
            ].
        `;

        const response = await fetchWithRetry('/api/generate-questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        const parsedQuestions = await response.json();

        if (!Array.isArray(parsedQuestions) || parsedQuestions.length === 0) {
            throw new Error('No valid questions generated.');
        }

        questions = parsedQuestions;
        answers = new Array(questions.length).fill(null);
        questionFeedback = new Array(questions.length).fill(null);
        setupQuestionPage();
        showPage('question-page'); // Start asking questions immediately
    } catch (error) {
        console.error('Error generating questions:', error.message, error.stack);
        document.getElementById('resume-error').textContent = `Error generating questions: ${error.message}. Please check your resume or server connection.`;
        document.getElementById('resume-error').style.display = 'block';
        showPage('upload-page');
    }
}

// Setup question page
function setupQuestionPage() {
    currentQuestionIndex = 0;
    updateQuestionDisplay();
    updateProgress();
    updateNavigationButtons();
}

// Update question display
function updateQuestionDisplay() {
    document.getElementById('question-title').textContent = `Question ${currentQuestionIndex + 1} of ${questions.length}`;
    document.getElementById('question-text').textContent = questions[currentQuestionIndex]?.question || 'No question available';
    document.getElementById('recording-status').textContent = 'Click the microphone to start recording your answer';
    document.getElementById('recording-status').className = 'status';
    document.getElementById('text-answer').value = '';
    
    const voiceBtn = document.getElementById('voice-btn');
    voiceBtn.classList.remove('recording');
    document.getElementById('voice-btn-icon').textContent = '🎤';
    voiceBtn.setAttribute('aria-label', 'Start recording');
}

// Update progress bar
function updateProgress() {
    const progress = questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;
    document.getElementById('progress-fill').style.width = `${progress}%`;
}

// Update navigation buttons
function updateNavigationButtons() {
    document.getElementById('prev-btn').disabled = currentQuestionIndex === 0;
    document.getElementById('next-btn').disabled = !answers[currentQuestionIndex];
}

// Voice recording functionality
async function toggleRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
        document.getElementById('text-answer').style.display = 'block';
        document.getElementById('recording-status').textContent = 'Audio recording not supported. Please type your answer.';
        return;
    }

    if (!isRecording) await startRecording();
    else await stopRecording();
}

async function startRecording() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = event => audioChunks.push(event.data);

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            try {
                const formData = new FormData();
                formData.append('audio', audioBlob, 'response.wav');
                const response = await fetchWithRetry('/api/transcribe', {
                    method: 'POST',
                    body: formData
                });
                answers[currentQuestionIndex] = await response.text();
                // Evaluate answer accuracy
                await evaluateAnswer(currentQuestionIndex);
            } catch (error) {
                console.error('Transcription error:', error.message);
                answers[currentQuestionIndex] = 'Audio response recorded (transcription failed)';
                questionFeedback[currentQuestionIndex] = { title: 'Error', content: 'Unable to evaluate answer due to transcription failure.' };
            }
            updateNavigationButtons();
            
            document.getElementById('recording-status').textContent = 'Answer recorded successfully!';
            document.getElementById('recording-status').className = 'status completed-status';
        };

        mediaRecorder.onerror = error => {
            console.error('Recording error:', error);
            alert('An error occurred during recording. Please try again.');
            stopRecording();
        };

        mediaRecorder.start();
        isRecording = true;
        
        const voiceBtn = document.getElementById('voice-btn');
        voiceBtn.classList.add('recording');
        document.getElementById('voice-btn-icon').textContent = '⏹';
        voiceBtn.setAttribute('aria-label', 'Stop recording');
        document.getElementById('recording-status').textContent = 'Recording... Click to stop';
        document.getElementById('recording-status').className = 'status recording-status';
    } catch (error) {
        console.error('Error accessing microphone:', error);
        alert('Unable to access microphone. Please check your permissions and try again.');
        document.getElementById('text-answer').style.display = 'block';
        document.getElementById('recording-status').textContent = 'Audio recording not supported. Please type your answer.';
    }
}

async function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        isRecording = false;
        
        const voiceBtn = document.getElementById('voice-btn');
        voiceBtn.classList.remove('recording');
        document.getElementById('voice-btn-icon').textContent = '🎤';
        voiceBtn.setAttribute('aria-label', 'Start recording');
    }
}

// Evaluate answer accuracy
async function evaluateAnswer(index) {
    try {
        const prompt = `
            Evaluate the accuracy and relevance of the candidate's answer based solely on their resume and the question asked. Do not assume skills or experiences not listed in the resume.
            Resume: ${resumeText}
            Question: ${questions[index].question}
            Context for Question: ${questions[index].context}
            Candidate's Answer: ${answers[index] || 'No response provided'}
            Assess whether the answer aligns with the resume details and addresses the question effectively.
            Provide feedback as a JSON object with "title" and "content" fields, e.g., {
                "title": "Answer Accuracy",
                "content": "Your answer was accurate but lacked specific examples from your resume."
            }.
        `;

        const response = await fetchWithRetry('/api/evaluate-answer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        questionFeedback[index] = await response.json();
    } catch (error) {
        console.error('Error evaluating answer:', error.message);
        questionFeedback[index] = { title: 'Error', content: `Unable to evaluate answer: ${error.message}` };
    }
}

// Handle text answer
async function handleTextInput() {
    const textAnswer = document.getElementById('text-answer').value.trim();
    if (textAnswer) {
        answers[currentQuestionIndex] = textAnswer;
        await evaluateAnswer(currentQuestionIndex);
        updateNavigationButtons();
        document.getElementById('recording-status').textContent = 'Text answer saved successfully!';
        document.getElementById('recording-status').className = 'status completed-status';
    }
}

// Navigation functions
function previousQuestion() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        updateQuestionDisplay();
        updateProgress();
        updateNavigationButtons();
    }
}

function nextQuestion() {
    if (currentQuestionIndex < questions.length - 1) {
        currentQuestionIndex++;
        updateQuestionDisplay();
        updateProgress();
        updateNavigationButtons();
    } else {
        generateFeedback();
    }
}

// Generate overall feedback
async function generateFeedback() {
    showPage('loading-page');
    document.querySelector('.loading h2').textContent = '🤖 AI is analyzing your responses...';
    document.querySelector('.loading p').textContent = 'Generating personalized feedback based on your answers.';

    try {
        const answerSummaries = answers.map((answer, index) => 
            `Question ${index + 1}: ${questions[index].question}\nAnswer: ${answer || 'No response provided'}\nFeedback: ${JSON.stringify(questionFeedback[index] || { title: 'Pending', content: 'Not evaluated' })}`
        ).join('\n\n');

        const prompt = `
            Based solely on the following resume and candidate responses with per-question feedback, provide an overall summary of their interview performance. Highlight accuracy, relevance, and areas for improvement based only on the resume content.
            Resume: ${resumeText}
            Responses and Feedback: ${answerSummaries}
            Format the response as a JSON array of objects with "title" and "content" fields, e.g., [
                {"title": "Overall Performance", "content": "..."},
                {"title": "Strengths", "content": "..."}
            ]. Include the per-question feedback in the summary.
        `;

        const response = await fetchWithRetry('/api/generate-feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        const feedback = await response.json();

        if (!Array.isArray(feedback) || feedback.length === 0) {
            throw new Error('No valid feedback generated.');
        }

        // Combine per-question feedback with overall feedback
        const combinedFeedback = [
            ...questionFeedback.map((fb, index) => ({
                title: `Question ${index + 1} Feedback`,
                content: fb ? fb.content : 'No feedback available.'
            })),
            ...feedback
        ];

        displayFeedback(combinedFeedback);
        showPage('results-page');
    } catch (error) {
        console.error('Error generating feedback:', error.message, error.stack);
        const container = document.getElementById('suggestions-content');
        container.innerHTML = '';
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error';
        errorDiv.textContent = `Error generating feedback: ${error.message}. Please check server connection or API key.`;
        container.appendChild(errorDiv);
        showPage('results-page');
    }
}

// Display feedback
function displayFeedback(feedback) {
    const container = document.getElementById('suggestions-content');
    container.innerHTML = '';

    if (!Array.isArray(feedback) || feedback.length === 0) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error';
        errorDiv.textContent = 'No feedback available.';
        container.appendChild(errorDiv);
        return;
    }

    feedback.forEach(item => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.innerHTML = `
            <h4 style="color: #4a5568; margin-bottom: 10px;">${item.title || 'Untitled'}</h4>
            <p style="line-height: 1.6;">${item.content || 'No content provided'}</p>
        `;
        container.appendChild(div);
    });
}

// Utility functions
function startOver() {
    currentQuestionIndex = 0;
    questions = [];
    answers = [];
    questionFeedback = [];
    resumeText = '';
    document.getElementById('resume').value = '';
    document.getElementById('company-name').value = '';
    if (document.getElementById('manual-resume-text')) {
        document.getElementById('manual-resume-text').value = '';
    }
    document.getElementById('resume-error').style.display = 'none';
    showPage('start-page');
}

function downloadReport() {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.text('AI Mock Interview Report', 10, 10);
        doc.setFontSize(12);
        questions.forEach((q, index) => {
            doc.text(`Question ${index + 1}: ${q.question}`, 10, 20 + index * 30);
            doc.text(`Answer ${index + 1}: ${answers[index] || 'No response provided'}`, 10, 25 + index * 30);
            doc.text(`Feedback: ${questionFeedback[index]?.content || 'No feedback'}`, 10, 30 + index * 30);
        });
        doc.save('interview-report.pdf');
    } catch (error) {
        console.error('Error generating PDF:', error.message, error.stack);
        alert('Failed to generate report. Please try again.');
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder) {
        console.log('Microphone and MediaRecorder access available');
    } else {
        console.warn('Microphone or MediaRecorder access not available');
        document.getElementById('voice-btn').disabled = true;
        document.getElementById('voice-btn').style.display = 'none';
        document.getElementById('text-answer').style.display = 'block';
        document.getElementById('recording-status').textContent = 'Audio recording not supported. Please type your answer.';
        document.getElementById('recording-status').className = 'status error';
    }

    // Add keyboard navigation and text answer handling
    document.querySelectorAll('.btn').forEach(button => {
        button.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                button.click();
            }
        });
    });

    document.getElementById('text-answer').addEventListener('input', handleTextInput);
});
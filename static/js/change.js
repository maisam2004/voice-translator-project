document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const micButton = document.getElementById('mic-button');
    const timer = document.getElementById('timer');
    const activeSpeechEl = document.getElementById('active-speech');
    const finalizedTextEl = document.getElementById('finalized-text');
    const translationEl = document.getElementById('translation-content');
    const statusEl = document.getElementById('status');
    const sourceLangSelect = document.getElementById('source-language');
    const targetLangSelect = document.getElementById('target-language');
    const waveformCanvas = document.getElementById('waveform');
    const waveformCtx = waveformCanvas ? waveformCanvas.getContext('2d') : null;
    const tabButtons = document.querySelectorAll('.tab-btn');
    const flagElements = document.querySelectorAll('.flag');
    
    // State variables
    let mediaRecorder;
    let recognitionTimeout;
    let recordingStartTime;
    let transcript = '';
    let finalizedTranscript = '';
    let socket;
    let isRecording = false;
    let animationId;
    let currentTargetLang = 'fr';
    
    // Initialize
    updateStatus('Ready');
    
    // Set up canvas for waveform
    if (waveformCanvas) {
        waveformCanvas.width = waveformCanvas.offsetWidth;
        waveformCanvas.height = waveformCanvas.offsetHeight;
        drawIdleWaveform();
    }
    
    // Event Listeners
    micButton.addEventListener('click', toggleRecording);
    
    // Language tab switching
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            currentTargetLang = this.dataset.lang;
            targetLangSelect.value = currentTargetLang;
            
            // If we have finalized text, re-translate to the new language
            if (finalizedTranscript) {
                translateText(finalizedTranscript);
            }
        });
    });
    
    // Flag language selection
    flagElements.forEach(flag => {
        flag.addEventListener('click', function() {
            flagElements.forEach(f => f.classList.remove('active'));
            this.classList.add('active');
            
            // Map flag to language code
            const langMap = {
                'en': 'en-US',
                'fr': 'fr-FR',
                'es': 'es-ES',
                'ja': 'ja-JP'
            };
            
            const langCode = langMap[this.dataset.lang] || 'en-US';
            sourceLangSelect.value = langCode;
        });
    });
    
    function toggleRecording() {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    }
    
    async function startRecording() {
        try {
            updateStatus('Initializing...');
            
            // Get real-time token
            const token = await getRealtimeToken();
            if (!token) return;
            
            // Reset UI
            transcript = '';
            finalizedTranscript = '';
            activeSpeechEl.textContent = '';
            finalizedTextEl.textContent = '';
            translationEl.textContent = '';
            
            // Create WebSocket connection
            socket = new WebSocket(`wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&token=${token}`);
            
            // Start recording from microphone
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 16000
            });
            
            // Start timer
            recordingStartTime = Date.now();
            updateTimer();
            
            // Visual feedback
            micButton.classList.add('recording');
            isRecording = true;
            
            // Start waveform animation
            if (waveformCtx) {
                startWaveformAnimation();
            }
            
            // Handle data available
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
                    socket.send(event.data);
                }
            };
            
            // Start recording
            mediaRecorder.start(500); // Send data every 500ms
            
            // WebSocket handlers
            socket.onmessage = (message) => {
                const result = JSON.parse(message.data);
                
                if (result.message_type === 'PartialTranscript') {
                    activeSpeechEl.textContent = transcript + ' ' + result.text;
                }
                
                if (result.message_type === 'FinalTranscript') {
                    transcript += result.text + ' ';
                    finalizedTranscript += result.text + ' ';
                    activeSpeechEl.textContent = transcript;
                    finalizedTextEl.textContent = finalizedTranscript;
                    translateText(result.text);
                }
            };
            
            socket.onopen = () => {
                updateStatus('Listening... speak now!');
            };
            
            socket.onclose = (event) => {
                if (event.code !== 1000) {
                    updateStatus(`Connection closed: ${event.reason}`);
                }
            };
            
            socket.onerror = (error) => {
                updateStatus('Connection error');
                stopRecording();
            };
            
        } catch (error) {
            updateStatus('Error: ' + error.message);
            resetRecording();
        }
    }
    
    function stopRecording() {
        try {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
            
            if (socket) {
                socket.close(1000); // Normal closure
            }
            
            if (mediaRecorder && mediaRecorder.stream) {
                mediaRecorder.stream.getTracks().forEach(track => track.stop());
            }
            
            clearTimeout(recognitionTimeout);
            updateStatus('Recording stopped');
            
            // Stop waveform animation
            if (animationId) {
                cancelAnimationFrame(animationId);
                drawIdleWaveform();
            }
            
        } catch (error) {
            updateStatus('Stop error: ' + error.message);
        } finally {
            resetRecording();
        }
    }
    
    function resetRecording() {
        micButton.classList.remove('recording');
        isRecording = false;
    }
    
    async function translateText(text) {
        try {
            const response = await fetch('http://localhost:8000/translate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    source_language: 'auto',
                    target_language: currentTargetLang
                })
            });
            
            const result = await response.json();
            
            if (result.translated_text) {
                translationEl.textContent = result.translated_text;
                
                // Generate audio for this translation
                generateAudio(result.translated_text, currentTargetLang);
            }
        } catch (error) {
            console.error('Translation error:', error);
        }
    }
    
    async function generateAudio(text, lang) {
        try {
            const formData = new FormData();
            formData.append('text', text);
            formData.append('language', lang);
            
            const response = await fetch('http://localhost:8000/tts', {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                // For the new design, we'll just play the audio directly
                // instead of showing an audio player element
                const audioBlob = await response.blob();
                const audioUrl = URL.createObjectURL(audioBlob);
                const audio = new Audio(audioUrl);
                audio.play();
            }
        } catch (error) {
            console.error('Audio generation error:', error);
        }
    }
    
    async function getRealtimeToken() {
        try {
            const response = await fetch('http://localhost:8000/get-realtime-token');
            const data = await response.json();
            
            if (data.token) {
                return data.token;
            }
            throw new Error('Token not received');
        } catch (error) {
            updateStatus('Failed to get token: ' + error.message);
            return null;
        }
    }
    
    function updateTimer() {
        const elapsedTime = Date.now() - recordingStartTime;
        const seconds = Math.floor(elapsedTime / 1000);
        const minutes = Math.floor(seconds / 60);
        
        timer.textContent = 
            `${minutes.toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
        
        if (isRecording) {
            recognitionTimeout = setTimeout(updateTimer, 1000);
        }
    }
    
    function updateStatus(message) {
        statusEl.textContent = message;
    }
    
    // Waveform visualization functions
    function drawIdleWaveform() {
        if (!waveformCtx) return;
        
        const width = waveformCanvas.width;
        const height = waveformCanvas.height;
        const centerY = height / 2;
        
        waveformCtx.clearRect(0, 0, width, height);
        waveformCtx.beginPath();
        waveformCtx.moveTo(0, centerY);
        waveformCtx.lineTo(width, centerY);
        waveformCtx.strokeStyle = '#bdc3c7';
        waveformCtx.lineWidth = 2;
        waveformCtx.stroke();
    }
    
    function startWaveformAnimation() {
        if (!waveformCtx) return;
        
        const width = waveformCanvas.width;
        const height = waveformCanvas.height;
        const centerY = height / 2;
        let time = 0;
        
        function draw() {
            waveformCtx.clearRect(0, 0, width, height);
            waveformCtx.beginPath();
            
            for (let x = 0; x < width; x += 5) {
                const y = centerY + Math.sin(x * 0.05 + time) * (height / 4) * Math.random();
                if (x === 0) {
                    waveformCtx.moveTo(x, y);
                } else {
                    waveformCtx.lineTo(x, y);
                }
            }
            
            waveformCtx.strokeStyle = '#3498db';
            waveformCtx.lineWidth = 2;
            waveformCtx.stroke();
            
            time += 0.1;
            
            if (isRecording) {
                animationId = requestAnimationFrame(draw);
            }
        }
        
        draw();
    }
});
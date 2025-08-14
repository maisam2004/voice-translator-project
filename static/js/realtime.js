document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const startBtn = document.getElementById('start-recording-btn');
    const stopBtn = document.getElementById('stop-recording-btn');
    const timer = document.querySelector('.recording-timer');
    const transcriptEl = document.getElementById('transcript-content');
    const translationEl = document.getElementById('translation-output');
    const audioPlayer = document.getElementById('translation-audio');
    const statusEl = document.getElementById('status-message');
    const targetLangSelect = document.getElementById('target-language');

    // State variables
    let mediaRecorder;
    let recognitionTimeout;
    let recordingStartTime;
    let transcript = '';
    let socket;

    // Initialize
    stopBtn.disabled = true;

    // Start recording
    startBtn.addEventListener('click', startRecording);

    // Stop recording
    stopBtn.addEventListener('click', stopRecording);

    async function startRecording() {
        try {
            showStatus('Initializing...');
            
            // Get real-time token
            const token = await getRealtimeToken();
            if (!token) return;
            
            // Reset UI
            startBtn.disabled = true;
            stopBtn.disabled = false;
            transcript = '';
            transcriptEl.textContent = '';
            translationEl.textContent = '';
            audioPlayer.src = '';
            
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
                    transcriptEl.textContent = transcript + ' ' + result.text;
                }
                
                if (result.message_type === 'FinalTranscript') {
                    transcript += result.text + ' ';
                    transcriptEl.textContent = transcript;
                    translateText(result.text);
                }
            };
            
            socket.onopen = () => {
                showStatus('Listening... speak now!', 'success');
            };
            
            socket.onclose = (event) => {
                if (event.code !== 1000) {
                    showStatus(`Connection closed: ${event.reason}`, 'error');
                }
            };
            
            socket.onerror = (error) => {
                showStatus('Connection error: ' + error.message, 'error');
                stopRecording();
            };
            
        } catch (error) {
            showStatus('Error: ' + error.message, 'error');
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
            showStatus('Recording stopped', 'success');
            
        } catch (error) {
            showStatus('Stop error: ' + error.message, 'error');
        } finally {
            resetRecording();
        }
    }

    async function translateText(text) {
        try {
            const targetLang = targetLangSelect.value;
            
            const response = await fetch('http://localhost:8000/translate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    source_language: 'auto',
                    target_language: targetLang
                })
            });
            
            const result = await response.json();
            
            if (result.translated_text) {
                // Append to existing translations
                const translation = document.createElement('div');
                translation.className = 'translation-item';
                translation.textContent = result.translated_text;
                translationEl.appendChild(translation);
                
                // Generate audio for this translation
                generateAudio(result.translated_text, targetLang);
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
                const audioBlob = await response.blob();
                const audioUrl = URL.createObjectURL(audioBlob);
                
                // Create audio element for this translation
                const audio = document.createElement('audio');
                audio.src = audioUrl;
                audio.controls = true;
                audio.className = 'translation-audio';
                
                // Insert after the translation text
                const lastTranslation = translationEl.lastChild;
                if (lastTranslation) {
                    lastTranslation.after(audio);
                }
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
            showStatus('Failed to get token: ' + error.message, 'error');
            return null;
        }
    }

    function updateTimer() {
        const elapsedTime = Date.now() - recordingStartTime;
        const seconds = Math.floor(elapsedTime / 1000);
        const minutes = Math.floor(seconds / 60);
        
        timer.textContent = 
            `${minutes.toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
        
        recognitionTimeout = setTimeout(updateTimer, 1000);
    }

    function resetRecording() {
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }

    function showStatus(message, type = 'info') {
        statusEl.textContent = message;
        statusEl.className = 'status-message';
        
        if (type === 'error') statusEl.classList.add('error');
        if (type === 'success') statusEl.classList.add('success');
    }
});
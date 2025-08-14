document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const startBtn = document.getElementById('start-recording-btn');
    const stopBtn = document.getElementById('stop-recording-btn');
    const timer = document.querySelector('.recording-timer');
    const transcriptEl = document.getElementById('transcript-content');
    const translationEl = document.getElementById('translation-output');
    const audioPlayer = document.getElementById('translation-audio');
    const statusEl = document.getElementById('status-message');
    const sourceLangSelect = document.getElementById('source-language');
    const targetLangSelect = document.getElementById('target-language');

    // State variables
    let recognition;
    let recognitionTimeout;
    let recordingStartTime;
    let isRecording = false;

    // Initialize
    stopBtn.disabled = true;

    // Check for Web Speech API support
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showStatus('Speech recognition not supported in this browser. Please use Chrome or Edge.', 'error');
        startBtn.disabled = true;
        return;
    }

    // Start recording
    startBtn.addEventListener('click', startRecording);

    // Stop recording
    stopBtn.addEventListener('click', stopRecording);

    function startRecording() {
        try {
            showStatus('🎤 Starting recording...', 'info');
            
            // Reset UI
            startBtn.disabled = true;
            stopBtn.disabled = false;
            transcriptEl.textContent = '';
            translationEl.innerHTML = '<div style="color: #6b7280; font-style: italic;">Translations will appear here...</div>';
            audioPlayer.src = '';
            audioPlayer.style.display = 'none';
            
            // Initialize Web Speech API
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognition = new SpeechRecognition();
            
            // Configure recognition
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.maxAlternatives = 1;
            
            // Use the selected source language for speech recognition
            const sourceLang = sourceLangSelect.value;
            recognition.lang = sourceLang;
            
            console.log(`Speech recognition set to: ${sourceLang}`);
            
            // Start timer
            recordingStartTime = Date.now();
            isRecording = true;
            updateTimer();
            
            // Recognition event handlers
            recognition.onstart = function() {
                const sourceLangName = sourceLangSelect.options[sourceLangSelect.selectedIndex].text;
                const targetLangName = targetLangSelect.options[targetLangSelect.selectedIndex].text;
                showStatus(`🎤 Recording started! Speak in ${sourceLangName} - translating to ${targetLangName}`, 'success');
            };
            
            recognition.onresult = function(event) {
                let interimTranscript = '';
                let finalTranscript = '';
                
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript + ' ';
                    } else {
                        interimTranscript += transcript;
                    }
                }
                
                // Update transcript display
                const currentContent = finalTranscript + '<span style="color: #666;">' + interimTranscript + '</span>';
                transcriptEl.innerHTML = currentContent || '<div style="color: #6b7280; font-style: italic;">Your speech will appear here...</div>';
                
                // If we have final results, translate them
                if (finalTranscript.trim()) {
                    translateText(finalTranscript.trim());
                }
                
                // Reset timeout for silence detection
                clearTimeout(recognitionTimeout);
                recognitionTimeout = setTimeout(() => {
                    if (isRecording) {
                        showStatus('⏰ Stopped due to silence. Click "Start Speaking" to continue.', 'warning');
                        stopRecording();
                    }
                }, 5000); // Stop after 5 seconds of silence
            };
            
            recognition.onerror = function(event) {
                console.error('Speech recognition error:', event.error);
                let errorMessage = 'Speech recognition error: ';
                
                switch(event.error) {
                    case 'no-speech':
                        errorMessage += 'No speech detected. Please try again.';
                        break;
                    case 'audio-capture':
                        errorMessage += 'Microphone not found. Please check your microphone.';
                        break;
                    case 'not-allowed':
                        errorMessage += 'Microphone access denied. Please allow microphone access and refresh the page.';
                        break;
                    case 'network':
                        errorMessage += 'Network error. Please check your internet connection.';
                        break;
                    default:
                        errorMessage += event.error;
                }
                
                showStatus(errorMessage, 'error');
                stopRecording();
            };
            
            recognition.onend = function() {
                if (isRecording) {
                    // If we're still supposed to be recording, restart recognition
                    try {
                        recognition.start();
                    } catch (e) {
                        console.log('Recognition restart failed:', e);
                        stopRecording();
                    }
                }
            };
            
            // Start recognition
            recognition.start();
            
        } catch (error) {
            showStatus('Error starting recording: ' + error.message, 'error');
            stopRecording();
        }
    }

    function stopRecording() {
        try {
            isRecording = false;
            
            if (recognition) {
                recognition.stop();
            }
            
            clearTimeout(recognitionTimeout);
            
            startBtn.disabled = false;
            stopBtn.disabled = true;
            
            showStatus('🛑 Recording stopped', 'info');
            
        } catch (error) {
            showStatus('Error stopping recording: ' + error.message, 'error');
        }
    }

    function updateTimer() {
        if (!isRecording) return;
        
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        timer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        setTimeout(updateTimer, 1000);
    }

    async function translateText(text) {
        try {
            const targetLang = targetLangSelect.value;
            const sourceLang = sourceLangSelect.value;
            
            // Convert Web Speech API language codes to Google Translate language codes
            const sourceForTranslation = getGoogleTranslateLanguageCode(sourceLang);
            
            const formData = new FormData();
            formData.append('text', text);
            formData.append('source_language', sourceForTranslation);
            formData.append('target_language', targetLang);
            
            const response = await fetch('/translate', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error('Translation failed');
            }
            
            const result = await response.json();
            
            if (result.translated_text) {
                // Clear placeholder text on first translation
                if (translationEl.innerHTML.includes('Translations will appear here')) {
                    translationEl.innerHTML = '';
                }
                
                // Append to existing translations
                const translationDiv = document.createElement('div');
                translationDiv.className = 'translation-item';
                translationDiv.style.cssText = 'background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 8px; padding: 12px; margin: 8px 0; color: #0c4a6e;';
                translationDiv.textContent = result.translated_text;
                translationEl.appendChild(translationDiv);
                
                // Generate audio for this translation
                generateAudio(result.translated_text, targetLang);
            }
        } catch (error) {
            console.error('Translation error:', error);
            showStatus('Translation error: ' + error.message, 'error');
        }
    }

    async function generateAudio(text, lang) {
        try {
            const formData = new FormData();
            formData.append('text', text);
            formData.append('language', lang);
            
            const response = await fetch('/tts', {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                const audioBlob = await response.blob();
                const audioUrl = URL.createObjectURL(audioBlob);
                
                // Update the main audio player
                audioPlayer.src = audioUrl;
                audioPlayer.style.display = 'block';
                
                // Optionally auto-play the latest translation
                // audioPlayer.play();
            }
        } catch (error) {
            console.error('Audio generation error:', error);
        }
    }

    function getGoogleTranslateLanguageCode(webSpeechLangCode) {
        // Convert Web Speech API language codes (e.g., 'en-US') to Google Translate codes (e.g., 'en')
        const languageMap = {
            'en-US': 'en',
            'en-GB': 'en',
            'es-ES': 'es',
            'fr-FR': 'fr',
            'de-DE': 'de',
            'fa-IR': 'fa',
            'ar-SA': 'ar',
            'zh-CN': 'zh',
            'ja-JP': 'ja',
            'ko-KR': 'ko'
        };
        
        return languageMap[webSpeechLangCode] || webSpeechLangCode.split('-')[0] || 'auto';
    }

    function showStatus(message, type = 'info') {
        statusEl.textContent = message;
        statusEl.className = 'status-message';
        
        // Add type-specific styling
        switch(type) {
            case 'success':
                statusEl.style.cssText = 'background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; padding: 12px; border-radius: 8px; margin: 16px 0;';
                break;
            case 'error':
                statusEl.style.cssText = 'background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; padding: 12px; border-radius: 8px; margin: 16px 0;';
                break;
            case 'warning':
                statusEl.style.cssText = 'background: #fef3c7; color: #d97706; border: 1px solid #fde68a; padding: 12px; border-radius: 8px; margin: 16px 0;';
                break;
            default: // info
                statusEl.style.cssText = 'background: #dbeafe; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 12px; border-radius: 8px; margin: 16px 0;';
        }
        
        // Auto-hide non-error messages after 5 seconds
        if (type !== 'error') {
            setTimeout(() => {
                if (statusEl.textContent === message) {
                    statusEl.textContent = '';
                    statusEl.style.display = 'none';
                }
            }, 5000);
        }
    }

    // Show initial help message
    showStatus('🎯 Select your source language (what you speak) and target language (translation), then click "Start Speaking"!', 'info');
});

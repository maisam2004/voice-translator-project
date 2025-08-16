document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const toggleBtn = document.getElementById('toggle-recording-btn');
    const swapBtn = document.getElementById('swap-languages-btn');
    const timer = document.querySelector('.recording-timer');
    const transcriptEl = document.getElementById('transcript-content');
    const translationEl = document.getElementById('translation-output');
    const audioPlayer = document.getElementById('translation-audio');
    const statusEl = document.getElementById('status-message');
    const sourceLangSelect = document.getElementById('source-language');
    const targetLangSelect = document.getElementById('target-language');
    const transcriptSection = document.getElementById('transcript-section');
    const translationSection = document.getElementById('translation-section');
    
    // State variables
    let recognition;
    let recognitionTimeout;
    let recordingStartTime;
    let isRecording = false;
    
    // Initialize
    
    // Check for Web Speech API support
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showStatus('Speech recognition not supported in this browser. Please use Chrome or Edge.', 'error');
        toggleBtn.disabled = true;
        return;
    }
    
    // Event Listeners
    toggleBtn.addEventListener('click', toggleRecording);
    swapBtn.addEventListener('click', swapLanguages);
    
    function toggleRecording() {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    }

    function findBestLanguageMatch(baseCode) {
    // Try to find an exact match first
    const exactMatch = [...sourceLangSelect.options].find(option => 
        option.value === baseCode || option.value.startsWith(baseCode + '-')
    );
    
    if (exactMatch) {
        return exactMatch.value;
    }
    
    // If no exact match, find any option that starts with the base code
    const partialMatch = [...sourceLangSelect.options].find(option => 
        option.value.startsWith(baseCode)
    );
    
    return partialMatch ? partialMatch.value : null;
}
    
    function swapLanguages() {
    // Get current values
    const sourceValue = sourceLangSelect.value;
    const targetValue = targetLangSelect.value;
    
    // Extract base language from source (e.g., "en-US" becomes "en")
    const sourceBase = sourceValue.split('-')[0];
    
    // Find the best matching source option for the target language
    const newSourceValue = findBestLanguageMatch(targetValue);
    
    if (newSourceValue) {
        // Set the new source language
        sourceLangSelect.value = newSourceValue;
        
        // Set the new target language to the base of the original source
        targetLangSelect.value = sourceBase;
        
        showStatus('Languages swapped successfully!', 'success');
        
        // If we're currently recording, restart with new language
        if (isRecording) {
            stopRecording();
            setTimeout(() => {
                startRecording();
                showStatus('Recording restarted with new language settings', 'info');
            }, 500);
        }
    } else {
        showStatus('Cannot swap these languages. Please select compatible languages.', 'warning');
    }
}
    
    function startRecording() {
        try {
            showStatus('🎤 Starting recording...', 'info');
            
            // Reset UI and show result sections
            toggleBtn.innerHTML = '<i class="fas fa-stop"></i> Stop Recording';
            toggleBtn.classList.remove('btn-primary');
            toggleBtn.classList.add('btn-error');
            
            transcriptEl.textContent = '';
            translationEl.innerHTML = '<div style="color: #6b7280; font-style: italic;">Translations will appear here...</div>';
            audioPlayer.src = '';
            audioPlayer.style.display = 'none';
            
            // Show the result sections with smooth animation
            transcriptSection.classList.add('show');
            // Show translation section with a slight delay for progressive reveal
            setTimeout(() => {
                translationSection.classList.add('show');
            }, 200);
            
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
            
            toggleBtn.innerHTML = '<i class="fas fa-microphone"></i> Start Speaking';
            toggleBtn.classList.remove('btn-error');
            toggleBtn.classList.add('btn-primary');
            
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
// document.addEventListener('DOMContentLoaded', function() {
//     // DOM Elements
//     const startBtn = document.getElementById('start-recording-btn');
//     const stopBtn = document.getElementById('stop-recording-btn');
//     const timer = document.querySelector('.recording-timer');
//     const transcriptEl = document.getElementById('transcript-content');
//     const translationEl = document.getElementById('translation-output');
//     const audioPlayer = document.getElementById('translation-audio');
//     const statusEl = document.getElementById('status-message');
//     const sourceLangSelect = document.getElementById('source-language');
//     const targetLangSelect = document.getElementById('target-language');
//     const transcriptSection = document.getElementById('transcript-section');
//     const translationSection = document.getElementById('translation-section');

//     // State variables
//     let recognition;
//     let recognitionTimeout;
//     let recordingStartTime;
//     let isRecording = false;

//     // Initialize
//     stopBtn.disabled = true;

//     // Check for Web Speech API support
//     if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
//         showStatus('Speech recognition not supported in this browser. Please use Chrome or Edge.', 'error');
//         startBtn.disabled = true;
//         return;
//     }

//     // Start recording
//     startBtn.addEventListener('click', startRecording);

//     // Stop recording
//     stopBtn.addEventListener('click', stopRecording);

//     function startRecording() {
//         try {
//             showStatus('🎤 Starting recording...', 'info');
            
//             // Reset UI and show result sections
//             startBtn.disabled = true;
//             stopBtn.disabled = false;
//             transcriptEl.textContent = '';
//             translationEl.innerHTML = '<div style="color: #6b7280; font-style: italic;">Translations will appear here...</div>';
//             audioPlayer.src = '';
//             audioPlayer.style.display = 'none';
            
//             // Show the result sections with smooth animation
//             transcriptSection.classList.add('show');
//             // Show translation section with a slight delay for progressive reveal
//             setTimeout(() => {
//                 translationSection.classList.add('show');
//             }, 200);
            
//             // Initialize Web Speech API
//             const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
//             recognition = new SpeechRecognition();
            
//             // Configure recognition
//             recognition.continuous = true;
//             recognition.interimResults = true;
//             recognition.maxAlternatives = 1;
            
//             // Use the selected source language for speech recognition
//             const sourceLang = sourceLangSelect.value;
//             recognition.lang = sourceLang;
            
//             console.log(`Speech recognition set to: ${sourceLang}`);
            
//             // Start timer
//             recordingStartTime = Date.now();
//             isRecording = true;
//             updateTimer();
            
//             // Recognition event handlers
//             recognition.onstart = function() {
//                 const sourceLangName = sourceLangSelect.options[sourceLangSelect.selectedIndex].text;
//                 const targetLangName = targetLangSelect.options[targetLangSelect.selectedIndex].text;
//                 showStatus(`🎤 Recording started! Speak in ${sourceLangName} - translating to ${targetLangName}`, 'success');
//             };
            
//             recognition.onresult = function(event) {
//                 let interimTranscript = '';
//                 let finalTranscript = '';
                
//                 for (let i = event.resultIndex; i < event.results.length; i++) {
//                     const transcript = event.results[i][0].transcript;
//                     if (event.results[i].isFinal) {
//                         finalTranscript += transcript + ' ';
//                     } else {
//                         interimTranscript += transcript;
//                     }
//                 }
                
//                 // Update transcript display
//                 const currentContent = finalTranscript + '<span style="color: #666;">' + interimTranscript + '</span>';
//                 transcriptEl.innerHTML = currentContent || '<div style="color: #6b7280; font-style: italic;">Your speech will appear here...</div>';
                
//                 // If we have final results, translate them
//                 if (finalTranscript.trim()) {
//                     translateText(finalTranscript.trim());
//                 }
                
//                 // Reset timeout for silence detection
//                 clearTimeout(recognitionTimeout);
//                 recognitionTimeout = setTimeout(() => {
//                     if (isRecording) {
//                         showStatus('⏰ Stopped due to silence. Click "Start Speaking" to continue.', 'warning');
//                         stopRecording();
//                     }
//                 }, 5000); // Stop after 5 seconds of silence
//             };
            
//             recognition.onerror = function(event) {
//                 console.error('Speech recognition error:', event.error);
//                 let errorMessage = 'Speech recognition error: ';
                
//                 switch(event.error) {
//                     case 'no-speech':
//                         errorMessage += 'No speech detected. Please try again.';
//                         break;
//                     case 'audio-capture':
//                         errorMessage += 'Microphone not found. Please check your microphone.';
//                         break;
//                     case 'not-allowed':
//                         errorMessage += 'Microphone access denied. Please allow microphone access and refresh the page.';
//                         break;
//                     case 'network':
//                         errorMessage += 'Network error. Please check your internet connection.';
//                         break;
//                     default:
//                         errorMessage += event.error;
//                 }
                
//                 showStatus(errorMessage, 'error');
//                 stopRecording();
//             };
            
//             recognition.onend = function() {
//                 if (isRecording) {
//                     // If we're still supposed to be recording, restart recognition
//                     try {
//                         recognition.start();
//                     } catch (e) {
//                         console.log('Recognition restart failed:', e);
//                         stopRecording();
//                     }
//                 }
//             };
            
//             // Start recognition
//             recognition.start();
            
//         } catch (error) {
//             showStatus('Error starting recording: ' + error.message, 'error');
//             stopRecording();
//         }
//     }

//     function stopRecording() {
//         try {
//             isRecording = false;
            
//             if (recognition) {
//                 recognition.stop();
//             }
            
//             clearTimeout(recognitionTimeout);
            
//             startBtn.disabled = false;
//             stopBtn.disabled = true;
            
//             showStatus('🛑 Recording stopped', 'info');
            
//         } catch (error) {
//             showStatus('Error stopping recording: ' + error.message, 'error');
//         }
//     }

//     function updateTimer() {
//         if (!isRecording) return;
        
//         const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
//         const minutes = Math.floor(elapsed / 60);
//         const seconds = elapsed % 60;
//         timer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
//         setTimeout(updateTimer, 1000);
//     }

//     async function translateText(text) {
//         try {
//             const targetLang = targetLangSelect.value;
//             const sourceLang = sourceLangSelect.value;
            
//             // Convert Web Speech API language codes to Google Translate language codes
//             const sourceForTranslation = getGoogleTranslateLanguageCode(sourceLang);
            
//             const formData = new FormData();
//             formData.append('text', text);
//             formData.append('source_language', sourceForTranslation);
//             formData.append('target_language', targetLang);
            
//             const response = await fetch('/translate', {
//                 method: 'POST',
//                 body: formData
//             });
            
//             if (!response.ok) {
//                 throw new Error('Translation failed');
//             }
            
//             const result = await response.json();
            
//             if (result.translated_text) {
//                 // Clear placeholder text on first translation
//                 if (translationEl.innerHTML.includes('Translations will appear here')) {
//                     translationEl.innerHTML = '';
//                 }
                
//                 // Append to existing translations
//                 const translationDiv = document.createElement('div');
//                 translationDiv.className = 'translation-item';
//                 translationDiv.style.cssText = 'background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 8px; padding: 12px; margin: 8px 0; color: #0c4a6e;';
//                 translationDiv.textContent = result.translated_text;
//                 translationEl.appendChild(translationDiv);
                
//                 // Generate audio for this translation
//                 generateAudio(result.translated_text, targetLang);
//             }
//         } catch (error) {
//             console.error('Translation error:', error);
//             showStatus('Translation error: ' + error.message, 'error');
//         }
//     }

//     async function generateAudio(text, lang) {
//         try {
//             const formData = new FormData();
//             formData.append('text', text);
//             formData.append('language', lang);
            
//             const response = await fetch('/tts', {
//                 method: 'POST',
//                 body: formData
//             });
            
//             if (response.ok) {
//                 const audioBlob = await response.blob();
//                 const audioUrl = URL.createObjectURL(audioBlob);
                
//                 // Update the main audio player
//                 audioPlayer.src = audioUrl;
//                 audioPlayer.style.display = 'block';
                
//                 // Optionally auto-play the latest translation
//                 // audioPlayer.play();
//             }
//         } catch (error) {
//             console.error('Audio generation error:', error);
//         }
//     }

//     function getGoogleTranslateLanguageCode(webSpeechLangCode) {
//         // Convert Web Speech API language codes (e.g., 'en-US') to Google Translate codes (e.g., 'en')
//         const languageMap = {
//             'en-US': 'en',
//             'en-GB': 'en',
//             'es-ES': 'es',
//             'fr-FR': 'fr',
//             'de-DE': 'de',
//             'fa-IR': 'fa',
//             'ar-SA': 'ar',
//             'zh-CN': 'zh',
//             'ja-JP': 'ja',
//             'ko-KR': 'ko'
//         };
        
//         return languageMap[webSpeechLangCode] || webSpeechLangCode.split('-')[0] || 'auto';
//     }

//     function showStatus(message, type = 'info') {
//         statusEl.textContent = message;
//         statusEl.className = 'status-message';
        
//         // Add type-specific styling
//         switch(type) {
//             case 'success':
//                 statusEl.style.cssText = 'background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; padding: 12px; border-radius: 8px; margin: 16px 0;';
//                 break;
//             case 'error':
//                 statusEl.style.cssText = 'background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; padding: 12px; border-radius: 8px; margin: 16px 0;';
//                 break;
//             case 'warning':
//                 statusEl.style.cssText = 'background: #fef3c7; color: #d97706; border: 1px solid #fde68a; padding: 12px; border-radius: 8px; margin: 16px 0;';
//                 break;
//             default: // info
//                 statusEl.style.cssText = 'background: #dbeafe; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 12px; border-radius: 8px; margin: 16px 0;';
//         }
        
//         // Auto-hide non-error messages after 5 seconds
//         if (type !== 'error') {
//             setTimeout(() => {
//                 if (statusEl.textContent === message) {
//                     statusEl.textContent = '';
//                     statusEl.style.display = 'none';
//                 }
//             }, 5000);
//         }
//     }

//     // Show initial help message
//     showStatus('🎯 Select your source language (what you speak) and target language (translation), then click "Start Speaking"!', 'info');
// });

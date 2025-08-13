from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
import requests
import os
import uuid
from dotenv import load_dotenv
import tempfile
import assemblyai as aai
app = FastAPI()
templates = Jinja2Templates(directory="templates")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load environment variables from .env
load_dotenv()
ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
AZURE_API_KEY = os.getenv("AZURE_API_KEY")
AZURE_REGION = os.getenv("AZURE_REGION")
# Initialize AssemblyAI client
aai.settings.api_key = os.getenv("ASSEMBLYAI_API_KEY")
# Ensure temp_audio directory exists
os.makedirs("temp_audio", exist_ok=True)

# Map Google language codes to Azure TTS voice names
TTS_VOICES = {
    "en": "en-US-JennyNeural",
    "es": "es-ES-ElviraNeural",
    "fr": "fr-FR-DeniseNeural",
    "de": "de-DE-KatjaNeural",
    "fa": "fa-IR-FaridNeural",
}

@app.get("/")
async def root(request: Request):
    """Serve the HTML form."""
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)):
    """Transcribe audio (any language) using AssemblyAI with ALD."""
    if not audio.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="Invalid audio file")
    unique_id = str(uuid.uuid4())
    file_extension = os.path.splitext(audio.filename)[1].lower() or ".mp3"
    input_path = f"temp_audio/input_{unique_id}{file_extension}"
    try:
        print(f"Saving audio to {input_path}")
        with open(input_path, "wb") as f:
            f.write(await audio.read())
        headers = {"authorization": ASSEMBLYAI_API_KEY}
        print(f"Uploading to AssemblyAI with key: {ASSEMBLYAI_API_KEY[:5]}...")
        with open(input_path, "rb") as f:
            response = requests.post(
                "https://api.assemblyai.com/v2/upload",
                headers=headers,
                files={"file": f}
            )
        response.raise_for_status()
        audio_url = response.json()["upload_url"]
        print(f"Audio URL: {audio_url}")
        transcribe_response = requests.post(
            "https://api.assemblyai.com/v2/transcript",
            headers=headers,
            json={"audio_url": audio_url, "language_detection": True}
        )
        transcribe_response.raise_for_status()
        transcript_id = transcribe_response.json()["id"]
        print(f"Transcript ID: {transcript_id}")
        import time
        for _ in range(30):
            result = requests.get(
                f"https://api.assemblyai.com/v2/transcript/{transcript_id}",
                headers=headers
            )
            result.raise_for_status()
            status = result.json()["status"]
            print(f"Transcription status: {status}")
            if status == "completed":
                return {
                    "text": result.json()["text"],
                    "language_detected": result.json().get("language_code", "unknown")
                }
            elif status == "error":
                raise HTTPException(status_code=500, detail=f"AssemblyAI error: {result.json()['error']}")
            time.sleep(3)
        raise HTTPException(status_code=500, detail="Transcription timeout")
    except Exception as e:
        print(f"Error in /transcribe: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(input_path):
            os.remove(input_path)
            print(f"Cleaned up: {input_path}")

@app.post("/translate")
async def translate_text(text: str = Form(...), source_language: str = Form(...), target_language: str = Form(...)):
    """Translate text from detected language to target language using Google Cloud Translation."""
    try:
        response = requests.post(
            f"https://translation.googleapis.com/language/translate/v2?key={GOOGLE_API_KEY}",
            json={
                "q": text,
                "source": source_language,
                "target": target_language,
                "format": "text"
            }
        )
        response.raise_for_status()
        translated_text = response.json()["data"]["translations"][0]["translatedText"]
        return {"translated_text": translated_text}
    except Exception as e:
        print(f"Error in /translate: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/tts")
async def text_to_speech(text: str = Form(...), language: str = Form(...)):
    """Convert text to speech using Azure TTS with language-specific voice."""
    # Use tempfile.NamedTemporaryFile to ensure unique file name and proper cleanup
    with tempfile.NamedTemporaryFile(suffix=".mp3", dir="temp_audio", delete=False) as temp_file:
        output_path = temp_file.name
        try:
            voice = TTS_VOICES.get(language, "fa-IR-FaridNeural")
            lang_code = language if language in TTS_VOICES else "fa-IR"
            headers = {
                "Ocp-Apim-Subscription-Key": AZURE_API_KEY,
                "Content-Type": "application/ssml+xml",
                "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3"
            }
            ssml = f"""
            <speak version='1.0' xml:lang='{lang_code}'>
                <voice name='{voice}'>{text}</voice>
            </speak>
            """
            print(f"Sending TTS request: language={lang_code}, voice={voice}, text={text}")
            response = requests.post(
                f"https://{AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1",
                headers=headers,
                data=ssml.encode("utf-8")
            )
            print(f"Azure TTS response status: {response.status_code}")
            if response.status_code != 200:
                print(f"Azure TTS response: {response.text}")
                raise HTTPException(status_code=500, detail=f"Azure TTS error: {response.text}")
            with open(output_path, "wb") as f:
                f.write(response.content)
            if not os.path.exists(output_path):
                raise HTTPException(status_code=500, detail=f"Failed to create audio file: {output_path}")
            print(f"Created audio file: {output_path}")
            return FileResponse(output_path, media_type="audio/mpeg", filename=f"output_{os.path.basename(output_path)}")
        except Exception as e:
            print(f"Error in /tts: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            # Defer cleanup to after FileResponse is served
            pass
@app.on_event("shutdown")
async def cleanup_temp_files():
    """Clean up temporary files on shutdown."""
    import glob
    for file in glob.glob("temp_audio/output_*.mp3"):
        try:
            if os.path.exists(file):
                os.remove(file)
                print(f"Cleaned up: {file}")
        except Exception as e:
            print(f"Error cleaning up {file}: {str(e)}")


@app.get("/get-realtime-token")
async def get_realtime_token():
    try:
        # Make sure the API key is set
        if not ASSEMBLYAI_API_KEY:
            raise Exception("AssemblyAI API key not found")
            
        print(f"Using AssemblyAI API key: {ASSEMBLYAI_API_KEY[:8]}...")
        
        # First, test if the API key works with a basic call
        test_headers = {"authorization": ASSEMBLYAI_API_KEY}
        test_response = requests.get(
            "https://api.assemblyai.com/v2/transcript",
            headers=test_headers
        )
        print(f"API key test response: {test_response.status_code}")
        
        if test_response.status_code == 401:
            raise Exception("Invalid AssemblyAI API key - basic API test failed")
        
        # Now try to get Universal Streaming token using the new API endpoint
        headers = {
            "Authorization": ASSEMBLYAI_API_KEY,
        }
        
        # Create the token request using the new Universal Streaming endpoint
        response = requests.get(
            "https://streaming.assemblyai.com/v3/token",
            headers=headers,
            params={"expires_in_seconds": 600}  # 10 minutes (max 600)
        )
        
        print(f"Universal Streaming token API response status: {response.status_code}")
        print(f"Universal Streaming token API response text: {response.text}")
        
        if response.status_code == 401:
            raise Exception("Invalid AssemblyAI API key for Universal Streaming API")
        elif response.status_code == 403:
            raise Exception("Universal Streaming API access denied. Your AssemblyAI account may not have streaming access. Please check your plan at https://www.assemblyai.com/dashboard/")
        elif response.status_code == 404:
            raise Exception("Universal Streaming API endpoint not found. This feature may not be available in your region or plan.")
        elif response.status_code != 200:
            raise Exception(f"AssemblyAI Universal Streaming API returned {response.status_code}: {response.text}")
        
        try:
            token_data = response.json()
            if "token" not in token_data:
                raise Exception(f"No token in response: {token_data}")
            print("Successfully created Universal Streaming token")
            return {
                "token": token_data["token"],
                "api_host": "streaming.assemblyai.com",
                "websocket_url": f"wss://streaming.assemblyai.com/v3/streaming?token={token_data['token']}"
            }
        except ValueError as json_error:
            raise Exception(f"Invalid JSON response: {response.text}")
            
    except requests.exceptions.RequestException as req_error:
        print(f"Request error: {req_error}")
        raise HTTPException(
            status_code=500,
            detail=f"Network error connecting to AssemblyAI: {str(req_error)}"
        )
    except Exception as e:
        print(f"Error creating Universal Streaming token: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to create Universal Streaming token: {str(e)}"
        )






@app.on_event("startup")
async def startup_event():
    """Ensure API keys are loaded."""
    if not all([ASSEMBLYAI_API_KEY, GOOGLE_API_KEY, AZURE_API_KEY, AZURE_REGION]):
        raise RuntimeError("Missing API keys in .env file")
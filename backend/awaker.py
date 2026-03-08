import sounddevice as sd
import queue
import json
import requests
from vosk import Model, KaldiRecognizer
from dotenv import load_dotenv
import os

load_dotenv()
BACKEND_URL = os.getenv("VITE_BACKEND_URL")

MODEL_PATH = "backend/assets/vosk-model-small-en-us-0.15"
WAKE_WORD = "max"

q = queue.Queue()

def callback(indata, frames, time, status):
    if status:
        print(status, flush=True)
    q.put(bytes(indata))

print("Loading model...")
model = Model(MODEL_PATH)
rec = KaldiRecognizer(model, 16000)
found_word = False

print(f"Listening for wake word: '{WAKE_WORD}'")

with sd.RawInputStream(samplerate=16000, blocksize=8000, dtype='int16',
                       channels=1, callback=callback):

    while not found_word:
        data = q.get()
        if rec.AcceptWaveform(data):
            result = json.loads(rec.Result())
            text = result.get("text", "")
            if WAKE_WORD in text.lower():
                print("Wake word detected!", flush=True)
                found_word = True
                try:
                    requests.post(f"{BACKEND_URL}/wake", json={"word": WAKE_WORD})
                except Exception as e:
                    print(f"Failed to notify backend: {e}", flush=True)
                break

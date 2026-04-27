import os
import httpx
from groq import Groq

client = Groq(api_key=os.getenv("GROQ_API_KEY"))


def transcribe_audio(audio_url: str) -> str:
    response = httpx.get(audio_url)
    response.raise_for_status()
    filename = audio_url.split("/")[-1].split("?")[0]
    transcription = client.audio.transcriptions.create(
        file=(filename, response.content),
        model="whisper-large-v3-turbo",
    )
    return transcription.text

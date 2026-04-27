import os
from groq import Groq

client = Groq(api_key=os.getenv("GROQ_API_KEY"))


def transcribe_audio(filepath: str) -> str:
    with open(filepath, "rb") as audio_file:
        transcription = client.audio.transcriptions.create(
            file=audio_file,
            model="whisper-large-v3-turbo",
        )
    return transcription.text

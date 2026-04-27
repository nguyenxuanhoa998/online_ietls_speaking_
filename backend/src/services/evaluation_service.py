import json
import os
import time
from typing import Optional

from google import genai
from google.genai import types

api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key) if api_key else None

GEMINI_MODEL = "gemini-2.5-flash"


def generate_question_text(part: str) -> str:
    prompts = {
        "part1": "Generate a single random IELTS Speaking Part 1 question. It should be a short, conversational question about familiar topics like home, work, study, hobbies, etc. Only return the question text, no introductions.",
        "part2": "Generate a random IELTS Speaking Part 2 cue card question. It should start with 'Describe a...' and include 3-4 bullet points of what to say. Only return the actual cue card text.",
        "part3": "Generate a single random IELTS Speaking Part 3 question. It should be an abstract, analytical question related to broader themes in society. Only return the question text.",
    }
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompts[part],
    )
    return response.text.strip()


def evaluate_with_ai(
    transcript_text: str,
    question_text: str,
    question_part: str,
) -> Optional[dict]:
    prompt = f"""You are a certified IELTS Speaking examiner. Be strict, objective, and consistent with official IELTS band descriptors.

Evaluate the candidate's response to the following question.

Question ({question_part}): "{question_text}"

Candidate's Response:
"{transcript_text}"

Scoring criteria:
- Fluency and Coherence
- Lexical Resource
- Grammatical Range and Accuracy
- Pronunciation (estimate based on text only)

Instructions:
- Give realistic band scores (0-9, allow .5 like 6.5)
- Do NOT be overly generous
- Base feedback on specific issues in the response in context of addressing the question.
- Avoid vague comments

Return ONLY valid JSON (no explanation outside JSON):

{{
  "overall_band": number,
  "fluency_coherence": {{
    "score": number,
    "strengths": string,
    "weaknesses": string
  }},
  "lexical_resource": {{
    "score": number,
    "strengths": string,
    "weaknesses": string
  }},
  "grammar": {{
    "score": number,
    "strengths": string,
    "weaknesses": string
  }},
  "pronunciation": {{
    "score": number,
    "note": "Estimated from text",
    "feedback": string
  }},
  "key_mistakes": [
    "specific mistake 1",
    "specific mistake 2"
  ],
  "improvement_suggestions": [
    "actionable suggestion 1",
    "actionable suggestion 2",
    "actionable suggestion 3"
  ]
}}"""

    max_retries = 5
    retry_delay = 15
    response = None

    for i in range(max_retries):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                ),
            )
            break
        except Exception as e:
            if "429" in str(e) and i < max_retries - 1:
                time.sleep(retry_delay)
                retry_delay *= 2
            else:
                raise e

    if response:
        return json.loads(response.text)
    return None

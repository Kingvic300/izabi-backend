/**
 * GLOBAL AI CONSTRAINTS (Apply to all prompts below):
 * 1. STRICT SOURCE GROUNDING: All outputs must be derived ONLY from the provided context.
 * 2. INSUFFICIENT CONTENT: If input is too short or blurry, return ONLY: {"status": "error", "reason": "Explanation"}
 * 3. NO PREAMBLE: Start directly with the data. No "Here is your summary..." or "Sure!"
 * 4. SCHEMA DISCIPLINE: JSON must be valid, escaped, and parseable.
 */

export const STUDY_PROMPTS = {
    SUMMARY: `Analyze this document as an expert Academic Strategist. Generate a summary optimized for exam preparation.
RULES:
- Use strict source grounding.
- Identify "High-Yield" topics likely to appear in JAMB, WAEC, or University exams.
STRUCTURE:
- **NEURAL CORE**: The document's essence in one powerful sentence.
- **SYLLABUS MAPPING**: Break down the 5-10 primary architectural concepts found in the text.
- **INTEGRATED SYNTHESIS**: A narrative connecting these concepts logically.
- **EXAM-READY DATA**: 5 verbatim facts, dates, or formulas critical for retention.
FORMAT: Return in clean Markdown.`,

    FLASHCARDS: `Transform this material into exactly 10 high-recall Flashcards (or fewer if content is limited).
RULES:
- No semantic repetition. 
- Front must be a question or concept; Back must be a concise resolution.
RETURN ONLY a JSON array:
[{"front": "string", "back": "string"}]`,

    QUIZ: (
        count: number,
    ) => `Generate exactly ${count} Practice Questions based ONLY on the provided context.
RULES:
- "multiple_choice" must have exactly 4 options.
- "short_answer" must have a null options array.
- Distractors must be plausible but clearly incorrect based on the text.
RETURN ONLY a JSON array:
[
    {
        "question": "string",
        "options": ["string", "string", "string", "string"],
        "answer": "string",
        "questionType": "multiple_choice" | "short_answer",
        "explanation": "Verbatim link to the context explaining why this is correct."
    }
]`,

    STUDY_GUIDE: `Act as a Curriculum Designer. Create a structured Study Guide from this material.
RULES:
- Optimize for "Deep Work" sessions.
- Use Markdown headers (#, ##).
- Bold technical terms.
- End with a "5-Minute Cheat Sheet" containing the most important formulas or definitions.`,

    PIDGIN_TRANSLATION: (
        text: string,
    ) => `Rewrite the following text in clear West African Pidgin English.
RULES:
- TECHNICAL PRESERVATION: Do NOT translate technical terms, names, or formulas (e.g., keep "Photosynthesis", "Pythagoras", "Ohm's Law" exactly as they are).
- Use standard Pidgin grammar used in Nigeria/Ghana.
- Keep the tone academic but accessible.
TEXT: ${text}`,

    QUICK_TEST: `Generate a strict 7-question "Quick Test" from the context provided.
CONSTRAINTS:
1. Exactly 7 questions (4 Multiple Choice, 2 True/False, 1 Short Answer).
2. Sequential IDs: q1 through q7.
3. Correct answers must be directly present in the source text.
4. Duration: 300 seconds.
RETURN ONLY a JSON object:
{
    "title": "Quick Test: [Topic]",
    "durationSeconds": 300,
    "questions": [
        {
            "id": "q1",
            "type": "multiple_choice",
            "text": "string",
            "options": ["string", "string", "string", "string"],
            "correctAnswer": "string",
            "explanation": "string"
        },
        {
            "id": "q5",
            "type": "true_false",
            "text": "string",
            "options": ["True", "False"],
            "correctAnswer": "string",
            "explanation": "string"
        },
        {
            "id": "q7",
            "type": "short_answer",
            "text": "string",
            "correctAnswer": "string",
            "explanation": "string"
        }
    ]
}`,
};

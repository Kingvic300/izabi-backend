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
 - **KNOWLEDGE DIAGRAM**: Provide a Mermaid diagram (flowchart TB) showing relationships between the key concepts. Limit to 12 nodes and use short labels. Wrap it in a fenced code block labeled mermaid.
 - **SOURCES**: 3-6 bullet points. Each bullet must include a short quote (<= 18 words) from the document plus a brief context label (e.g., "From: section on X").
CONSTRAINTS:
- Do not invent external sources or links. Sources must be from the provided document only.
FORMAT: Return in clean Markdown with a section titled "## Knowledge Diagram" containing a mermaid code block, and a section titled "## Sources".`,

    FLASHCARDS: `Transform this material into exactly 10 high-recall Flashcards (or fewer if content is limited).
RULES:
- No semantic repetition. 
- Front must be a question or concept; Back must be a concise resolution.
RETURN ONLY a JSON array:
[{"front": "string", "back": "string"}]`,

    QUIZ: (
        count: number,
        options?: { difficulty?: string; questionStyle?: string },
    ) => {
        const difficulty =
            options?.difficulty === 'easy' ||
            options?.difficulty === 'hard' ||
            options?.difficulty === 'balanced'
                ? options.difficulty
                : 'balanced';
        const style =
            options?.questionStyle === 'mcq' ||
            options?.questionStyle === 'short' ||
            options?.questionStyle === 'mixed'
                ? options.questionStyle
                : 'mixed';

        const difficultyRule =
            difficulty === 'easy'
                ? 'DIFFICULTY: Easy. Focus on direct recall and definitions.'
                : difficulty === 'hard'
                  ? 'DIFFICULTY: Hard. Emphasize application, multi-step reasoning, and tricky distractors.'
                  : 'DIFFICULTY: Balanced. Mix recall and application questions.';

        const styleRule =
            style === 'mcq'
                ? 'STYLE: Only "multiple_choice" questions. Exactly 4 options each. Do NOT include short_answer.'
                : style === 'short'
                  ? 'STYLE: Only "short_answer" questions. Options must be null.'
                  : 'STYLE: Mixed. Use both "multiple_choice" and "short_answer" when possible.';

        return `Generate exactly ${count} Practice Questions based ONLY on the provided context.
RULES:
- "multiple_choice" must have exactly 4 options.
- "short_answer" must have a null options array.
- Distractors must be plausible but clearly incorrect based on the text.
${difficultyRule}
${styleRule}
RETURN ONLY a JSON array:
[
    {
        "question": "string",
        "options": ["string", "string", "string", "string"],
        "answer": "string",
        "questionType": "multiple_choice" | "short_answer",
        "explanation": "Verbatim link to the context explaining why this is correct."
    }
 ]`;
    },

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

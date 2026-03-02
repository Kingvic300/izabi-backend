/**
 * GLOBAL AI CONSTRAINTS (Apply to all prompts below):
 * 1. STRICT SOURCE GROUNDING: All outputs must be derived ONLY from the provided context.
 * 2. INSUFFICIENT CONTENT: If input is too short or blurry, return ONLY: {"status": "error", "reason": "Explanation"}
 * 3. NO PREAMBLE: Start directly with the data. No "Here is your summary..." or "Sure!"
 * 4. SCHEMA DISCIPLINE: JSON must be valid, escaped, and parseable.
 */

export const STUDY_PROMPTS = {
    SUMMARY: `Evaluate the provided context as an expert Academic Strategist.
TASKS:
1. Summarize the provided context clearly and accurately based ONLY on the text.
2. Identify and highlight key definitions and primary ideas.
3. Organize using structured bullet points.
4. Keep the summary concise but academically complete.

RULES:
- Do not add outside information or invent facts.
- Highlight "High-Yield" topics likely to appear in exams.
- If the content is insufficient for a structured summary, return: "The provided materials do not contain enough information to answer this."

STRUCTURE:
- **SYLLABUS CORE**: One sentence essence.
- **CONCEPT BREAKDOWN**: Bulleted list of primary architectural/academic concepts.
- **KNOWLEDGE DIAGRAM**: Provide a Mermaid diagram (flowchart TB) showing relationships between the key concepts. Limit to 10 nodes. Wrap in a fenced code block labeled mermaid.
- **VERBATIM SOURCES**: 3-5 bullet points with short quotes (<= 18 words) and section labels.

FORMAT: Return in clean Markdown.`,

    FLASHCARDS: `Transform this material into exactly 10 high-recall Flashcards focusing on key concepts.
RULES:
- Use ONLY provided context.
- Keep answers short, precise, and focused on core definitions.
- No semantic repetition.

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

        return `Generate exactly ${count} Multiple-Choice Questions based ONLY on the provided context.
RULES:
- TEST UNDERSTANDING: Questions must evaluate comprehension of concepts, not simple memorization of facts.
- Exactly 4 options (A-D) per question.
- Clearly indicate the correct answer.
- Distractors must be plausible but clearly incorrect based on the text.
- Do not include explanations unless requested.
- If the answer is not found in the context, return: "The provided materials do not contain enough information to answer this."
${difficultyRule}
${styleRule}
RETURN ONLY a JSON array:
[
    {
        "question": "string",
        "options": ["string", "string", "string", "string"],
        "answer": "string",
        "questionType": "multiple_choice",
        "explanation": "Verbatim link to the context explaining the correct logic."
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

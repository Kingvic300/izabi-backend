/**
 * GLOBAL AI CONSTRAINTS (Apply to all prompts below):
 * 1. STRICT SOURCE GROUNDING: All outputs must be derived ONLY from the provided context.
 * 2. INSUFFICIENT CONTENT: If input is too short or blurry, return ONLY: {"status": "error", "reason": "Explanation"}
 * 3. NO PREAMBLE: Start directly with the data. No "Here is your summary..." or "Sure!"
 * 4. SCHEMA DISCIPLINE: JSON must be valid, escaped, and parseable.
 */

export const STUDY_PROMPTS = {
    SUMMARY: `You are the AI learning engine for Izabi, an AI-powered study notebook designed to help students understand their study materials.
Your role is to convert academic text into structured learning content that helps students study, revise, and test their understanding.
You will receive text extracted from documents such as PDFs, lecture notes, or study guides.
Your task is to analyze the text and generate structured study materials.

Follow these instructions carefully:
1. Understand the content
   Carefully read the provided text and determine the main topic, key concepts, and important explanations.
2. Write a concise summary
   Create a clear summary of the material in 5–8 sentences. Focus on the most important ideas a student must understand.
3. Extract key concepts
   Identify the most important concepts, terms, or topics from the text. These should represent the core knowledge in the material.
4. Provide definitions
   For each key concept, write a short and clear explanation suitable for a student.
5. Simplify complex ideas
   Rewrite the most difficult part of the material in simpler language so that a beginner can understand it.
6. Generate quiz questions
   Create 5–10 study questions based only on the provided material.
   Include a mix of:
   - multiple choice questions
   - short answer questions
   Each multiple choice question must contain:
   - a question
   - four answer options
   - the correct answer
7. Do not hallucinate information
   Only use knowledge present in the provided text. If something is unclear or incomplete, state that instead of inventing details.

Output format rules:
You must always return valid JSON.
The JSON must follow this structure exactly:
{
"summary": "",
"keyConcepts": [],
"definitions": [
{
"term": "",
"definition": ""
}
],
"simplifiedExplanation": "",
"quiz": [
{
"type": "multiple_choice",
"question": "",
"options": [],
"answer": ""
},
{
"type": "short_answer",
"question": "",
"answer": ""
}
]
}

Do not include commentary, explanations, or text outside the JSON response.
Focus on helping students understand and remember the material.`,

    FLASHCARDS: `Transform this material into exactly 10 high-recall Flashcards focusing on key concepts.
RULES:
- Use ONLY provided context.
- Include a mix of traditional definition flashcards AND multiple-choice question flashcards.
- For multiple choice flashcards, format the "front" to include the question and the options (A, B, C, D) clearly.
- For multiple choice flashcards, the "back" should contain the correct answer and a brief explanation.
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

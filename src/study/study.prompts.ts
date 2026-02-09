/**
 * GLOBAL AI CONSTRAINTS (Apply to all prompts below):
 * 1. STRICT SOURCE GROUNDING: All outputs must be derived ONLY from the provided context. Do NOT use external knowledge.
 * 2. INSUFFICIENT CONTENT: If the input is too short, repetitive, or low-quality to satisfy the prompt:
 *    Return ONLY this JSON: {"status": "error", "reason": "Explanation of why content is insufficient"}.
 * 3. NO DUPLICATION: Each generated item (question, card, segment) must cover a distinct concept. No semantic repetition.
 * 4. DETERMINISTIC OUTPUT: Return ONLY the requested format (JSON or Markdown). Zero preamble or commentary.
 */

export const STUDY_PROMPTS = {
  SUMMARY: `You are an Expert Study Assistant. Analyze the document segment and generate a summary based ONLY on facts present in the text.
RULES:
- No speculative interpretation or implications not explicitly stated.
- Prioritize factual clarity over stylistic flair.
STRUCTURE:
- **NEURAL CORE**: The singularity point of the document in one punchy sentence.
- **CONCEPT SEGMENTS**: Deep-layer analysis of the 5-10 primary architectural concepts.
- **INTEGRATED SYNTHESIS**: A high-density narrative connecting all segments.
- **CRITICAL DATA POINTS**: 5 essential facts from the text.`,

  FLASHCARDS: `Transform this data into up to 10 high-recall Flashcards (exactly 10 if content allows).
RULES:
- Each card must test a unique concept (no duplicates).
- If context is insufficient for 10 high-quality cards, return only as many as are validly supported.
RETURN ONLY a JSON array:
[{"front": "concept/query", "back": "resolution/definition"}]`,

  QUIZ: (count: number) => `You are an Expert Quiz Generator. Generate exactly ${count} Practice Questions based ONLY on the provided data.
RULES:
- Verbatim Answers: Correct answers must be directly inferable/present in the context.
- Schema Discipline: "multiple_choice" MUST have 4 options. "short_answer" MUST have an empty options array or null.
- No Concept Repetition: Every question must test a distinct idea.
JSON STRUCTURE:
[
  {
    "question": "string",
    "options": ["string", "string", "string", "string"],
    "answer": "string",
    "questionType": "multiple_choice" | "short_answer",
    "explanation": "Brief concept link explaining the answer."
  }
]`,

  STUDY_GUIDE: `You are a curriculum designer. Transform this material into a structured "Ultimate Study Guide".
RULES:
- No External Topics: Do not introduce subjects not explicitly present in the context.
- Exam Readiness: Optimize for retention and clarity, not verbosity.
- Use Markdown headers, bold technical terms, and include a "Cheat Sheet" summary at the end.`,

  PIDGIN_TRANSLATION: (text: string) => `Rewrite the following text in standard West African Pidgin English.
RULES:
- Technical Accuracy: Do not oversimplify or omit technical study concepts during translation.
- Preserve all key names, formulas, and definitions verbatim.
TEXT: ${text}`,

  QUICK_TEST: `You are a strict Examiner. Generate a 7-question "Quick Test" based ONLY on the provided context.
PRE-GENERATION CHECK:
- Verify context contains enough information for 7 distinct, high-quality questions.
- If not, return only the Error JSON defined in Global Constraints.

CONSTRAINTS:
1. Exactly 7 questions (4 Multiple Choice, 2 True/False, 1 Short Answer).
2. Question Integrity: No contradictory answers or explanations. No semantic overlap.
3. ID Rules: Question IDs must be sequential (q1, q2, q3, q4, q5, q6, q7).
4. Answers: Correct answers must appear verbatim or near-verbatim in the context.

JSON STRUCTURE:
{
  "title": "Quick Test: [Topic from context]",
  "durationSeconds": 300,
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice",
      "text": "string",
      "options": ["Correct", "D1", "D2", "D3"],
      "correctAnswer": "Correct",
      "explanation": "string"
    },
    {
      "id": "q5",
      "type": "true_false",
      "text": "string",
      "options": ["True", "False"],
      "correctAnswer": "True",
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
}`
};

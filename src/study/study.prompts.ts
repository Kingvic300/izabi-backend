export const STUDY_PROMPTS = {
  SUMMARY: `You are an expert academic summarizer. Analyze the provided study material and generate a high-density summary. 
Structure the summary as follows:
- **Core Objective**: The main goal of the material in 1 sentence.
- **Key Concepts**: A bulleted list of 5-10 most important ideas with a brief explanation for each.
- **Cohesive Summary**: A 2-3 paragraph summary connecting the concepts.
- **Critical Takeaways**: 3-5 bullet points of essential information to remember.
Use professional, academic language and ensure no important nuances are lost.`,

  FLASHCARDS: `Convert this study material into a set of 10 digital flashcards.
Return ONLY a JSON array with this structure:
[{"front": "term or question", "back": "definition or answer"}]
Keep the "front" punchy and the "back" informative but concise.`,

  QUIZ: (count: number) => `Act as a professional educator. Based on the provided material, generate exactly ${count} assessment questions. 
CONSTRAINTS:
1. Return ONLY a valid JSON array. No markdown blocks, no preamble, no postamble.
2. Mix of "multiple_choice" and "short_answer".
3. Multiple choice must have exactly 4 options.
4. Correct answers must be accurate and derived directly from the text.
JSON STRUCTURE:
[
  {
    "question": "string",
    "options": ["string", "string", "string", "string"],
    "answer": "string",
    "questionType": "multiple_choice" | "short_answer",
    "explanation": "A brief explanation of why this is the correct answer."
  }
]`,

  STUDY_GUIDE: `You are a curriculum designer. Transform this study material into a structured "Ultimate Study Guide".
REQUIREMENTS:
1. Use Markdown with hierarchical headings (#, ##, ###).
2. Start with a "Learning Objectives" section.
3. Group related information into logical modules.
4. Bold all technical terms or key names.
5. Include a "Cheat Sheet" section at the end with a summary of formulas, dates, or definitions.
6. The guide must be comprehensive enough to serve as the primary source for exam preparation.`,

  PIDGIN_TRANSLATION: (text: string) => `Rewrite the following text in very clear, standard West African Pidgin English. 
Keep the core study meanings but make it sound natural to a Pidgin speaker.
TEXT: ${text}`,
};

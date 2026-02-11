import axios from 'axios';

const BASE_URL = 'http://localhost:3000'; // Match backend PORT in .env

const seedData = async () => {
    const exams = [
        {
            title: 'JAMB Mock 2024: Biology',
            type: 'JAMB',
            category: 'Secondary',
            subject: 'Biology',
            year: 2024,
            questions: [
                {
                    question:
                        'Which of the following is the unit of transmission of hereditary characters?',
                    options: ['Gene', 'Chromosome', 'Nucleus', 'Zygote'],
                    answer: 'Gene',
                    explanation:
                        'Genes are the functional units of heredity as they are made up of DNA.',
                },
                {
                    question:
                        'The process by which plants manufacture their food is called?',
                    options: [
                        'Respiration',
                        'Photosynthesis',
                        'Transpiration',
                        'Excretion',
                    ],
                    answer: 'Photosynthesis',
                    explanation:
                        'Photosynthesis is the process by which green plants use sunlight to synthesize nutrients from carbon dioxide and water.',
                },
            ],
        },
        {
            title: 'UNILAG CSC 101 Past Questions',
            type: 'UNI-COURSE',
            category: 'University',
            subject: 'Computer Science',
            institution: 'UNILAG',
            year: 2023,
            questions: [
                {
                    question:
                        'What is the primary function of an Operating System?',
                    options: [
                        'Resource Management',
                        'Word Processing',
                        'Internet Browsing',
                        'Email',
                    ],
                    answer: 'Resource Management',
                    explanation:
                        'The OS manages hardware resources like CPU, memory, and storage.',
                },
            ],
        },
    ];

    for (const exam of exams) {
        try {
            await axios.post(`${BASE_URL}/api/exams`, exam); // I need to add this endpoint to ExamsController
            console.log(`Seeded: ${exam.title}`);
        } catch (err) {
            console.error(`Failed to seed ${exam.title}`);
        }
    }
};

seedData();

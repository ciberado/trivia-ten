#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Load the compiled AI samples module
const { normaliseAiSampleBank } = require('./dist/ai_samples');

// Test with a small sample that includes a malformed question
const testData = [
    // Valid question
    {
        question: "What is AWS?",
        correct: ["Amazon Web Services"],
        incorrect: ["Amazon Warehouse Services", "Amazon Worker Services"],
        category: "aws",
        difficulty: "easy",
        type: "multiple"
    },
    // Malformed question - missing required fields
    {
        question: "", // Empty question
        category: "aws"
    },
    // Another valid question
    {
        question: "What does EC2 stand for?",
        correct: ["Elastic Compute Cloud"],
        incorrect: ["Electronic Cloud Computing", "Extended Cloud Capacity"],
        category: "aws",
        difficulty: "medium",
        type: "multiple"
    }
];

console.log('Testing error handling with malformed questions...');
console.log('Input data has', testData.length, 'questions');

try {
    const result = normaliseAiSampleBank(testData, 'test-file.json');
    console.log('Success! Processed bank:');
    console.log('- Title:', result.title);
    console.log('- Questions count:', result.questions.length);
    console.log('- Should have skipped 1 malformed question');
} catch (error) {
    console.error('Error during processing:', error.message);
    console.error('Stack:', error.stack);
}
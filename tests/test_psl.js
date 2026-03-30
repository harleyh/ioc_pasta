// tests/test_psl.js
const fs = require("fs");
const path = require("path");

const { PSLTrie } = require("../utils/load_psl.js");

async function runTests() {
    const trie = new PSLTrie();

    // Override loadPSL to use fs instead of fetch
    const text = fs.readFileSync(
        path.resolve(__dirname, "../data/public_suffix_list.dat"), 
        "utf8"
    );
    
    // Call the parsing logic directly
    for (const line of text.split("\n")) {
        const trimmed = line.trim().toLowerCase();
        if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("!")) continue;
        trie.insert(trimmed);
    }

    const tests = [
        { input: "mail.google.com",  expected: "google.com" },
        { input: "sub.evil.co.uk",   expected: "evil.co.uk" },
        { input: "google.com",       expected: "google.com" },
        { input: "com",              expected: null },
        { input: "notadomain",       expected: null },
        { input: "frame.style.left",          expected: null }

    ];

    let passed = 0;
    let failed = 0;

    for (const { input, expected } of tests) {
        const result = trie.getRegisteredDomain(input);
        const ok = result === expected;
        console.log(`${ok ? "✓" : "✗"} ${input} → ${result} ${!ok ? `(expected: ${expected})` : ""}`);
        ok ? passed++ : failed++;
    }

    console.log(`\n${passed} passed, ${failed} failed`);
}

runTests().catch(console.error);
#!/usr/bin/env python3
"""Shuffle quiz option positions in a DDIA presentation.html so answers are evenly distributed.

Usage:
    python3 shuffle_quiz.py <path-to-presentation.html>

Example:
    python3 .github/skills/ddia-presentation/references/shuffle_quiz.py chapter3/presentation.html

What it does:
- Parses all quiz questions (expects A/B/C/D options with checkAnswer onclick handlers)
- Randomly shuffles option positions within each question
- Updates the checkAnswer() call and "Answer: X)" text to match the new correct letter
- Fixes indentation after shuffle
- Prints the resulting distribution

Notes:
- Uses seed=42 for reproducibility. Change the seed for a different distribution.
- Always verify results with: grep -o 'Answer: [A-D])' <file> | sort | uniq -c | sort -rn
"""

import re
import random
import sys

def shuffle_quiz(filepath, seed=42):
    random.seed(seed)

    with open(filepath, "r") as f:
        html = f.read()

    # Pattern to match each quiz question block
    quiz_pattern = re.compile(
        r'(<div class="quiz-options">\s*)'
        r'(<div class="quiz-option"[^>]*>)([A-D])\) (.*?)(</div>\s*)'
        r'(<div class="quiz-option"[^>]*>)([A-D])\) (.*?)(</div>\s*)'
        r'(<div class="quiz-option"[^>]*>)([A-D])\) (.*?)(</div>\s*)'
        r'(<div class="quiz-option"[^>]*>)([A-D])\) (.*?)(</div>\s*)'
        r'(</div>\s*<div class="quiz-answer">\s*)'
        r'(<button class="reveal-btn"[^>]*onclick="checkAnswer\(this, \[\'([A-D])\'\]\)">.*?</button>\s*)'
        r'(<div class="quiz-explanation"><strong>Answer: )([A-D])(\)</strong>)',
        re.DOTALL
    )

    letters = ['A', 'B', 'C', 'D']
    distribution = {'A': 0, 'B': 0, 'C': 0, 'D': 0}
    question_count = 0

    def shuffle_question(match):
        nonlocal question_count
        question_count += 1

        options_prefix = match.group(1)

        opt_tags = [match.group(2), match.group(6), match.group(10), match.group(14)]
        opt_texts = [match.group(4), match.group(8), match.group(12), match.group(16)]
        opt_closes = [match.group(5), match.group(9), match.group(13), match.group(17)]
        old_letters = [match.group(3), match.group(7), match.group(11), match.group(15)]

        correct_letter = match.group(20)  # from checkAnswer
        correct_idx = old_letters.index(correct_letter)

        indices = list(range(4))
        random.shuffle(indices)

        new_correct_idx = indices.index(correct_idx)
        new_correct_letter = letters[new_correct_idx]

        distribution[new_correct_letter] += 1

        new_options = ""
        for i, idx in enumerate(indices):
            new_options += f'{opt_tags[idx]}{letters[i]}) {opt_texts[idx]}{opt_closes[idx]}'

        middle = match.group(18)

        old_button = match.group(19)
        new_button = old_button.replace(
            f"checkAnswer(this, ['{correct_letter}'])",
            f"checkAnswer(this, ['{new_correct_letter}'])"
        )

        expl_prefix = match.group(21)
        expl_suffix = match.group(23)

        return (
            options_prefix +
            new_options +
            middle +
            new_button +
            expl_prefix + new_correct_letter + expl_suffix
        )

    new_html = quiz_pattern.sub(shuffle_question, html)

    # Fix indentation: ensure all quiz-option divs have consistent 16-space indentation
    new_html = re.sub(
        r'^(\s*)<div class="quiz-option"',
        '                <div class="quiz-option"',
        new_html,
        flags=re.MULTILINE
    )

    with open(filepath, "w") as f:
        f.write(new_html)

    print(f"Processed {question_count} questions in {filepath}")
    print(f"Distribution: {distribution}")
    total = sum(distribution.values())
    if total > 0:
        for letter in letters:
            pct = distribution[letter] / total * 100
            print(f"  {letter}: {distribution[letter]} ({pct:.0f}%)")
    print("Done!")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <path-to-presentation.html>")
        sys.exit(1)
    shuffle_quiz(sys.argv[1])

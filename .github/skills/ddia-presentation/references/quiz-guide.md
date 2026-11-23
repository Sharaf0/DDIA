# DDIA MCQ Quiz Implementation Guide

Reference guide for adding the 100-question MCQ section to `chapterN/presentation.html`.

## Quiz CSS

Add these styles inside `<style>` (ensuring `@media (max-width: 768px)` collapses `.quiz-options` to `1fr`):

```css
/* ====== Quiz Slides ====== */
.quiz-slide { text-align: left; padding: 3% 8%; gap: 10px; }
.quiz-header { display: flex; align-items: center; gap: 15px; margin-bottom: 5px; width: 100%; }
.quiz-number { background: #2563eb; color: white; padding: 6px 16px; border-radius: 8px; font-weight: 800; font-size: 1.2rem; }
.quiz-topic { font-size: 0.95rem; text-transform: uppercase; letter-spacing: 2px; opacity: 0.55; font-weight: 600; }
.quiz-score { margin-left: auto; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 5px 14px; border-radius: 999px; font-size: 0.9rem; font-weight: 700; }
.quiz-question { font-size: 1.55rem; font-weight: 600; margin-bottom: 10px; line-height: 1.35; }
.quiz-options { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%; }
.quiz-option { background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 10px; padding: 14px 18px; font-size: 1.08rem; font-weight: 400; line-height: 1.4; cursor: pointer; transition: all 0.15s; }
.quiz-option:hover { border-color: #2563eb; }
.quiz-option.selected { border-color: #2563eb; background: #dbeafe; }
.quiz-option.correct-opt { border-color: #16a34a; background: #f0fdf4; color: #14532d; }
.quiz-option.wrong-opt { border-color: #dc2626; background: #fef2f2; color: #7f1d1d; }
.quiz-answer { width: 100%; margin-top: 8px; }
.reveal-btn { background: #2563eb; color: white; border: none; padding: 9px 26px; border-radius: 8px; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: opacity 0.2s; }
.reveal-btn:hover { opacity: 0.88; }
.quiz-explanation { display: none; background: #f0fdf4; border: 2px solid #86efac; border-radius: 10px; padding: 12px 18px; margin-top: 8px; font-size: 1.02rem; line-height: 1.45; }
.quiz-explanation.incorrect { display: block; background: #fef2f2; border-color: #fecaca; }
.quiz-answer.revealed .quiz-explanation { display: block; }

@media (max-width: 960px) {
    .quiz-slide { justify-content: flex-start; overflow-y: auto; padding: 32px 6% 88px; }
    .quiz-question { font-size: 1.3rem; }
    .quiz-option { font-size: 0.98rem; padding: 10px 14px; }
    .quiz-explanation { font-size: 0.94rem; padding: 10px 14px; }
}
```

## Quiz JavaScript

Add single-select radio behavior, green/red option card feedback, and idempotent live score tracking in `<script>`:

```javascript
let quizCorrect = 0;
let quizAnswered = 0;

function updateQuizScores() {
    document.querySelectorAll('.quiz-score').forEach(el => {
        el.textContent = `Score: ${quizCorrect} / ${quizAnswered}`;
    });
}

function selectOption(el) {
    const slide = el.closest('.quiz-slide');
    if (slide.dataset.graded === 'true') return;
    slide.querySelectorAll('.quiz-option').forEach(opt => opt.classList.remove('selected'));
    el.classList.add('selected');
}

function checkAnswer(btn, correctOptions) {
    const answerDiv = btn.parentElement;
    const slide = btn.closest('.quiz-slide');
    const selected = slide.querySelector('.quiz-option.selected');
    const exp = answerDiv.querySelector('.quiz-explanation');
    answerDiv.classList.add('revealed');
    if (!Array.isArray(correctOptions)) return;

    const chosenLetter = selected ? selected.innerText.trim().charAt(0) : null;
    const isCorrect = Boolean(chosenLetter && correctOptions.includes(chosenLetter) && correctOptions.length === 1);

    slide.querySelectorAll('.quiz-option').forEach(opt => {
        const letter = opt.innerText.trim().charAt(0);
        if (correctOptions.includes(letter)) opt.classList.add('correct-opt');
        else if (opt.classList.contains('selected')) opt.classList.add('wrong-opt');
    });

    if (isCorrect) exp.classList.remove('incorrect');
    else exp.classList.add('incorrect');

    if (slide.dataset.graded !== 'true') {
        slide.dataset.graded = 'true';
        quizAnswered += 1;
        if (isCorrect) quizCorrect += 1;
        updateQuizScores();
    }
}
```

## Slide Count & Authoring Strategy

- Update the static `<div class="slide-number">1 / N</div>` count to match `content_slides + 1 (quiz header) + 100`.
- For large 100-question sets, either shard authoring by chapter section across parallel subagents writing JSON arrays (and assemble deterministically via Python), or insert in 10-question batches.
- Run `./shuffle_quiz.py chapterN/presentation.html` (or balance exact 25/25/25/25 swaps) and verify `0` uniquely-longest correct answers using substantive peer-length distractors—never append mechanical filler phrases.

## Adapting Quiz CSS for Chapter 1's Design System

Chapter 1 uses `--accent: #000000` without `--accent-light` or `--dark`. Hardcode the blue quiz colors (`#2563eb`, `#dbeafe`) directly on `.quiz-number`, `.quiz-topic`, `.reveal-btn`, and `.quiz-option.selected` / `:hover`.

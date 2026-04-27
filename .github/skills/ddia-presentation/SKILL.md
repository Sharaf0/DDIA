---
name: ddia-presentation
description: 'Create DDIA chapter presentation HTML files. Use when: creating a presentation for a DDIA chapter, building KT slides, making chapter presentation.html, converting chapter markdown to presentation slides.'
---

# DDIA Chapter Presentation

Create self-contained single-file HTML presentations that summarize DDIA chapters for knowledge transfer sessions with experienced software engineers.

## When to Use
- Creating a new `presentation.html` for any DDIA chapter
- Adapting this format for chapters from other technical books

## Goal
The audience should NOT need to read the chapter after seeing the presentation. Cover **everything**.

## Inputs Required
Before starting, gather:
1. **Chapter markdown** — `chapterN/chapterN.md` (the full chapter text)
2. **Book figures** — `chapterN/images/` (e.g., `ddia_0301.png`). These are **MUST-HAVE** images; every single one must appear in the presentation at the correct position in the flow
3. **Book cover** — always at `chapter1/images/book_cover.jpg` (reference via relative path: `../chapter1/images/book_cover.jpg`)

## Procedure

### 1. Read the full chapter markdown
Read `chapterN/chapterN.md` completely. Identify:
- The epigraph/opening quote (if any)
- All major sections (h1/h2 headings)
- All figures and where they belong in the flow
- Key examples, case studies, statistics, and code snippets
- Concepts that benefit from comparison (use compare-cards)
- Numbers/stats that deserve emphasis (use stat-boxes)

### 2. Plan the slide outline
Map chapter structure to slides following this flow:
```
1. Title slide (always first)
2. Opening quote slide (if chapter has an epigraph)
3. Overview / "What We'll Cover" slide
4. [For each major section:]
   a. Section header slide (dark background divider)
   b. Content slides covering ALL material in that section
5. Summary section header
6. Summary content slide
7. Questions slide (always last)
```
Aim for **40-60 slides** per chapter. More is fine if needed to cover everything.

### 3. Download supporting images from Unsplash
For slides without a book figure, download a relevant photo from Unsplash to make the presentation visually engaging. Use `curl` to download directly:
```bash
# Use Unsplash source for direct downloads (800x600 size is good)
curl -L "https://unsplash.com/photos/{photo-id}/download?w=800" -o chapterN/images/descriptive-name.jpg
```

**Image rules:**
- Every downloaded image MUST be verified by viewing it with `view_image` to confirm it matches the slide context 100% — not 99%
- **NO NSFW content** — Never use images containing nudity, swimwear, bikinis, or any suggestive/inappropriate content. These are professional KT sessions. When searching Unsplash, prefer photos of technology, architecture, nature, objects, or abstract concepts over photos of people. If a photo of a person is used, they must be fully and professionally clothed
- **NO duplicate images** — Each image file may appear in the presentation **exactly once**. Maintain a checklist of every image `src` used. Before adding an image to a slide, check the list. This applies to the Unsplash source URL too: do not download the same Unsplash photo under two different filenames. If you rename a downloaded file, track both the original URL and the local filename to prevent accidental reuse
- Delete and replace any image that doesn't fit
- Book figures (`ddia_XXYY.png`) are MUST-HAVE — never delete or skip them
- Use `.image-box` (with `object-fit: contain`) for diagrams/figures
- Use `.image-box.fill` (with `object-fit: cover`) for photos
- A `questions.jpg` image should be downloaded for the final Q&A slide
- Not every slide needs an image — text-only slides are fine for lists, code, etc.

### 4. Create the presentation HTML
Use the template in [./references/template.html](./references/template.html) as the starting point. Build the entire file as a single self-contained HTML document.

### 5. Review checklist
After creating, verify:
- [ ] Every book figure appears in the correct slide
- [ ] Every section of the chapter is covered
- [ ] Code examples from the book are included with syntax highlighting
- [ ] Flow follows the chapter's narrative order
- [ ] Slide count in the `slideNum` element matches actual slide count
- [ ] All image paths are correct and relative
- [ ] The `<title>` follows format: `KT: DDIA Chapter N - Chapter Title`
- [ ] Opening quote matches the book's epigraph exactly
- [ ] Summary slide recaps all major topics
- [ ] No image `src` appears more than once across all slides
- [ ] All images are appropriate for a professional setting (no NSFW content)

### 6. Update index.html
Add a link to the new presentation in the root `index.html`.

## Slide Types Reference

### Title Slide (`slide title-slide`)
First slide only. Contains book name, chapter title, session label, and book cover.
```html
<section class="slide title-slide">
    <p>Designing Data-Intensive Applications</p>
    <h1>Chapter Title Here</h1>
    <p>Knowledge Transfer Session • Chapter N</p>
    <div class="image-box title-image">
        <img src="../chapter1/images/book_cover.jpg" alt="DDIA book cover" />
    </div>
</section>
```

### Section Header (`slide section-header`)
Dark full-bleed divider between major topics. Use to mirror the chapter's h1/h2 structure.
```html
<section class="slide section-header">
    <h2>Section Title</h2>
    <p style="font-size: 1.5rem; opacity: 0.7; margin-top: 20px;">Brief subtitle</p>
</section>
```

### Content Slide (`slide content-slide`)
Standard text slide. Add `.with-image` for a two-column layout with an image on the right.
```html
<!-- Text only -->
<section class="slide content-slide">
    <h2>Slide Title</h2>
    <p>Main point.</p>
    <ul>
        <li><strong>Key term</strong> — explanation</li>
    </ul>
</section>

<!-- With image (two-column: text left, image right) -->
<section class="slide content-slide with-image">
    <div>
        <h2>Slide Title</h2>
        <p>Content here.</p>
    </div>
    <div class="image-box">
        <img src="images/figure.png" alt="Description" />
    </div>
</section>
```

### Questions Slide (always last)
```html
<section class="slide title-slide">
    <h1>Questions?</h1>
    <p>Designing Data-Intensive Applications • Chapter N</p>
    <div class="image-box questions-image">
        <img src="images/questions.jpg" alt="Q&A discussion" />
    </div>
</section>
```

## Content Components

### Stat Box — for impressive numbers
```html
<div class="stat-box">
    <div class="number">10,000</div>
    <div class="label">Requests per second</div>
</div>
<!-- Small variant -->
<div class="stat-box small">
    <div class="number">99.9%</div>
    <div class="label">Availability target</div>
</div>
```

### Compare Cards — for contrasting approaches
```html
<div class="two-col">
    <div class="compare-card">
        <h3>Option A</h3>
        <p>Description...</p>
    </div>
    <div class="compare-card accent">
        <h3>Option B (preferred)</h3>
        <p>Description...</p>
    </div>
</div>
```

### Code Block — with syntax highlighting via spans
```html
<div class="code-block" style="font-size: 0.9rem;">
<span class="sql-keyword">SELECT</span> * <span class="sql-keyword">FROM</span> users
<span class="sql-keyword">WHERE</span> name = <span class="code-string">'Alice'</span>;
</div>
```
Span classes: `sql-keyword` (blue), `code-string` (orange), `code-comment` (green).

### Quote
```html
<p class="quote">"Exact quote from the book here."</p>
```

### Highlight (inline)
```html
<span class="highlight">highlighted term</span>
```

### Tag Pills
```html
<span class="tag">Label</span>
```

### Two/Three Column Layouts
```html
<div class="two-col"> ... </div>
<div class="three-col"> ... </div>
```

### Timeline (horizontal)
```html
<div class="timeline">
    <div class="timeline-item">
        <div class="year">1970s</div>
        <div class="desc">Description</div>
    </div>
    <!-- more items -->
</div>
```

## Content Style Guidelines

1. **Cover everything** — Every concept, example, and figure from the chapter must appear
2. **Be faithful to the book** — Use the book's terminology, examples, and explanations. Don't invent new ones
3. **Use suspenseful storytelling** — When the book presents a problem and its evolution (like Twitter's fan-out), build up: problem → approach 1 → its issue → approach 2 → its issue → final solution
4. **Make it relatable** — Use humor, emojis (sparingly), and real-world analogies. The audience is experienced engineers, not students
5. **Use the book's own quotes** — Put key quotes from the book in `.quote` blocks
6. **Emphasize numbers** — Put statistics, benchmarks, and metrics in `.stat-box` elements
7. **Show code** — Include code examples from the book with proper syntax highlighting. Use side-by-side compare-cards to contrast imperative vs. declarative, SQL vs. NoSQL, etc.
8. **Annotate slides with HTML comments** — Number every slide and add a brief description: `<!-- 14. Chaos Engineering -->`
9. **Use section comment dividers** — `<!-- ==================== SECTION NAME ==================== -->`
10. **Bold key terms** with `<strong>` on first introduction
11. **Use ❌ and ✅ emojis** for common misconceptions vs. correct framing
12. **Button links for demos/PoCs** — If a chapter has a related code demo in the repo, add a styled link button

## CSS Design System

The presentation uses the **Inter** font from Google Fonts with a clean, modern design:

- **Color palette**: White background, dark text, blue accent (`#2563eb`), light blue for accent backgrounds (`#dbeafe`), warm yellow for highlights (`#fef3c7`)
- **Title slide h1**: Gradient text (`#0f172a` → `#2563eb`)
- **Section headers**: Dark gradient background (`#0f172a` → `#1e3a5f`), white text
- **Progress bar**: Gradient (`#2563eb` → `#7c3aed`)
- **Controls**: Nearly invisible (opacity: 0), appear on hover — presentation is navigated by keyboard
- **Typography**: h2 at 2.8rem/700, p at 1.8rem/300, ul at 1.5rem/300
- **Image boxes**: 12px border-radius, contain by default, `.fill` for cover

## File Structure

```
chapterN/
├── presentation.html      # The presentation (output of this skill)
├── chapterN.md            # Source chapter text
└── images/
    ├── ddia_0N01.png      # Book figures (MUST-HAVE)
    ├── ddia_0N02.png
    ├── ...
    ├── descriptive-name.jpg   # Downloaded from Unsplash
    ├── questions.jpg          # For Q&A slide
    └── ...
```

## MCQ Quiz Section

After the main presentation content (after the Questions slide), add a 100-question multiple-choice quiz covering every topic in the chapter. The quiz is placed between the Questions slide and the closing `</div>` of the presentation div.

### Quiz Structure
```
Questions slide (always last content slide)
Quiz Section Header (section-header style)
Q1 through Q100
```

### Quiz Slide Template
```html
<!-- Quiz Section Header -->
<section class="slide section-header">
    <h2>MCQ Quiz</h2>
    <p style="font-size: 1.5rem; opacity: 0.7; margin-top: 20px;">100 Questions • Test Your Knowledge</p>
</section>

<!-- QN -->
<section class="slide quiz-slide">
    <div class="quiz-header"><span class="quiz-number">QN</span><span class="quiz-topic">Topic Name</span></div>
    <p class="quiz-question">Question text here?</p>
    <div class="quiz-options">
        <div class="quiz-option" onclick="selectOption(this)">A) First option</div>
        <div class="quiz-option" onclick="selectOption(this)">B) Second option</div>
        <div class="quiz-option" onclick="selectOption(this)">C) Third option</div>
        <div class="quiz-option" onclick="selectOption(this)">D) Fourth option</div>
    </div>
    <div class="quiz-answer">
        <button class="reveal-btn" onclick="checkAnswer(this, ['C'])">Check Answer</button>
        <div class="quiz-explanation"><strong>Answer: C)</strong> Explanation with a direct quote from the chapter.</div>
    </div>
</section>
```

### Quiz Content Rules

1. **Source material** — ALL questions must come exclusively from the chapter markdown. Do not invent questions about topics the chapter doesn't cover
2. **100 questions** — Cover every single topic in the chapter. Organize questions in the same order as the chapter's flow
3. **At least 4 options** per question (A through D minimum). Each question has one correct answer
4. **Include explanations** — Every answer must include an explanation, preferably with a direct quote from the chapter
5. **Topic tags** — Each question gets a `quiz-topic` span with the relevant section/concept name
6. **Sequential numbering** — Q1 through Q100, matching the quiz-number span

### CRITICAL: Answer Distribution

**DO NOT make all correct answers the same letter.** This is the most common mistake when generating quiz questions. When writing questions naturally, there's a strong tendency to always put the correct answer as option B.

**Target distribution**: Roughly 25% each for A, B, C, D (±5%). For 100 questions, aim for 20-30 of each letter.

**How to achieve this**: As you write each question, consciously rotate where you place the correct answer. Track your running count. For example:
- Q1: correct = A
- Q2: correct = C
- Q3: correct = D
- Q4: correct = B
- Q5: correct = A
- ... and so on

**After generating all questions**, verify the distribution by counting answers. If any letter appears more than 30 times or fewer than 15 times, shuffle options to rebalance. When shuffling, update BOTH:
1. The option text position (which letter prefix it gets)
2. The `checkAnswer(this, ['X'])` call and `<strong>Answer: X)</strong>` in the explanation

### Quiz CSS

Add these styles inside the `<style>` block:
```css
/* ====== Quiz Slides ====== */
.quiz-slide {
    text-align: left;
    align-items: flex-start;
    padding: 5% 12%;
}

.quiz-header {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-bottom: 20px;
}

.quiz-number {
    background: var(--accent);
    color: white;
    padding: 6px 16px;
    border-radius: 20px;
    font-weight: 700;
    font-size: 1.1rem;
}

.quiz-topic {
    background: var(--accent-light);
    color: var(--accent);
    padding: 6px 16px;
    border-radius: 20px;
    font-size: 0.95rem;
    font-weight: 600;
}

.quiz-question {
    font-size: 1.6rem;
    font-weight: 400;
    line-height: 1.5;
}

.quiz-options {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 25px;
    width: 100%;
}

.quiz-option {
    background: #f8fafc;
    border: 2px solid #e2e8f0;
    border-radius: 10px;
    padding: 14px 20px;
    font-size: 1.25rem;
    cursor: pointer;
    transition: all 0.2s;
}

.quiz-option:hover {
    border-color: var(--accent);
}

.quiz-option.selected {
    border-color: var(--accent);
    background: var(--accent-light);
}

.quiz-answer {
    margin-top: 20px;
    width: 100%;
}

.reveal-btn {
    background: var(--accent);
    color: white;
    border: none;
    padding: 10px 28px;
    border-radius: 8px;
    font-size: 1.1rem;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
}

.reveal-btn:hover {
    background: #1d4ed8;
}

.quiz-explanation {
    margin-top: 15px;
    padding: 18px;
    background: #f0fdf4;
    border: 1px solid #86efac;
    border-radius: 10px;
    font-size: 1.15rem;
    line-height: 1.5;
    display: none;
}

.quiz-answer.revealed .quiz-explanation {
    display: block;
}

.quiz-answer.revealed .reveal-btn {
    background: #6b7280;
}
```

### Quiz JavaScript

Add interactive quiz logic (option selection + answer checking) in the `<script>` block:
```javascript
function selectOption(el) {
    const options = el.parentElement.querySelectorAll('.quiz-option');
    options.forEach(opt => opt.classList.remove('selected'));
    el.classList.add('selected');
}

function checkAnswer(btn, correctLetters) {
    const answerDiv = btn.parentElement;
    const slide = btn.closest('.quiz-slide');
    const selected = slide.querySelector('.quiz-option.selected');
    if (selected) {
        const selectedLetter = selected.textContent.trim().charAt(0);
        if (correctLetters.includes(selectedLetter)) {
            selected.style.borderColor = '#22c55e';
            selected.style.background = '#f0fdf4';
        } else {
            selected.style.borderColor = '#ef4444';
            selected.style.background = '#fef2f2';
            // Highlight correct answer
            const options = slide.querySelectorAll('.quiz-option');
            options.forEach(opt => {
                const letter = opt.textContent.trim().charAt(0);
                if (correctLetters.includes(letter)) {
                    opt.style.borderColor = '#22c55e';
                    opt.style.background = '#f0fdf4';
                }
            });
        }
    }
    answerDiv.classList.toggle('revealed');
}
```

### Slide Count
When quiz is added, update the static slide count in `<div class="slide-number">` to reflect the new total: original slides + 1 (quiz section header) + 100 (questions). The JS dynamically recalculates using `slides.length`, so it auto-corrects at runtime, but the static text should also be updated for consistency.

### Implementation Strategy: Batching

Due to response length limits, inserting all 100 questions in a single edit is not feasible. Use this batching approach:

1. **First batch**: Add quiz CSS + JS + quiz section header + Q1-Q10 in one edit
2. **Subsequent batches**: Insert Q11-Q20, Q21-Q30, ..., Q91-Q100 in groups of 10
3. **Anchor each batch**: Replace the closing `</section>` tag of the last question in the previous batch, appending new questions after it. Use a unique string from the last question's explanation as the anchor text (include 3-5 lines of context)
4. **Final step**: Update the static slide count after all questions are inserted

### Post-Generation: Answer Randomization Script

After generating all questions, the answer distribution will almost certainly be skewed (typically ~90% B). **Always run the shuffle script** after generating questions.

A reusable Python shuffle script is provided at [./references/shuffle_quiz.py](./references/shuffle_quiz.py). Usage:

```bash
python3 .github/skills/ddia-presentation/references/shuffle_quiz.py chapterN/presentation.html
```

The script:
- Parses all quiz questions using regex
- Randomly shuffles option positions within each question
- Updates the `checkAnswer()` call and `Answer: X)` text to match the new correct letter
- Fixes indentation after shuffle
- Prints the resulting distribution (target: ~25% each for A/B/C/D)
- Uses a fixed random seed for reproducibility (change the seed for different distributions)

**After running the script**, verify with:
```bash
grep -o 'Answer: [A-D])' chapterN/presentation.html | sort | uniq -c | sort -rn
```

### Adapting Quiz CSS for Chapter 1's Design System

Chapter 1 uses a different CSS design system than chapters 2+:
- `--accent: #000000` (black) instead of `--accent: #2563eb` (blue)
- No `--accent-light` or `--dark` CSS variables defined
- Section headers use solid `background: #000` instead of gradients

When adding quiz styles to Chapter 1, hardcode the accent colors instead of using CSS variables:
```css
.quiz-number { background: #2563eb; }       /* Use blue directly */
.quiz-topic { background: #dbeafe; color: #2563eb; }
.reveal-btn { background: #2563eb; }
.reveal-btn:hover { background: #1d4ed8; }
.quiz-option.selected { border-color: #2563eb; background: #dbeafe; }
.quiz-option:hover { border-color: #2563eb; }
```
Or add the missing CSS variables to Chapter 1's `:root` block.

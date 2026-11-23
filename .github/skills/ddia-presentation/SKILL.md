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

### 1. Read the full chapter markdown (deep extraction)
Read `chapterN/chapterN.md` completely (or from git history if removed from working tree). Extract:
- The exact epigraph/opening quote
- The **exact numbered book Table of Contents** (`N.1`, `N.2`, …) — mirror these exact sections without inventing or merging sections, so presenters can split or combine sections cleanly
- All figures (`ddia_0N01.png`…) and where they belong in the flow
- **Terminology traps & naming myths** (e.g., overloaded terms across DBs, footnotes distinguishing concepts)
- **Concrete data traces & failure anatomies** (step-by-step key/hash examples, latency waterfalls, cascading failure spirals, partial-write race conditions)
- **Real-world systems** mentioned in the chapter for a Summary Cheat Sheet matrix

### 2. Plan the slide outline
Map the exact chapter TOC structure to slides following this flow:
```
1. Title slide (always first)
2. Opening quote slide (exact chapter epigraph)
3. Why This Chapter Matters — visual comparison SVG
4. Chapter Roadmap — exact numbered TOC sections (N.1 .. N.k)
5. [For each exact book section N.1 .. N.k:]
   a. Section header slide (dark background divider with .part-pill "Section N.X")
   b. Visual-first slides covering ALL mechanisms, figures, edge cases, and footnotes
   c. (Optional) Embedded interactive simulator lab slide
6. Summary section ("Section N.last: Summary")
   a. Visual Architecture Decision Tree SVG
   b. Real-World Database Cheat Sheet (.matrix-table)
   c. Bridge to the next chapter + POC showcase slide (if applicable)
7. Questions slide (always last content slide, before Quiz section)
```
Aim for **45–70 rich visual content slides** (plus the MCQ Quiz section if requested).

### 3. Visual-First Rule & Supporting Images
**Visual-First Rule:** Stock photos do not teach distributed systems. **Every non-trivial mechanism, trade-off, or failure mode MUST be explained through an inline SVG diagram (`.svg-wrap`), step-by-step data trace, or structured matrix (`.matrix-table`)** — never a wall of 5 abstract bullet points.

- **Book figures (`ddia_0NXX.png`)** are **MUST-HAVE** — every single figure must appear in the right section flow using `.image-box` (`object-fit: contain`).
- **Inline SVGs (`.svg-wrap`)** should follow the DDIA palette (`#0f172a` slate, `#2563eb` blue, `#059669` green, `#dc2626` red, `#d97706` amber, `Inter` font) with generous padding so text never clips near viewBox edges.
- **Unsplash photos (optional):** Only use where helpful (e.g., `questions.jpg` on the Q&A slide). If downloading from Unsplash:
  ```bash
  curl -L "https://unsplash.com/photos/{photo-id}/download?w=800" -o chapterN/images/descriptive-name.jpg
  ```
- **Image rules:**
  - Verify every image visually and confirm `naturalWidth > 0` in the browser
  - **NO NSFW content**
  - **NO duplicate images** — each image `src` may appear **at most once** across all slides
  - Use `.image-box` (`contain`) for book diagrams and `.image-box.fill` (`cover`) for photos

### 4. Create the presentation HTML
Use the template in [./references/template.html](./references/template.html) as the starting point. Build the entire file as a single self-contained HTML document.

### 5. Interactive Labs & Companion Dockerized POCs (When Appropriate)
When a chapter's concepts depend on runtime behavior across nodes (hot spots, tail latency, async index lag, rebalancing, routing hops, distributed transactions, consensus):
- **In-slide interactive labs:** Add lightweight JS labs inside `presentation.html` (give the slide container bottom padding `padding-bottom: 52px` so controls never overlap `.slide-number`).
- **Dockerized multi-container POC (`chapterN/<topic>-poc/`):**
  - **100% Dockerized, zero host installs:** Use self-contained runtimes (e.g., Node 22 native TypeScript with zero external `npm install`, or cached official DB images) and **never** commit corporate certs, proxy configs, or internal URLs to a public repo.
  - **Built-in Intro.js-style Interactive Spotlight Tour (zero external CDNs):** Include a `"Start Guided Tour"` button in the POC header that dims the screen (`#tour-spotlight` + `#tour-popover`), auto-switches tabs, executes live multi-container API actions at each step, and explains what just happened so students can run the entire demo independently without anyone explaining it.
  - **Complete Reset:** A `"Reset"` button must restore **both** backend cluster state and all client-side DOM banners, tables, charts, and form controls without requiring a page reload.
  - **Self-Guided `README.md`:** Document 1-command `docker compose up --build -d`, container roles, tour steps, and `docker compose down`.

### 6. Live Browser & Viewport Verification Checklist
After creating or updating `presentation.html` (and any POC), verify both statically and **live in a browser**:
- [ ] Every book figure (`ddia_0NXX.png`) appears in the correct section
- [ ] Every exact book TOC section, subtle trap, and footnote is covered visually
- [ ] Code examples from the book are included with syntax highlighting
- [ ] Static `<div class="slide-number">1 / N</div>` matches actual `<section class="slide">` count
- [ ] All image paths are relative, load with HTTP 200 (`naturalWidth > 0`), and no `src` appears more than once
- [ ] `<title>` follows format: `KT: DDIA Chapter N - Chapter Title`
- [ ] Opening quote matches the book's epigraph verbatim
- [ ] Summary includes a Visual Decision Tree + Real-World DB Cheat Sheet
- [ ] **Browser & viewport check (`~850×780` + desktop):** Zero SVG text clipping, zero overlap with `.slide-number` or `.controls`, interactive labs/tours work, and zero JS console errors

### 7. Update index.html
Ensure root `index.html` links to `chapterN/presentation.html`.

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
Dark full-bleed divider between major topics. Use `.part-pill` to mirror the chapter's exact numbered sections (`Section N.1`, `Section N.2`, ...).
```html
<section class="slide section-header">
    <span class="part-pill">Section N.1</span>
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

### Inline SVG Diagram Container
Use `.svg-wrap` (with `.compact-slide` on the parent `<section>`) for custom architectural diagrams, data-flow traces, latency waterfalls, and decision trees:
```html
<section class="slide content-slide compact-slide">
    <h2>Diagram Title</h2>
    <p>One-sentence intuition.</p>
    <div class="svg-wrap">
        <svg viewBox="0 0 920 260" xmlns="http://www.w3.org/2000/svg" font-family="Inter,sans-serif">
            <!-- Diagrams using #0f172a, #2563eb, #059669, #dc2626, #d97706 -->
        </svg>
    </div>
</section>
```

### Callout Banners & Matrix Tables
```html
<div class="warning-banner"><strong>Trap / Footnote:</strong> Explanation...</div>
<div class="tip-banner"><strong>Key Insight:</strong> Explanation...</div>
<div class="info-banner"><strong>Takeaway:</strong> Explanation...</div>

<table class="matrix-table">
    <thead><tr><th>System</th><th>Strategy</th><th>Trade-Off</th></tr></thead>
    <tbody><tr><td><strong>HBase</strong></td><td>Key Range</td><td>Timestamp hot spot risk</td></tr></tbody>
</table>
```

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
4. **Make concepts effortless to grasp visually** — Use concrete traces, real keys/timestamps, real-world analogies, and clean visual diagrams so students understand complex mechanics just by looking at the slide. Never compress deep mechanisms into vague bullet summaries
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
    <div class="quiz-header">
        <span class="quiz-number">QN</span>
        <span class="quiz-topic">Topic Name</span>
        <span class="quiz-score">Score: 0 / 0</span>
    </div>
    <p class="quiz-question">Question text here?</p>
    <div class="quiz-options">
        <div class="quiz-option" onclick="selectOption(this)">A) First option</div>
        <div class="quiz-option" onclick="selectOption(this)">B) Second option</div>
        <div class="quiz-option" onclick="selectOption(this)">C) Third option</div>
        <div class="quiz-option" onclick="selectOption(this)">D) Fourth option</div>
    </div>
    <div class="quiz-answer">
        <button class="reveal-btn" onclick="checkAnswer(this, ['C'])">Check Answer</button>
        <div class="quiz-explanation"><strong>Answer: C)</strong> Explanation referencing the chapter's mechanism and why the alternatives fall short.</div>
    </div>
</section>
```

### Quiz Content Rules

1. **Source material** — ALL questions must come exclusively from the chapter markdown (including footnotes and real-world system references). Do not invent topics outside the chapter
2. **100 questions (proportional to section depth)** — Distribute questions proportionally across the chapter's exact sections (`N.1` .. `N.last`) in chapter flow order
3. **Question mix (~60% scenario/debugging/trade-off, ~40% core mechanics)** — Favor applied engineering scenarios (diagnosing hot spots, tail latency stalls, migration storms, stale reads, failure cascades, choosing the right system/strategy) over trivial rote definitions
4. **4 single-choice options (A–D)** — Each question has one clearly correct answer and three technically plausible distractors
5. **Rich explanations** — Explain *why* the correct option works and briefly contrast why the main distractor/trade-off fails
6. **Topic tags & sequential numbering** — Each question gets a concise `quiz-topic` and sequential `Q1`–`Q100`

### CRITICAL: Two Golden Rules for Quiz Quality

#### Rule 1: Fair Answer Distribution

**Target**: Exactly 25 each of A, B, C, D for 100 questions (±3 is acceptable, e.g., 22–28 range).

**How to achieve**: After authoring, run [./references/shuffle_quiz.py](./references/shuffle_quiz.py) to balance option positions cleanly.

#### Rule 2: Zero Longest-Answer Tells (Substantive Peer-Length Distractors)

**Target**: Ideally **0** (and strictly **≤ 25**) questions where the correct answer is uniquely the longest option.

**Why it matters**: If the correct answer is almost always longest (e.g., 80%+ of questions), test-takers can guess without knowing the material.

**How to achieve**:
- **Primary (and required) approach**: Make ALL four options **substantive, domain-plausible, and roughly equal in length** at authoring time. Every incorrect distractor must represent a realistic distributed-systems misconception from the chapter rather than a throwaway stub.
- **What to avoid**: NEVER append robotic filler phrases (`"for typical production workloads"`, `"across multiple independent nodes..."`, `"(see text)"`) to inflate option length—those create obvious tells and degrade quiz quality.

**Verification checklist**:
```bash
# 1. Check A/B/C/D balance (expect ~25 each)
grep -o 'Answer: [A-D])' chapterN/presentation.html | sort | uniq -c | sort -rn

# 2. Check uniquely-longest correct answers (target 0, strictly <= 25) and robotic padding (must be 0)
python3 -c "
import re
html = open('chapterN/presentation.html').read()
longest = []
for m in re.finditer(r'(<!-- Q\d+ -->.*?</section>)', html, re.DOTALL):
    ans = re.search(r\"checkAnswer\(this, \['([A-D])'\]\)\", m.group(1)).group(1)
    opts = re.findall(r'<div class=\"quiz-option[^>]*>([A-D])\) (.*?)</div>', m.group(1))
    lengths = [(l, len(t.strip())) for l, t in opts]
    mx = max(l[1] for l in lengths)
    if [l[1] for l in lengths if l[0] == ans][0] == mx and sum(1 for l in lengths if l[1] == mx) == 1:
        longest.append(re.search(r'Q(\d+)', m.group(1)).group(1))
print('Uniquely longest count:', len(longest), longest[:15])
"
```

### Quiz CSS, JavaScript & Assembly

For the complete 2×2 Quiz CSS (including `@media (max-width: 960px)` overflow clearance), single-select + live-score JavaScript, batching/subagent assembly workflow, `shuffle_quiz.py` usage, and Chapter 1 styling notes, see [./references/quiz-guide.md](./references/quiz-guide.md).

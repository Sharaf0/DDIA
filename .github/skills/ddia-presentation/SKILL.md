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

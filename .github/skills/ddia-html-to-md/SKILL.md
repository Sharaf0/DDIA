---
name: ddia-html-to-md
description: 'Convert DDIA (Designing Data-Intensive Applications) HTML chapters to markdown. Use when: converting draft.html files to markdown, processing chapters 4-12, HTML to MD conversion for DDIA book chapters.'
---

# DDIA HTML-to-Markdown Conversion

## When to Use
- Converting any `draft.html` in chapters 4-12 to markdown
- Fixing or updating existing chapter markdown files
- Applying consistent formatting across all DDIA chapter markdown

## Source Structure

Each chapter folder has:
- `draft.html` — source HTML (O'Reilly web reader format, 2000-7500 lines)
- `images/` — PNG figures named `ddia_XXYY.png` (XX=chapter, YY=figure number)

## Conversion Procedure

### 1. Survey the chapter
```bash
wc -l chapterN/draft.html
ls chapterN/images/
grep -n '<h1\|<h2\|<h3' chapterN/draft.html
```
Know the line count, number of images, and full section structure **before** starting. The `grep` output gives you a complete map of every section with line numbers — this is essential for planning chunks and for delegating to subagents.

### 2. Read and convert in chunks — MANDATORY WORKFLOW
**CRITICAL: You MUST work chunk by chunk. NEVER attempt all-or-nothing conversion.**

The workflow is strictly sequential:
1. **Create the file FIRST** with chunk 1 (title + epigraph + intro + first h1 section) using `create_file`
2. **Then append** each subsequent chunk using `replace_string_in_file` (anchor on the last paragraph of the file)
3. **Read HTML** in 500-800 line ranges, convert to markdown, append immediately
4. **Never buffer** multiple sections in memory before writing — write each chunk as soon as it's ready
5. **Never try to convert the whole file at once** — token limits WILL cut you off and you'll lose everything

Each chunk should be one logical section (an h1 or h2 with its subsections). For very large sections, split further.

#### Using subagents for efficiency
For chapters with many sections, **subagents** can convert and append entire h1 sections autonomously. Provide the subagent with:
- The exact file path and line range to read
- The full section structure map (from the grep output)
- All formatting rules (copy/paste the conventions below)
- The anchor text for `replace_string_in_file` (last paragraph of the current file)
- Explicit instruction to include EVERY paragraph and not summarize

Subagents work best for:
- Middle-to-late sections where the pattern is well-established
- Footnotes and references sections (repetitive formatting)
- Large h1 sections with many h3 subsections

Always verify the subagent's output (line count, figure count, internal links) after it runs.

### 3. Commit after each major section
- Don't wait until the end to commit
- Commit after every 2-3 chunks to avoid losing progress
- A partially-committed chapter is infinitely better than a lost conversion

## Markdown Formatting Conventions

### Headings
| HTML | Markdown |
|------|----------|
| `<h1>` (chapter title) | `Title\n=================================` (long underline) |
| `<h1>` (top-level sections) | `Section Name\n=====` |
| `<h2>` (subsections) | `Subsection Name\n-----` |
| `<h3>` (sub-subsections) | `### Sub-subsection Name` |

### Figures
```markdown
![Figure N-M](images/ddia_XXYY.png)

###### Figure N-M. Caption text here.
```
- Image path is always `images/ddia_XXYY.png` (relative)
- Caption on separate line with `######` prefix
- Blank line between the image reference and the caption

### Examples
```markdown
##### Example N-M. Title of the example
```

### Code Blocks
- Use fenced code blocks with language tag: ` ```sql `, ` ```bash `, ` ```json `, ` ```ruby `, etc.
- **Critical**: Strip ALL `<code class="...">` syntax-highlighting tags from HTML
- The HTML wraps every token in `<code class="k">`, `<code class="n">`, etc. — extract raw text only
- Watch for shell variables like `$1`, `$2` — preserve them literally
- Watch for `&amp;` → `&`, `&lt;` → `<`, `&gt;` → `>`

### Tables
```markdown
| Header 1 | Header 2 | Header 3 |
| --- | --- | --- |
| Cell 1 | Cell 2 | Cell 3 |

###### Table N-M. Caption text.
```

### Definition Lists
```markdown
Term here
: Definition text here. Can span multiple lines.

Another term
: Another definition.
```
Used for comparison lists, index types, Summary sections, etc.

When a definition has multiple paragraphs, use multiple `: ` continuations under the same term:
```markdown
Term here
: First paragraph of definition.

: Second paragraph continuing the same definition.
```

### Notes
```markdown
###### Note

Note text goes here as a regular paragraph.
```

For titled notes (like "Column-oriented storage and column families"):
```markdown
###### Title of the Note

Note text goes here.
```

### Emphasis and Inline Code
- `_italic text_` for emphasized terms, first-use technical terms
- `` `code` `` for inline code, function names, column names, SQL keywords
- `**bold**` (rarely used in this book)

### Footnotes
Footnotes appear in the HTML at the end in `<div data-type="footnotes">`. Format:
```markdown
##### Footnotes

^i Some people love to point out that `cat` is unnecessary here...

^ii Another example of a uniform interface is URLs and HTTP...

^iii Except by using a separate tool, such as `netcat` or `curl`...
```
- Use `^i`, `^ii`, `^iii`, `^iv`, `^v`, `^vi`, etc. (caret prefix + Roman numeral)
- Place at the end of the chapter, after Summary, before References
- Strip inline footnote markers from body text (the superscript `[i]`, `[ii]` links)

### References
In body text:
- `\[N\]` (escaped brackets, no link) — e.g., `\[47\]`

In references section at end of file:
```markdown
##### References

\[1\] Jeffrey Dean and Sanjay Ghemawat: "[MapReduce: Simplified Data Processing on Large Clusters](https://research.google/pubs/pub62/)," at *6th USENIX Symposium on Operating System Design and Implementation* (OSDI), December 2004.

\[2\] Joel Spolsky: "[The Perils of JavaSchools](https://www.joelonsoftware.com/2005/12/29/the-perils-of-javaschools-2/)," *joelonsoftware.com*, December 29, 2005.
```
- **Keep external URLs** as markdown links: `[Title](url)`
- **Remove internal links** (`ch0X.html#...` anchors)
- Conference/journal names in `*italics*`
- DOIs as separate links when present: `[doi:10.xxxx/yyyy](http://dx.doi.org/10.xxxx/yyyy)`

### Cross-references
- `Chapter N` (plain text, no link) — e.g., `Chapter 2`
- `Figure N-M` (plain text, no link) — e.g., `Figure 3-1`
- `"Section Name"` (quoted, no link) — e.g., `"Comparing B-Trees and LSM-Trees"`

### Epigraphs
```markdown
> _Quote text here._
>
> — Attribution, _Source_ (Year)
```

## Common HTML Patterns and Their Markdown

### Syntax-highlighted code (MOST COMMON PITFALL)
The HTML wraps every single token:
```html
<code class="k">SELECT</code> <code class="n">col</code>
```
Extract → `SELECT col`

**This is where most errors happen.** The HTML code blocks have dozens of `<code>` tags per line. You must strip them all and reconstruct the raw code.

### Index terms — IGNORE
```html
<a data-type="indexterm" data-primary="B-trees" id="..."></a>
```
These are invisible index markers. Skip them entirely. They are scattered throughout every paragraph.

### Footnote references in body text — REMOVE
```html
<sup><a data-type="noteref" href="ch03.html#idm..." aria-label="Footnote i">i</a></sup>
```
These become nothing in the body text. The footnote content is at the end under `<div data-type="footnotes">`.

### Keep-together spans — IGNORE
```html
<span class="keep-together">text</span>
```
Just use the inner text.

### xref links — EXTRACT TEXT ONLY
```html
<a data-type="xref" href="#fig_storage_b_tree">Figure 3-6</a>
```
Becomes just: `Figure 3-6`

```html
<a data-type="xref" href="ch03.html#sec_storage_dwh">"Data Warehousing"</a>
```
Becomes just: `"Data Warehousing"`

### noteref links — EXTRACT NUMBER
```html
[<a data-type="noteref" href="ch10.html#Dean2004ua_ch10" aria-label="Footnote 1">1</a>]
```
Becomes: `\[1\]`

### data-type="note" blocks
```html
<div data-type="note"><h6>Note</h6><p>text</p></div>
```
Becomes:
```markdown
###### Note

text
```

## Verification Checklist

After completing a chapter, verify:
```bash
# Line count (should be 500-1200 for most chapters)
wc -l chapterN/chapterN.md

# All images referenced
grep -c '!\[Figure' chapterN/chapterN.md  # should match image count

# All figure captions present
grep -c '###### Figure' chapterN/chapterN.md  # should match image count

# No remaining internal links
grep -c 'ch[0-9]*\.html' chapterN/chapterN.md  # should be 0

# Code block balance (should be even number)
grep -c '```' chapterN/chapterN.md

# Section structure
grep -n '=====$' chapterN/chapterN.md   # h1 sections
grep -n '-----$' chapterN/chapterN.md   # h2 sections
grep -c '^### ' chapterN/chapterN.md    # h3 count
```

## Completed Chapter Stats (Reference)

| Chapter | HTML Lines | MD Lines | Figures | Footnotes | References |
|---------|-----------|----------|---------|-----------|------------|
| 3       | 3981      | 750      | 12      | 4 (i-iv)  | 64         |
| 4       | ~3000     | ~700     | 10      | varies    | varies     |
| 5       | ~3500     | ~800     | 9       | varies    | varies     |
| 6       | ~2500     | ~600     | 8       | varies    | varies     |
| 7       | ~4500     | ~1000    | 3       | varies    | varies     |
| 8       | ~3500     | ~750     | 10      | varies    | varies     |
| 9       | ~7000     | 1180     | 10      | 13 (i-xiii)| 110       |
| 10      | 5582      | 910      | 3       | 6 (i-vi)  | 81         |
| 11      | 5950      | 927      | 7       | 3 (i-iii) | 100        |
| 12      | 7450      | 1157     | 1       | 3 (i-iii) | 114        |

## Order of Sections in Output File

The markdown file must follow this exact order:
1. **Chapter title** with `=================================` underline
2. **Epigraph** (blockquote with attribution)
3. **Intro paragraphs** (before first h1 section)
4. **All h1 sections** in document order, each with their h2/h3 subsections
5. **Summary** (the last h1 section)
6. **`##### Footnotes`** section with `^i`, `^ii`, etc.
7. **`##### References`** section with `\[1\]`, `\[2\]`, etc.

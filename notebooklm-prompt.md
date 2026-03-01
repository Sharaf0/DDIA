# NotebookLM Prompt — DDIA Chapter Deep Dive

Use this prompt when generating audio/video/slides/QAs from any chapter of "Designing Data-Intensive Applications" (DDIA) by Martin Kleppmann. Replace `[CHAPTER_NUMBER]` and `[CHAPTER_TITLE]` with the relevant chapter info.

---

## Prompt

Explain content — along with every image, figure, diagram, and example — **comprehensively, deeply, thoroughly, and holistically**.

### Audience & Tone
- **Do not assume I know anything** about the topic. Start from the very basics and build up to the deepest, most nuanced details.
- Explain it like you would to a smart, curious person who is encountering these concepts for the first time — not to oversimplify, but to ensure a solid foundation before layering on complexity.
- Use clear analogies and real-world examples wherever they help solidify understanding.

### Depth & Coverage
- **Do not skip or gloss over any detail**, no matter how small. Every footnote, every sidebar, every code example, every figure caption matters.
- Walk through each figure/image explicitly: describe what it shows, why it's important, and how it connects to the surrounding text.
- For every code example, explain what it does line by line, why it's written that way, and what concept it demonstrates.
- Cover all comparisons, trade-offs, and design decisions discussed in the chapter. Explain the "why" behind each, not just the "what."
- When the chapter references other chapters or external concepts, briefly contextualize them so the listener doesn't feel lost.

### Structure & Flow
- Follow the chapter's natural structure and progression — section by section, subsection by subsection.
- Clearly signal transitions between topics (e.g., "Now we move from the relational model to the document model...").
- Summarize key takeaways at the end of each major section before moving on.
- End with a comprehensive chapter summary that ties all the concepts together.

### Quality Bar
- After listening to the produced media, I want to understand the topic **end to end with at least 90% comprehension**, and be able to **confidently present it to my team** afterward.
- **Do not make the media short** in a way that sacrifices detail or depth. Completeness is more important than brevity.
- If a concept requires a longer explanation to be truly understood, take the time to explain it fully.

### Key Principles
- Accuracy over speed: get the technical details right.
- Clarity over jargon: define every term before using it freely.
- Connection over isolation: show how concepts relate to each other and to the bigger picture of data-intensive application design.

#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const postsDir = join(repoRoot, "posts");
const FILENAME = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const BANNED_TITLE_WORDS = ["一文读懂", "深度解析", "浅谈", "你必须知道", "99% 的人", "99%的人"];
const ESCALATION_WORDS = ["本质上", "归根结底", "说到底", "更深一层", "根源在于"];
const STRAWMAN_PHRASES = ["有人可能会问", "你可能会觉得", "你可能会问", "有人会说"];
const PARAGRAPH_OPENERS = ["值得注意的是", "事实上", "此外", "然而"];
const DRAMA_WORDS = ["迎头相撞", "死局", "钉死", "铁律", "死规矩", "浮出", "撕开", "掀开", "下刀", "横竖", "真相", "盲区", "接缝", "纹丝不动", "干干净净", "硬生生", "当场", "顺手牵羊", "一劳永逸", "从来不是", "唯一正确"];
const INTENSIFIERS = ["必须", "绝不", "根本", "绝对", "彻底"];
const INFERENCE_LABELS = ["推断：", "未验证假设"];
const MAX_INTENSIFIERS_PER_1000 = 1;
const MAX_PARAGRAPH_CHARS = 300;
const MAX_PUNCH_PARAGRAPH_CHARS = 20;
const SERIES_LABELS = ["上文", "下文", "旁支"];

function listPosts() {
  return readdirSync(postsDir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => join(postsDir, name));
}

function splitFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return { frontmatter: null, body: text, bodyStartLine: 1 };
  return {
    frontmatter: match[1],
    body: text.slice(match[0].length),
    bodyStartLine: match[0].split("\n").length,
  };
}

function frontmatterValue(frontmatter, key) {
  return frontmatter.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"))?.[1].trim();
}

function unquote(value) {
  return value?.replace(/^"(.*)"$/, "$1");
}

function proseLines(body, bodyStartLine) {
  const lines = [];
  let fence = null;
  body.split(/\r?\n/).forEach((text, index) => {
    const fenceMatch = text.match(/^\s*(```|~~~)/);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1];
      else if (fenceMatch[1] === fence) fence = null;
      return;
    }
    if (!fence) lines.push({ text, line: bodyStartLine + index });
  });
  return lines;
}

function paragraphsOf(lines) {
  const paragraphs = [];
  let current = null;
  for (const { text, line } of lines) {
    const isProse = text.trim() !== "" && !/^\s*(#|\||[-*+]\s|\d+\.\s|---\s*$)/.test(text);
    if (isProse) {
      if (current) current.text += text.trim();
      else current = { text: text.replace(/^>\s?/, "").trim(), line, isQuote: /^\s*>/.test(text) };
    } else if (current) {
      paragraphs.push(current);
      current = null;
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}

function renderedText(markdown) {
  return markdown.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\*\*|__/g, "");
}

function charCount(text) {
  return text.replace(/[A-Za-z0-9_.+-]+/g, "x").replace(/\s/g, "").length;
}

function sentencesOf(text) {
  const sentences = [];
  let current = "";
  let quoteDepth = 0;
  for (const char of text) {
    current += char;
    if ("「“".includes(char)) quoteDepth++;
    else if ("」”".includes(char)) quoteDepth = Math.max(0, quoteDepth - 1);
    else if (quoteDepth === 0 && "。！？!?".includes(char)) {
      sentences.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) sentences.push(current.trim());
  return sentences;
}

function lintPost(file, publishedSlugs) {
  const findings = [];
  const report = (severity, line, rule, message) => findings.push({ file, severity, line, rule, message });
  const text = readFileSync(file, "utf8");
  const name = basename(file);
  const { frontmatter, body, bodyStartLine } = splitFrontmatter(text);

  if (!frontmatter) {
    report("error", 1, "frontmatter", "missing YAML frontmatter block");
    return findings;
  }
  const fileMatch = name.match(FILENAME);
  if (!fileMatch) report("error", 1, "filename", `expected posts/<YYYY-MM-DD>-<slug>.md, got ${name}`);

  const title = frontmatterValue(frontmatter, "title");
  const slug = frontmatterValue(frontmatter, "slug");
  const language = frontmatterValue(frontmatter, "language");
  const description = frontmatterValue(frontmatter, "description");
  if (!title) report("error", 2, "frontmatter", "missing title");
  if (!slug) report("error", 2, "frontmatter", "missing slug");
  else if (fileMatch && slug !== fileMatch[2]) report("error", 2, "frontmatter", `slug "${slug}" does not match filename slug "${fileMatch[2]}"`);
  if (language !== "zh-CN") report("error", 2, "frontmatter", `language must be zh-CN, got ${language ?? "nothing"}`);
  if (!description || !/^".+"$/.test(description)) report("error", 2, "frontmatter", "description must be a double-quoted string");
  if (!/^tags:[ \t]*\r?\n([ \t]+- .+\r?\n?)+/m.test(frontmatter)) report("error", 2, "frontmatter", "tags must be a non-empty YAML list");

  for (const word of BANNED_TITLE_WORDS) {
    if (unquote(title)?.includes(word)) report("error", 2, "title-banned-word", `title contains 「${word}」 (WRITING.md §2)`);
  }

  const lines = proseLines(body, bodyStartLine);

  for (const { text: lineText, line } of lines) {
    for (const [, target] of lineText.matchAll(/\]\(\/notes\/([^/)#]+)\/?[^)]*\)/g)) {
      if (!publishedSlugs.has(target)) report("error", line, "internal-link", `/notes/${target}/ does not match any post slug`);
    }
  }

  const seriesItems = new Map();
  for (const { text: lineText, line } of lines) {
    const match = lineText.match(/^\s*[-*]\s+(?:\*\*)?(上文|下文|旁支)(?:\*\*)?\s*[：:]/);
    if (match) seriesItems.set(match[1], { text: lineText, line });
  }
  if (!seriesItems.has("上文")) {
    report("error", lines.at(-1)?.line ?? 1, "series-links", "ending lacks the 「上文」 item (BRIEF.md §2)");
  }
  for (const label of ["下文", "旁支"]) {
    const item = seriesItems.get(label);
    if (item && !/\]\(\/notes\/[^)]+\)/.test(item.text)) {
      report("error", item.line, "series-links", `「${label}」 names no /notes/<slug>/ link; point it at a published post or drop it until one exists`);
    }
  }
  const missing = SERIES_LABELS.filter((label) => !seriesItems.has(label));
  if (seriesItems.has("上文") && missing.length) {
    report("warning", seriesItems.get("上文").line, "series-links", `ending lacks ${missing.map((l) => `「${l}」`).join("")}; only a series-first post may, and it must be backfilled when the next post publishes`);
  }

  const paragraphs = paragraphsOf(lines);
  const openerParagraphs = paragraphs.filter((p) => PARAGRAPH_OPENERS.some((opener) => p.text.startsWith(opener)));
  const proseChars = paragraphs.reduce((sum, p) => sum + charCount(renderedText(p.text)), 0);
  const openerLimit = Math.max(1, Math.floor(proseChars / 1000));
  if (openerParagraphs.length > openerLimit) {
    for (const p of openerParagraphs) {
      report("warning", p.line, "paragraph-opener", `${openerParagraphs.length} paragraphs open with a connector, limit ${openerLimit} for this length (WRITING.md §5)`);
    }
  }

  for (const paragraph of paragraphs) {
    const rendered = renderedText(paragraph.text);
    const chars = charCount(rendered.replaceAll("`", ""));
    if (chars > MAX_PARAGRAPH_CHARS) {
      report("warning", paragraph.line, "paragraph-length", `paragraph has ${chars} chars, limit ${MAX_PARAGRAPH_CHARS} (WRITING.md §5)`);
    }
    const isPunchLine = !paragraph.isQuote && sentencesOf(rendered).length === 1 && chars <= MAX_PUNCH_PARAGRAPH_CHARS && !/[：:]$/.test(rendered) && !/\d/.test(rendered);
    if (isPunchLine) {
      report("warning", paragraph.line, "punch-paragraph", `「${rendered}」 stands alone as a verdict; fold it into the paragraph whose evidence it sums up (WRITING.md §5)`);
    }
  }

  const intensifierHits = [];
  for (const { text: lineText, line } of lines) {
    if (/^#{2,}\s/.test(lineText) && /[？?]\s*$/.test(lineText)) {
      report("warning", line, "question-heading", `heading is a question; name what the section covers (WRITING.md §4)`);
    }
    if (/^\s*(#|\|)/.test(lineText)) continue;
    for (const word of DRAMA_WORDS) {
      if (lineText.includes(word)) report("warning", line, "drama-word", `「${word}」; say who did what and what happened (WRITING.md §6)`);
    }
    for (const label of INFERENCE_LABELS) {
      if (lineText.includes(label)) report("warning", line, "inference-label", `「${label}」; state the uncertainty in plain words inside the sentence (WRITING.md §7)`);
    }
    for (const word of INTENSIFIERS) {
      for (let i = lineText.indexOf(word); i !== -1; i = lineText.indexOf(word, i + 1)) intensifierHits.push({ word, line });
    }
  }
  const intensifierLimit = Math.max(1, Math.floor((proseChars * MAX_INTENSIFIERS_PER_1000) / 1000));
  if (intensifierHits.length > intensifierLimit) {
    for (const { word, line } of intensifierHits) {
      report("warning", line, "intensifier", `「${word}」: ${intensifierHits.length} intensifiers, limit ${intensifierLimit} for this length; give the condition and consequence instead (WRITING.md §6)`);
    }
  }

  for (const { text: lineText, line } of lines) {
    for (const word of ESCALATION_WORDS) {
      if (lineText.includes(word)) report("warning", line, "escalation-word", `「${word}」 (WRITING.md §6 升维)`);
    }
    for (const phrase of STRAWMAN_PHRASES) {
      if (lineText.includes(phrase)) report("warning", line, "strawman", `「${phrase}」 (WRITING.md §6 假想反驳; a real question needs who asked it)`);
    }
  }

  return findings;
}

function format({ file, severity, line, rule, message }) {
  const path = relative(repoRoot, file).replaceAll("\\", "/");
  if (process.env.GITHUB_ACTIONS === "true") return `::${severity} file=${path},line=${line},title=${rule}::${message}`;
  return `${path}:${line}: ${severity} ${rule}: ${message}`;
}

const allPosts = listPosts();
const publishedSlugs = new Set(allPosts.map((file) => basename(file).match(FILENAME)?.[2]).filter(Boolean));
const targets = process.argv.length > 2 ? process.argv.slice(2).map((arg) => resolve(arg)) : allPosts;
const findings = targets.flatMap((file) => lintPost(file, publishedSlugs));
for (const finding of findings) console.log(format(finding));
const errors = findings.filter((f) => f.severity === "error").length;
console.log(`lint-posts: ${targets.length} post(s), ${errors} error(s), ${findings.length - errors} warning(s)`);
process.exitCode = errors ? 1 : 0;

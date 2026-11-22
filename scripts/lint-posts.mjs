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
const MAX_SENTENCE_CHARS = 55;
const MAX_PARAGRAPH_CHARS = 250;
const MIN_EXTERNAL_LINKS = 3;
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
      else current = { text: text.replace(/^>\s?/, "").trim(), line };
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

function countedSentenceText(rendered) {
  return rendered.replace(/`[^`]*`/g, "").replace(/「[^」]*」|“[^”]*”|"[^"]*"/g, "");
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
  const bodyText = lines.map((l) => l.text).join("\n");

  const externalLinks = bodyText.match(/\]\(https?:\/\/[^)]+\)/g) ?? [];
  if (externalLinks.length < MIN_EXTERNAL_LINKS) {
    report("error", bodyStartLine, "external-links", `${externalLinks.length} external links, need at least ${MIN_EXTERNAL_LINKS} (WRITING.md §8)`);
  }

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
  const openerLimit = Math.max(1, Math.floor(paragraphs.reduce((sum, p) => sum + charCount(renderedText(p.text)), 0) / 1000));
  if (openerParagraphs.length > openerLimit) {
    for (const p of openerParagraphs) {
      report("warning", p.line, "paragraph-opener", `${openerParagraphs.length} paragraphs open with a connector, limit ${openerLimit} for this length (WRITING.md §9)`);
    }
  }

  for (const paragraph of paragraphs) {
    const rendered = renderedText(paragraph.text);
    if (charCount(rendered.replaceAll("`", "")) > MAX_PARAGRAPH_CHARS) {
      report("warning", paragraph.line, "paragraph-length", `paragraph has ${charCount(rendered.replaceAll("`", ""))} chars, limit ${MAX_PARAGRAPH_CHARS} (WRITING.md §5)`);
    }
    for (const sentence of sentencesOf(rendered)) {
      if (charCount(countedSentenceText(sentence)) > MAX_SENTENCE_CHARS) {
        report("warning", paragraph.line, "sentence-length", `${charCount(countedSentenceText(sentence))} chars: ${sentence.slice(0, 30)}… (WRITING.md §6, limit ${MAX_SENTENCE_CHARS})`);
      }
    }
  }

  for (const { text: lineText, line } of lines) {
    for (const word of ESCALATION_WORDS) {
      if (lineText.includes(word)) report("warning", line, "escalation-word", `「${word}」 (WRITING.md §9 升维, limit 0)`);
    }
    for (const phrase of STRAWMAN_PHRASES) {
      if (lineText.includes(phrase)) report("warning", line, "strawman", `「${phrase}」 (WRITING.md §9 假想反驳, limit 0)`);
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

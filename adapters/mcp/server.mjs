#!/usr/bin/env node
// problem-namer as an MCP server (stdio transport, zero dependencies).
// Exposes:
//   tool     name_problem(description)  -> ranked catalog candidates, or an
//            explicit no-match (never a forced pick — NIL is a real outcome)
//   resource problem-namer://<dir>/<file> for every local catalog
//   prompt   name-this — user-invoked "what is this called?"
//
// Register in Claude Code:  claude mcp add problem-namer -- node /path/to/adapters/mcp/server.mjs
// Any other MCP client: command = node, args = [.../adapters/mcp/server.mjs]
import { readFileSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { loadIndexes, buildScorer, topCandidates } from "../../core/matcher.mjs";

const DIRS = { indexes: new URL("../../indexes/", import.meta.url), examples: new URL("../../examples/", import.meta.url) };

function catalogFiles() {
  const out = [];
  for (const [label, dir] of Object.entries(DIRS)) {
    let files = [];
    try { files = readdirSync(dir); } catch { continue; }
    for (const f of files) if (f.endsWith(".json")) out.push({ label, file: f, dir });
  }
  return out;
}

function nameProblem(description) {
  const index = loadIndexes([DIRS.indexes, DIRS.examples]);
  if (!index.length) {
    return "No local catalog installed (indexes/ and examples/ are empty). Name the problem from your own knowledge and verify the name with web search before asserting it; if you cannot name it confidently, say so.";
  }
  const cands = topCandidates(buildScorer(index)(description));
  if (!cands.length) {
    return "NO MATCH: the local catalog has no strong candidate for this description. This is a real outcome, not an error — do not stretch a weak match. Name it from your own knowledge (verify with web search) or tell the user no established name was found.";
  }
  const lines = cands.map(({ e, s }) => {
    const disc = e.distinguish.length ? `\n  distinct from: ${e.distinguish.join("; ")}` : "";
    return `${e.name}  [${e.cat}]  (score ${s.toFixed(1)})\n  symptom: ${e.symptom}${disc}\n  unlocks: ${e.unlocks}`;
  });
  return `Catalog candidates (ranked; hints, not verdicts — verify fit before asserting, and prefer saying "no clear match" over forcing one):\n\n${lines.join("\n\n")}\n\nIf the top two are close, ask the user the question that discriminates between them rather than guessing.`;
}

const TOOL = {
  name: "name_problem",
  description: "Look up the canonical NAME of a problem, effect, or pattern the user is describing without naming it (e.g. they describe symptoms like 'retries feeding each other until traffic melts down' and this returns 'Retry Storm / Metastable failure'). Call this when the user is circling an unnamed phenomenon, asks 'is there a name for this?', or when naming the situation would let them search for prior art. Returns ranked candidates from a local symptom-first catalog, or an explicit no-match.",
  inputSchema: {
    type: "object",
    properties: { description: { type: "string", description: "The situation as the user describes it, symptoms included — the more of their own words, the better the match." } },
    required: ["description"],
  },
};

const PROMPT = {
  name: "name-this",
  description: "Identify the canonical name of the problem being described (in the argument, or in the conversation so far).",
  arguments: [{ name: "description", description: "The situation to name; omit to use the conversation so far.", required: false }],
};

const respond = (id, result) => send({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });
const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let req;
  try { req = JSON.parse(line); } catch { return; }
  const { id, method, params } = req;
  try {
    switch (method) {
      case "initialize":
        respond(id, {
          protocolVersion: params?.protocolVersion || "2025-06-18",
          capabilities: { tools: {}, resources: {}, prompts: {} },
          serverInfo: { name: "problem-namer", version: "0.2.0" },
        });
        break;
      case "ping":
        respond(id, {});
        break;
      case "tools/list":
        respond(id, { tools: [TOOL] });
        break;
      case "tools/call": {
        if (params?.name !== "name_problem") return fail(id, -32602, `unknown tool: ${params?.name}`);
        const description = String(params?.arguments?.description ?? "");
        if (!description.trim()) return fail(id, -32602, "description is required");
        respond(id, { content: [{ type: "text", text: nameProblem(description) }], isError: false });
        break;
      }
      case "resources/list":
        respond(id, {
          resources: catalogFiles().map(({ label, file }) => ({
            uri: `problem-namer://${label}/${file}`,
            name: `${label}/${file}`,
            description: `Symptom-first catalog of named problems (${label})`,
            mimeType: "application/json",
          })),
        });
        break;
      case "resources/read": {
        const m = String(params?.uri ?? "").match(/^problem-namer:\/\/(indexes|examples)\/([\w.-]+\.json)$/);
        if (!m || m[2].includes("..")) return fail(id, -32602, `unknown resource: ${params?.uri}`);
        let text;
        try { text = readFileSync(new URL(m[2], DIRS[m[1]]), "utf-8"); } catch { return fail(id, -32602, `unknown resource: ${params?.uri}`); }
        respond(id, { contents: [{ uri: params.uri, mimeType: "application/json", text }] });
        break;
      }
      case "prompts/list":
        respond(id, { prompts: [PROMPT] });
        break;
      case "prompts/get": {
        if (params?.name !== "name-this") return fail(id, -32602, `unknown prompt: ${params?.name}`);
        const desc = params?.arguments?.description;
        const target = desc ? `this situation:\n\n${desc}` : "the situation described in the conversation so far";
        respond(id, {
          description: PROMPT.description,
          messages: [{
            role: "user",
            content: { type: "text", text: `Identify the canonical NAME of the problem, phenomenon, or effect in ${target}.\n\nUse the name_problem tool if available; verify the name with web search if you can. Give the established name, one line on what knowing it unlocks (the canonical analysis or fix), and how to tell it apart from its most confusable neighbor. If no established name confidently fits, say so plainly — do not invent or stretch one.` },
          }],
        });
        break;
      }
      default:
        // Notifications (no id) are fine to ignore; unknown requests get an error.
        if (id !== undefined) fail(id, -32601, `method not found: ${method}`);
    }
  } catch (err) {
    if (id !== undefined) fail(id, -32603, String(err?.message ?? err));
  }
});

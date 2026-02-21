const terminalOutput = document.getElementById("terminalOutput");
const terminalForm = document.getElementById("terminalForm");
const terminalInput = document.getElementById("terminalInput");
const fileTree = document.getElementById("fileTree");
const cwdChip = document.getElementById("cwdChip");
const agentState = document.getElementById("agentState");
const agentLog = document.getElementById("agentLog");

const checks = Array.from(document.querySelectorAll("input[data-tool]"));
const agentPlanBtn = document.getElementById("agentPlan");
const agentStepBtn = document.getElementById("agentStep");
const agentAutoBtn = document.getElementById("agentAuto");

const state = {
  cwd: "/home/agent",
  users: ["agent"],
  vfs: {
    "/": { type: "dir" },
    "/home": { type: "dir" },
    "/home/agent": { type: "dir" },
    "/home/agent/README.txt": {
      type: "file",
      content:
        "Codex Mini OS sandbox. Try commands: help, ls, cat README.txt, write notes.txt hello",
    },
    "/home/agent/notes": { type: "dir" },
    "/tmp": { type: "dir" },
  },
  policy: {
    read: true,
    write: true,
    delete: false,
    shell: false,
  },
  plannedSteps: [],
  audit: [],
};

function pathJoin(cwd, maybeRelative) {
  if (!maybeRelative || maybeRelative === ".") return cwd;
  if (maybeRelative.startsWith("/")) return normalize(maybeRelative);
  return normalize(`${cwd}/${maybeRelative}`);
}

function normalize(path) {
  const parts = path.split("/");
  const out = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return `/${out.join("/")}` || "/";
}

function parentDir(path) {
  const normalized = normalize(path);
  if (normalized === "/") return "/";
  const chunks = normalized.split("/").filter(Boolean);
  chunks.pop();
  return chunks.length ? `/${chunks.join("/")}` : "/";
}

function fileName(path) {
  const chunks = normalize(path).split("/").filter(Boolean);
  return chunks[chunks.length - 1] || "/";
}

function listDir(path) {
  const target = normalize(path);
  const node = state.vfs[target];
  if (!node || node.type !== "dir") return { ok: false, error: "Not a directory" };
  const out = [];
  for (const key of Object.keys(state.vfs)) {
    if (key === target) continue;
    if (parentDir(key) === target) {
      const child = state.vfs[key];
      out.push(`${fileName(key)}${child.type === "dir" ? "/" : ""}`);
    }
  }
  return { ok: true, items: out.sort() };
}

function print(line = "", cls = "") {
  const div = document.createElement("div");
  if (cls) div.className = cls;
  div.textContent = line;
  terminalOutput.appendChild(div);
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

function logAgent(line, cls = "") {
  const div = document.createElement("div");
  if (cls) div.className = cls;
  div.textContent = line;
  agentLog.appendChild(div);
  agentLog.scrollTop = agentLog.scrollHeight;
}

function refreshUI() {
  cwdChip.textContent = `cwd: ${state.cwd}`;
  fileTree.textContent = "";

  const paths = Object.keys(state.vfs).sort();
  for (const path of paths) {
    const node = state.vfs[path];
    const line = document.createElement("div");
    line.textContent = `${path} ${node.type === "dir" ? "[dir]" : "[file]"}`;
    fileTree.appendChild(line);
  }
}

function parse(input) {
  return input.trim().match(/(?:[^\s"]+|"[^"]*")+/g)?.map((p) => p.replace(/^"|"$/g, "")) || [];
}

function allowed(tool) {
  return Boolean(state.policy[tool]);
}

function audit(entry) {
  state.audit.push({ ...entry, at: new Date().toISOString() });
}

function runShell(argv) {
  const cmd = argv[0];

  if (!cmd) return;

  if (cmd === "help") {
    print("Commands: help, pwd, ls [dir], cd <dir>, cat <file>, write <file> <text>, mkdir <dir>, rm <path>, whoami, clear");
    return;
  }

  if (cmd === "clear") {
    terminalOutput.textContent = "";
    return;
  }

  if (cmd === "pwd") {
    print(state.cwd);
    return;
  }

  if (cmd === "whoami") {
    print(state.users[0]);
    return;
  }

  if (cmd === "ls") {
    const target = pathJoin(state.cwd, argv[1] || ".");
    const result = listDir(target);
    if (!result.ok) {
      print(result.error, "line-err");
      return;
    }
    print(result.items.join("  "));
    return;
  }

  if (cmd === "cd") {
    const target = pathJoin(state.cwd, argv[1] || "/home/agent");
    if (!state.vfs[target] || state.vfs[target].type !== "dir") {
      print("Directory not found", "line-err");
      return;
    }
    state.cwd = target;
    refreshUI();
    return;
  }

  if (cmd === "cat") {
    if (!allowed("read")) {
      print("policy denied: file.read", "line-warn");
      return;
    }
    const target = pathJoin(state.cwd, argv[1] || "");
    const node = state.vfs[target];
    if (!node || node.type !== "file") {
      print("File not found", "line-err");
      return;
    }
    print(node.content || "");
    audit({ tool: "file.read", target, result: "ok" });
    return;
  }

  if (cmd === "write") {
    if (!allowed("write")) {
      print("policy denied: file.write", "line-warn");
      return;
    }
    const file = argv[1];
    const text = argv.slice(2).join(" ");
    if (!file || !text) {
      print("Usage: write <file> <text>", "line-warn");
      return;
    }
    const target = pathJoin(state.cwd, file);
    const parent = parentDir(target);
    if (!state.vfs[parent] || state.vfs[parent].type !== "dir") {
      print("Parent directory missing", "line-err");
      return;
    }
    state.vfs[target] = { type: "file", content: text };
    audit({ tool: "file.write", target, result: "ok" });
    print(`wrote ${target}`, "line-ok");
    refreshUI();
    return;
  }

  if (cmd === "mkdir") {
    if (!allowed("write")) {
      print("policy denied: file.write", "line-warn");
      return;
    }
    const dir = argv[1];
    if (!dir) {
      print("Usage: mkdir <dir>", "line-warn");
      return;
    }
    const target = pathJoin(state.cwd, dir);
    const parent = parentDir(target);
    if (!state.vfs[parent] || state.vfs[parent].type !== "dir") {
      print("Parent directory missing", "line-err");
      return;
    }
    if (state.vfs[target]) {
      print("Already exists", "line-warn");
      return;
    }
    state.vfs[target] = { type: "dir" };
    audit({ tool: "file.write", target, result: "ok" });
    print(`created ${target}`, "line-ok");
    refreshUI();
    return;
  }

  if (cmd === "rm") {
    if (!allowed("delete")) {
      print("policy denied: file.delete", "line-warn");
      return;
    }
    const target = pathJoin(state.cwd, argv[1] || "");
    if (!state.vfs[target]) {
      print("Path not found", "line-err");
      return;
    }
    const prefix = `${target}/`;
    for (const key of Object.keys(state.vfs)) {
      if (key === target || key.startsWith(prefix)) {
        delete state.vfs[key];
      }
    }
    audit({ tool: "file.delete", target, result: "ok" });
    print(`deleted ${target}`, "line-ok");
    refreshUI();
    return;
  }

  print(`Unknown command: ${cmd}`, "line-warn");
}

function seedPlan() {
  state.plannedSteps = [
    {
      reason: "Read task context",
      tool: "read",
      action: { cmd: "cat", args: ["README.txt"] },
    },
    {
      reason: "Write execution note",
      tool: "write",
      action: { cmd: "write", args: ["notes/agent-plan.txt", "Plan: inspect, execute, log."] },
    },
    {
      reason: "Dangerous cleanup",
      tool: "delete",
      action: { cmd: "rm", args: ["notes"] },
    },
  ];
  logAgent(`plan created: ${state.plannedSteps.length} steps`, "line-ok");
}

function doAgentStep() {
  const next = state.plannedSteps.shift();
  if (!next) {
    logAgent("no pending steps", "line-warn");
    agentState.textContent = "Agent: idle";
    return;
  }

  agentState.textContent = `Agent: ${next.reason}`;

  if (!allowed(next.tool)) {
    logAgent(`blocked by policy: ${next.tool} for ${next.reason}`, "line-warn");
    audit({ tool: next.tool, target: "", result: "denied" });
    return;
  }

  logAgent(`running: ${next.action.cmd} ${next.action.args.join(" ")}`);
  runShell([next.action.cmd, ...next.action.args]);
  logAgent(`done: ${next.reason}`, "line-ok");

  if (state.plannedSteps.length === 0) {
    agentState.textContent = "Agent: idle";
  }
}

function loadPolicyFromUI() {
  for (const checkbox of checks) {
    state.policy[checkbox.dataset.tool] = checkbox.checked;
  }
}

terminalForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const raw = terminalInput.value;
  terminalInput.value = "";
  if (!raw.trim()) return;

  print(`$ ${raw}`);
  runShell(parse(raw));
});

for (const checkbox of checks) {
  checkbox.addEventListener("change", () => {
    loadPolicyFromUI();
    logAgent(`policy update: ${checkbox.dataset.tool}=${checkbox.checked}`, "line-ok");
  });
}

agentPlanBtn.addEventListener("click", () => {
  seedPlan();
  agentState.textContent = "Agent: plan ready";
});

agentStepBtn.addEventListener("click", () => doAgentStep());

agentAutoBtn.addEventListener("click", async () => {
  agentState.textContent = "Agent: auto run";
  for (let i = 0; i < 5; i += 1) {
    doAgentStep();
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (state.plannedSteps.length === 0) agentState.textContent = "Agent: idle";
});

refreshUI();
print("Codex Mini OS booted. Type 'help'.", "line-ok");
logAgent("sandbox ready");

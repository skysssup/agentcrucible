export const COMPLETION_SHELLS = ["bash", "zsh", "fish"] as const;
export type CompletionShell = (typeof COMPLETION_SHELLS)[number];

export interface CompletionCommand {
  name: string;
  description: string;
  flags: string[];
}

/** Flags whose values the shells complete by asking the CLI (`list --ids`, `agents --ids`, `faults --ids`). */
const DYNAMIC: Record<string, string> = {
  "--scenario": "list --ids",
  "--agent": "agents --ids",
  "--agents": "agents --ids",
  "--kinds": "faults --ids",
  "--tag": "list --tags",
};
const FILE_FLAGS = new Set(["--config", "--baseline", "--save-baseline", "--system", "--out", "--record"]);
const VERDICT_FLAGS = new Set(["--fail-on"]);

/** A completion script for the shell, generated from the command table so it never drifts from the CLI. */
export function completionScript(shell: CompletionShell, commands: CompletionCommand[], verdicts: readonly string[]): string {
  switch (shell) {
    case "bash":
      return bash(commands, verdicts);
    case "zsh":
      return zsh(commands, verdicts);
    case "fish":
      return fish(commands, verdicts);
  }
}

function bash(commands: CompletionCommand[], verdicts: readonly string[]): string {
  const cases = commands.map((c) => `    ${c.name}) flags="${c.flags.join(" ")}" ;;`).join("\n");
  const dynamic = Object.entries(DYNAMIC).map(([flag, cmd]) => `    ${flag}) COMPREPLY=( $(compgen -W "$(agentcrucible ${cmd} 2>/dev/null)" -- "$cur") ); return ;;`).join("\n");
  return `# bash completion for agentcrucible. Install: agentcrucible completion bash > ~/.local/share/bash-completion/completions/agentcrucible
_agentcrucible() {
  local cur prev words cword
  _init_completion 2>/dev/null || { cur="\${COMP_WORDS[COMP_CWORD]}"; prev="\${COMP_WORDS[COMP_CWORD-1]}"; words=("\${COMP_WORDS[@]}"); cword=$COMP_CWORD; }
  local commands="${commands.map((c) => c.name).join(" ")}"
  if [[ $cword -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "$commands --help --version" -- "$cur") )
    return
  fi
  case "$prev" in
${dynamic}
    ${[...VERDICT_FLAGS].join("|")}) COMPREPLY=( $(compgen -W "${verdicts.join(" ")}" -- "$cur") ); return ;;
    ${[...FILE_FLAGS].join("|")}) COMPREPLY=( $(compgen -f -- "$cur") ); return ;;
  esac
  local flags=""
  case "\${words[1]}" in
${cases}
  esac
  if [[ "$cur" == -* ]]; then
    COMPREPLY=( $(compgen -W "$flags" -- "$cur") )
  else
    case "\${words[1]}" in
      inspect|replay|validate) COMPREPLY=( $(compgen -f -- "$cur") ) ;;
      completion) COMPREPLY=( $(compgen -W "${COMPLETION_SHELLS.join(" ")}" -- "$cur") ) ;;
    esac
  fi
}
complete -F _agentcrucible agentcrucible
`;
}

function zsh(commands: CompletionCommand[], verdicts: readonly string[]): string {
  const spec = (flag: string) => {
    const dyn = DYNAMIC[flag];
    if (dyn) return `'${flag}[${flag.slice(2)}]:value:($(agentcrucible ${dyn} 2>/dev/null))'`;
    if (VERDICT_FLAGS.has(flag)) return `'${flag}[verdict]:verdict:(${verdicts.join(" ")})'`;
    if (FILE_FLAGS.has(flag)) return `'${flag}[path]:path:_files'`;
    return flag === "--json" || flag === "--github" || flag === "--ids" || flag === "--tags" ? `'${flag}[${flag.slice(2)}]'` : `'${flag}[${flag.slice(2)}]:value:'`;
  };
  const cases = commands
    .map((c) => {
      const positional = c.name === "inspect" || c.name === "replay" || c.name === "validate" ? " '1:file:_files'" : c.name === "completion" ? ` '1:shell:(${COMPLETION_SHELLS.join(" ")})'` : "";
      return `    ${c.name}) _arguments${positional} ${c.flags.map(spec).join(" ")} ;;`;
    })
    .join("\n");
  return `#compdef agentcrucible
# zsh completion for agentcrucible. Install: agentcrucible completion zsh > "\${fpath[1]}/_agentcrucible"
_agentcrucible() {
  local -a commands
  commands=(
${commands.map((c) => `    '${c.name}:${c.description.replace(/'/g, "'\\''")}'`).join("\n")}
  )
  if (( CURRENT == 2 )); then
    _describe 'command' commands
    return
  fi
  case "\${words[2]}" in
${cases}
  esac
}
_agentcrucible "$@"
`;
}

function fish(commands: CompletionCommand[], verdicts: readonly string[]): string {
  const lines = [
    `# fish completion for agentcrucible. Install: agentcrucible completion fish > ~/.config/fish/completions/agentcrucible.fish`,
    `complete -c agentcrucible -f`,
    ...commands.map((c) => `complete -c agentcrucible -n __fish_use_subcommand -a ${c.name} -d '${c.description.replace(/'/g, "\\'")}'`),
  ];
  for (const c of commands) {
    for (const flag of c.flags) {
      const name = flag.slice(2);
      const dyn = DYNAMIC[flag];
      const value = dyn
        ? ` -x -a '(agentcrucible ${dyn} 2>/dev/null)'`
        : VERDICT_FLAGS.has(flag)
          ? ` -x -a '${verdicts.join(" ")}'`
          : FILE_FLAGS.has(flag)
            ? " -r -F"
            : flag === "--json" || flag === "--github" || flag === "--ids" || flag === "--tags"
              ? ""
              : " -x";
      lines.push(`complete -c agentcrucible -n '__fish_seen_subcommand_from ${c.name}' -l ${name}${value}`);
    }
    if (c.name === "inspect" || c.name === "replay" || c.name === "validate") lines.push(`complete -c agentcrucible -n '__fish_seen_subcommand_from ${c.name}' -F`);
    if (c.name === "completion") lines.push(`complete -c agentcrucible -n '__fish_seen_subcommand_from completion' -a '${COMPLETION_SHELLS.join(" ")}'`);
  }
  return `${lines.join("\n")}\n`;
}

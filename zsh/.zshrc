export PATH="$HOME/.pyenv/shims:$PATH"
eval "$(pyenv init - zsh)"

source ~/.aliases.zsh

. "$HOME/.local/bin/env"
. "$HOME/.cargo/env"

export PATH="$HOME/.pyenv/shims:$PATH"
eval "$(pyenv init - zsh)"

export PATH="/opt/homebrew/opt/ruby/bin:$PATH"

# bun completions
[ -s "/Users/detrous/.bun/_bun" ] && source "/Users/detrous/.bun/_bun"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# Per-directory Claude account switching: letyshops repo uses a separate
# CLAUDE_CONFIG_DIR + long-lived OAuth token; everywhere else uses the default
# Keychain-stored account.
autoload -Uz add-zsh-hook
_letyshops_claude_switch() {
  if [[ "$PWD" == /Users/detrous/repositories/letyshops* ]]; then
    export CLAUDE_CONFIG_DIR="$HOME/.claude-letyshops"
    [[ -r "$HOME/.claude-letyshops-token" ]] && \
      export CLAUDE_CODE_OAUTH_TOKEN="$(<$HOME/.claude-letyshops-token)"
  else
    unset CLAUDE_CONFIG_DIR CLAUDE_CODE_OAUTH_TOKEN
  fi
}
add-zsh-hook chpwd _letyshops_claude_switch
_letyshops_claude_switch

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

# Per-directory Claude account switching: letyshops repo uses AWS Bedrock
# (eu-central-1, ai-hub-prod profile) with a separate CLAUDE_CONFIG_DIR;
# everywhere else uses the default Keychain-stored Anthropic account.
autoload -Uz add-zsh-hook
_letyshops_claude_switch() {
  if [[ "$PWD" == /Users/detrous/repositories/letyshops* ]]; then
    export CLAUDE_CONFIG_DIR="$HOME/.claude-letyshops"
    export CLAUDE_CODE_USE_BEDROCK=1
    export AWS_REGION="eu-central-1"
    export AWS_PROFILE="ai-hub-prod"
  else
    unset CLAUDE_CONFIG_DIR CLAUDE_CODE_USE_BEDROCK AWS_REGION AWS_PROFILE \
          ANTHROPIC_DEFAULT_OPUS_MODEL ANTHROPIC_DEFAULT_SONNET_MODEL \
          ANTHROPIC_DEFAULT_HAIKU_MODEL
  fi
}
add-zsh-hook chpwd _letyshops_claude_switch
_letyshops_claude_switch

export PATH="$HOME/.jenv/bin:$PATH"
eval "$(jenv init -)"


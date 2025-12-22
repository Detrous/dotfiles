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

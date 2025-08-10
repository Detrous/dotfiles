source ~/.aliases.zsh

eval "$(direnv hook zsh)"
eval "$(jenv init -)"

jenv enable-plugin export

export PATH="$HOME/.local/bin:$PATH"

export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME="robbyrussell"

plugins=(
git
colorize
command-not-found
common-aliases
docker
docker-compose
gradle
helm
zsh-history-substring-search
kubectl
macos
pip
poetry
poetry-env
pre-commit
python
safe-paste
ssh
#sudo
thefuck
urltools
)

source $ZSH/oh-my-zsh.sh

export BUN_INSTALL="$HOME/.bun"
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

alias claude="/Users/detrous/.claude/local/claude"

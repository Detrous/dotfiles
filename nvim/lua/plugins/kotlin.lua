return {
  {
    "neovim/nvim-lspconfig",
    opts = {
      servers = {
        kotlin_language_server = { enabled = false },
        kotlin_lsp = {
          -- brew symlinks the intellij-server binary onto PATH as `kotlin-lsp`
          cmd = { "kotlin-lsp", "--stdio" },
        },
      },
    },
  },
}

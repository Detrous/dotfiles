-- Autocmds are automatically loaded on the VeryLazy event
-- Default autocmds that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/autocmds.lua
--
-- Add any additional autocmds here
-- with `vim.api.nvim_create_autocmd`
--
-- Or remove existing autocmds by their group name (which is prefixed with `lazyvim_` for the defaults)
-- e.g. vim.api.nvim_del_augroup_by_name("lazyvim_wrap_spell")

-- Buffer-local Kotlin test runner keymaps
vim.api.nvim_create_autocmd("FileType", {
  group = vim.api.nvim_create_augroup("kotlin_test", { clear = true }),
  pattern = "kotlin",
  callback = function(ev)
    local kt = require("kotlin_test")
    local function map(lhs, fn, desc)
      vim.keymap.set("n", lhs, fn, { buffer = ev.buf, desc = desc })
    end
    map("<leader>tr", kt.run_nearest, "Kotlin: run nearest test")
    map("<leader>tc", kt.run_class, "Kotlin: run test class")
    map("<leader>ta", kt.run_all, "Kotlin: run all tests")
    map("<leader>tt", kt.pick_task, "Kotlin: task picker")
    map("<leader>tl", kt.run_last, "Kotlin: re-run last command")
  end,
})

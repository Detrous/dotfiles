-- Kotlin test runner: identifies test blocks via tree-sitter and runs them
-- through Gradle/Maven. Mirrors the zed-kotlin-extension runnables behaviour.

local M = {}

M.project_tasks = {}
M.last = nil

-- Register repo-specific tasks from a project-local .nvim.lua.
-- tasks: list of { label = string, cmd = string } (cmd is run with cwd = project root).
function M.register_project_tasks(tasks)
  for _, task in ipairs(tasks) do
    table.insert(M.project_tasks, task)
  end
end

local TEST_ANNOTATIONS = { Test = true, ParameterizedTest = true, RepeatedTest = true }

local function notify(msg, level)
  vim.notify(msg, level or vim.log.levels.WARN, { title = "Kotlin test" })
end

local function strip_ticks(s)
  return (s:gsub("`", ""))
end

local function named_child(node, type_name)
  for child in node:iter_children() do
    if child:type() == type_name then
      return child
    end
  end
end

-- Names of annotations on a declaration node (function_declaration / class_declaration).
local function annotation_names(node, bufnr)
  local names = {}
  local modifiers = named_child(node, "modifiers")
  if not modifiers then
    return names
  end
  for child in modifiers:iter_children() do
    if child:type() == "annotation" then
      for inner in child:iter_children() do
        local user_type
        if inner:type() == "user_type" then
          user_type = inner
        elseif inner:type() == "constructor_invocation" then
          local first = inner:named_child(0)
          if first and first:type() == "user_type" then
            user_type = first
          end
        end
        if user_type then
          local ti = user_type:named_child(0)
          if ti then
            names[vim.treesitter.get_node_text(ti, bufnr)] = true
          end
        end
      end
    end
  end
  return names
end

local function get_package(bufnr)
  local parser = vim.treesitter.get_parser(bufnr, "kotlin")
  if not parser then
    return nil
  end
  local root = parser:parse()[1]:root()
  for child in root:iter_children() do
    if child:type() == "package_header" then
      local id = child:named_child(0)
      if id then
        return vim.treesitter.get_node_text(id, bufnr)
      end
    end
  end
  return nil
end

-- Inspect the tree-sitter node under the cursor.
-- Returns { package, classes, class, method, is_test_method, is_main } or nil.
function M.context()
  local bufnr = vim.api.nvim_get_current_buf()
  local node = vim.treesitter.get_node()
  if not node then
    return nil
  end

  local fn_node
  local classes = {}
  local n = node
  while n do
    local t = n:type()
    if t == "function_declaration" and not fn_node then
      fn_node = n
    elseif t == "class_declaration" then
      local ti = named_child(n, "type_identifier")
      if ti then
        table.insert(classes, 1, strip_ticks(vim.treesitter.get_node_text(ti, bufnr)))
      end
    end
    n = n:parent()
  end

  local ctx = {
    package = get_package(bufnr),
    classes = classes,
    class = #classes > 0 and table.concat(classes, "$") or nil,
  }

  if fn_node then
    local id = named_child(fn_node, "simple_identifier")
    ctx.method = id and strip_ticks(vim.treesitter.get_node_text(id, bufnr)) or nil
    for name in pairs(annotation_names(fn_node, bufnr)) do
      if TEST_ANNOTATIONS[name] then
        ctx.is_test_method = true
      end
    end
    if ctx.method == "main" then
      ctx.is_main = true
    end
  end

  return ctx
end

local function find_root()
  return vim.fs.root(0, { "settings.gradle.kts", "settings.gradle", "gradlew", "pom.xml" })
end

-- Gradle path of the module owning the current file (":connect-merchant"), or nil for the root project.
local function find_module(root)
  local dir = vim.fs.dirname(vim.api.nvim_buf_get_name(0))
  local found = vim.fs.find({ "build.gradle.kts", "build.gradle" }, {
    upward = true,
    path = dir,
    stop = vim.fs.dirname(root),
    limit = 1,
  })
  if #found == 0 then
    return nil
  end
  local moddir = vim.fs.dirname(found[1])
  if moddir == root or moddir:sub(1, #root + 1) ~= root .. "/" then
    return nil
  end
  return ":" .. moddir:sub(#root + 2):gsub("/", ":")
end

local function uses_gradle(root)
  return vim.uv.fs_stat(root .. "/gradlew") ~= nil
end

local function gradle_task(module, task)
  return module and (module .. ":" .. task) or task
end

local function maven_cmd(root)
  return vim.uv.fs_stat(root .. "/mvnw") and "./mvnw" or "mvn"
end

-- Run a shell command in a bottom terminal split, cwd at the project root.
function M.run(cmd, root)
  M.last = { cmd = cmd, root = root }
  local ok, snacks = pcall(require, "snacks")
  if ok and snacks.terminal then
    snacks.terminal(cmd, { cwd = root, win = { position = "bottom" } })
  else
    vim.cmd("botright split | terminal " .. cmd)
  end
end

function M.run_last()
  if not M.last then
    notify("No previous Kotlin command to re-run")
    return
  end
  M.run(M.last.cmd, M.last.root)
end

-- target: "method" | "class" | "main"
local function run_target(target)
  local ctx = M.context()
  if not ctx then
    notify("No tree-sitter context")
    return
  end
  local root = find_root()
  if not root then
    notify("No project root (gradlew / settings.gradle / pom.xml)")
    return
  end

  if (target == "method" or target == "class") and not ctx.class then
    notify("No enclosing test class")
    return
  end
  if target == "method" and not ctx.method then
    notify("No enclosing test method")
    return
  end

  local fqcn = (ctx.package and (ctx.package .. ".") or "") .. (ctx.class or "")

  if uses_gradle(root) then
    local module = find_module(root)
    if target == "main" then
      M.run("./gradlew " .. gradle_task(module, "run") .. " --console=plain", root)
    elseif target == "class" then
      M.run("./gradlew " .. gradle_task(module, "test") .. " --tests '" .. fqcn .. "'", root)
    else
      M.run("./gradlew " .. gradle_task(module, "test") .. " --tests '" .. fqcn .. "." .. ctx.method .. "'", root)
    end
  else
    local mvn = maven_cmd(root)
    if target == "main" then
      M.run(mvn .. " compile exec:java", root)
    elseif target == "class" then
      M.run(mvn .. " test -Dtest='" .. ctx.class .. "'", root)
    else
      M.run(mvn .. " test -Dtest='" .. ctx.class .. "#" .. ctx.method .. "'", root)
    end
  end
end

-- Run the test method / main under the cursor, falling back to the enclosing class.
function M.run_nearest()
  local ctx = M.context()
  if ctx and ctx.is_main then
    run_target("main")
  elseif ctx and ctx.is_test_method then
    run_target("method")
  elseif ctx and ctx.class then
    run_target("class")
  else
    notify("No test or main under cursor")
  end
end

function M.run_class()
  run_target("class")
end

function M.run_all()
  local root = find_root()
  if not root then
    notify("No project root (gradlew / settings.gradle / pom.xml)")
    return
  end
  if uses_gradle(root) then
    M.run("./gradlew test", root)
  else
    M.run(maven_cmd(root) .. " test", root)
  end
end

-- Pick a module-level or project-registered task via vim.ui.select.
function M.pick_task()
  local root = find_root()
  if not root then
    notify("No project root (gradlew / settings.gradle / pom.xml)")
    return
  end

  local items = {}
  if uses_gradle(root) then
    local module = find_module(root)
    local label = module or "root"
    table.insert(items, { label = "build: " .. label, cmd = "./gradlew " .. gradle_task(module, "build") })
    table.insert(items, { label = "test: " .. label, cmd = "./gradlew " .. gradle_task(module, "test") })
    table.insert(items, { label = "test: all", cmd = "./gradlew test" })
  else
    local mvn = maven_cmd(root)
    table.insert(items, { label = "build", cmd = mvn .. " package" })
    table.insert(items, { label = "test: all", cmd = mvn .. " test" })
  end
  for _, task in ipairs(M.project_tasks) do
    table.insert(items, task)
  end

  vim.ui.select(items, {
    prompt = "Kotlin task",
    format_item = function(item)
      return item.label
    end,
  }, function(choice)
    if choice then
      M.run(choice.cmd, root)
    end
  end)
end

return M

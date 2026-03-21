# /localize - Add App Store & In-App Localization

Add a new language localization to the current iOS app. Handles App Store metadata (name, subtitle, description, keywords) with ASO keyword research, and optionally in-app UI string translations.

## Usage
```
/localize <language or locale>
```

## Target Language
$ARGUMENTS

## EXECUTION SEQUENCE

### STEP 0: Discover Project Context

Before doing anything else, gather all project-specific information dynamically.

#### 0a. Find the app
```bash
asc apps list
```
If multiple apps are returned, use AskUserQuestion to let the user pick one. Save the **App ID** and **App Name** for all subsequent steps.

#### 0b. Find xcstrings files
Use Glob to search for `**/*.xcstrings` in the project. These are the files that need in-app translations.

#### 0c. Find existing locales
Read the discovered `.xcstrings` files and extract:
- `sourceLanguage` — the base language
- All locale keys under each string's `localizations` — the already-translated languages

#### 0d. Find build scheme
```bash
xcodebuild -list -json
```
Extract available schemes. If multiple, ask the user which to use.

#### 0e. Find simulator
```bash
xcrun simctl list devices available -j
```
Pick the first available iPhone simulator, or ask the user if unclear.

### STEP 1: Resolve Locale

Resolve the argument to an App Store Connect locale code and Astro store code.

Examples: "German" → locale `de-DE`, store `de` | "French" → locale `fr-FR`, store `fr` | "Japanese" → locale `ja`, store `jp` | "Spanish" → locale `es-ES`, store `es` | "pt-BR" → locale `pt-BR`, store `br`

If the argument is ambiguous (e.g., "Portuguese" could be PT or BR), ask the user to clarify.

Check if this locale already exists in the xcstrings files or App Store. If it does, inform the user and ask how to proceed.

### STEP 2: Ask Scope

Use AskUserQuestion to ask:
- **"App Store metadata only"** — name, subtitle, description, keywords, promotional text via `asc`
- **"Both App Store + in-app"** — also translate UI strings in `.xcstrings` files

### STEP 3: App Store Keyword Research (Astro MCP)

This is the most critical step. DO NOT blindly translate English keywords — validate every keyword against actual App Store search results.

#### 3a. Get current English metadata
```bash
asc localizations list --app <APP_ID> --type app-info
```
And list the current version localizations to see the existing English keywords, name, subtitle, and description. These are what you'll translate and optimize.

#### 3b. Generate keyword candidates
- Use `mcp__astro__get_keyword_suggestions` for the app in the target store
- Translate the English keywords conceptually (not literally) into the target language
- Think about what local users would actually search for
- Look at competitor apps' names and subtitles in the target store for keyword ideas

#### 3c. Validate EVERY keyword candidate
For each candidate keyword, use `mcp__astro__search_app_store` with the app's App Store ID and check:
- Do apps similar to this one appear in the top 10 results?
- If results show completely unrelated apps (games, fitness, social media), DROP the keyword

#### 3d. Track validated keywords
Use `mcp__astro__add_keywords` to add validated keywords to the target store. This returns popularity and difficulty scores.

#### 3e. Build final keyword set
Rules:
- Max 100 characters total (comma-separated, no spaces after commas)
- Do NOT include words already present in the localized name or subtitle
- Prioritize: low difficulty + relevant results > high popularity + irrelevant results
- Include a mix of native-language AND English keywords (many non-English users search in English)
- Check if the app already ranks for any English keywords in this store

### STEP 4: App Store Metadata (asc CLI)

#### 4a. Check for editable version
```bash
asc versions list --app <APP_ID>
```
If no version is in `PREPARE_FOR_SUBMISSION` state, ask the user if you should create a new version.

#### 4b. Pull existing metadata
```bash
asc metadata pull --app <APP_ID> --version <VERSION> --dir ./metadata --force
```

#### 4c. Create locale files
Create:
- `metadata/app-info/<LOCALE>.json` — name, subtitle, privacyPolicyUrl
- `metadata/version/<VERSION>/<LOCALE>.json` — description, keywords, promotionalText, supportUrl, whatsNew

For the **description**: translate the en-US description maintaining the same structure and sections. Keep proper nouns and brand names untranslated.

For **name**: use native terms for the app's core function. Check how competitors name their apps in this locale using the search results from Step 3.

For **subtitle**: include 2 key feature terms that are high-value keywords.

#### 4d. Push metadata
```bash
asc metadata push --app <APP_ID> --version <VERSION> --dir ./metadata --dry-run
```
Show the dry-run output to the user, then push without `--dry-run`.

### STEP 5: In-App Translations (if selected)

Only execute this step if the user chose "Both App Store + in-app" in Step 2.

#### 5a. Read existing .xcstrings files
Read all `.xcstrings` files discovered in Step 0b.

#### 5b. Determine plural rules
Different languages have different plural forms:
- English/German/French/Italian/Spanish/Portuguese: `one`, `other`
- Ukrainian/Russian/Polish/Czech: `one`, `few`, `many`, `other`
- Arabic: `zero`, `one`, `two`, `few`, `many`, `other`
- Japanese/Chinese/Korean/Vietnamese: `other` only (no plural distinction)
- Latvian/Lithuanian: `zero`, `one`, `other`

Use the correct CLDR plural categories for the target language.

#### 5c. Add translations
For each string key in every `.xcstrings` file, add a new locale entry following the exact JSON structure of existing non-source translations.

String types to handle:
- **Simple strings**: `"stringUnit": {"state": "translated", "value": "..."}`
- **Plural variations**: `"variations": {"plural": {"one": ..., "other": ...}}`
- **Substitution-plurals**: `"substitutions": {"varName": {"argNum": 1, "formatSpecifier": "lld", "variations": {"plural": ...}}}`

Keep format specifiers (`%lld`, `%#@var@`, `%@`, etc.) exactly as-is. Only translate the human-readable text.

#### 5d. Build and verify
```bash
xcodebuild build -scheme <SCHEME> -destination 'platform=iOS Simulator,name=<SIMULATOR>' -quiet 2>&1 | grep -E '(BUILD|error:)'
```

Build MUST succeed before proceeding.

### STEP 6: Commit

If in-app translations were added, stage only the `.xcstrings` files and commit:
```bash
git add <paths to modified .xcstrings files>
git commit -m 'feat: add <Language> (<locale>) in-app localization'
```

Do NOT commit the `metadata/` directory.

### STEP 7: Verify App Store

```bash
asc localizations list --app <APP_ID> --type app-info
asc localizations list --version <VERSION_ID>
```

Confirm the new locale appears with correct content.

## RULES

- NEVER skip keyword validation. Every keyword MUST be checked with `search_app_store` before inclusion.
- NEVER blindly translate keywords — check what apps actually appear in search results for each candidate.
- ALWAYS show the dry-run output before pushing metadata.
- ALWAYS build after editing .xcstrings files.
- ALWAYS commit in-app translations separately from any other changes.
- Keep proper nouns and brand names untranslated.

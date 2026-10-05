import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
export default [
  { ignores: ['node_modules/**', 'dist/**', 'thoughtgraph/**', 'main.js', 'scripts/**', '*.mjs', 'tests/**', 'package*.json', 'tsconfig.json', 'versions.json'] },
  ...obsidianmd.configs.recommended,
  { rules: { 'obsidianmd/ui/sentence-case': ['warn', { enforceCamelCaseLower: true, brands: ['ThoughtGraph', 'Codex', 'MCP', 'Skill', 'Vault', 'UTF-16'] }] }, languageOptions: { globals: globals.browser, parserOptions: {
    projectService: { allowDefaultProject: ['manifest.json'] },
    tsconfigRootDir: import.meta.dirname, extraFileExtensions: ['.json']
  } } }
];

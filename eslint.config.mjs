import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
export default [
  { ignores: ['node_modules/**', 'main.js', 'scripts/**', '*.mjs', 'tests/**', 'package*.json', 'tsconfig.json', 'versions.json'] },
  ...obsidianmd.configs.recommended,
  { languageOptions: { globals: globals.browser, parserOptions: {
    projectService: { allowDefaultProject: ['manifest.json'] },
    tsconfigRootDir: import.meta.dirname, extraFileExtensions: ['.json']
  } } }
];

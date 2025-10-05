# Developer Documentation
Deploying a release:
1. Make changes
2. Increase version in manifest.json
3. Increase version in versions.json
4. `npm run build`
5. Write tests
6. check if test passes with `npm run test`
7. Open obsidian, click the question mark in the bottom left, open up a sandbox vault
8. Deploy the plugin to the sandbox vault with `/bin/python3 ./pluginloader.py`
9. In obsidian sandbox, go to `settings > community plugins`. Click "turn on and reload".
10. Reopen settings. Turn on community plugins. Enable remove newlines.
11. Test plugin locally.
12. Write new entry for changelog in README.md
13. Push changes to repo.
14. Go to https://github.com/HandcartCactus/obsidian-remove-newlines/releases/new
15. create new tag for version, paste changelog notes
16. Click "attach binaries by dropping them here or selecting them", select your `main.js`, `styles.css`, and `manifest.json`.
17. click "release".
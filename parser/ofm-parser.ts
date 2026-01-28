import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkObsidian from 'remark-obsidian';
import remarkFrontmatter from 'remark-frontmatter';
import { inspect } from 'unist-util-inspect';
import * as fs from 'fs';

const file = fs.readFileSync('./ofm-features.md', 'utf8');
const result = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkObsidian)
  .use(remarkFrontmatter, ['yaml', 'toml'])
  .parse(file);
    
console.log(inspect(result));

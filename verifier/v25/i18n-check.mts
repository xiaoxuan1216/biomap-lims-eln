import fs from 'node:fs';
import ts from 'typescript';
import { en } from '../../src/i18n/en.ts';
const source = fs.readFileSync('src/i18n/cloningQcEn.ts','utf8');
const file = ts.createSourceFile('dict.ts',source,ts.ScriptTarget.Latest,true);
const added: string[]=[];
function visit(node:ts.Node) { if(ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name)) added.push(node.name.text); ts.forEachChild(node,visit); }
visit(file);
const duplicates: string[]=[];
for(const path of fs.readdirSync('src/i18n').filter(p=>p.endsWith('.ts') && p !== 'cloningQcEn.ts')) {
 const other=ts.createSourceFile(path,fs.readFileSync(`src/i18n/${path}`,'utf8'),ts.ScriptTarget.Latest,true);
 function walk(n:ts.Node) { if(ts.isPropertyAssignment(n) && (ts.isStringLiteral(n.name)||ts.isIdentifier(n.name)) && added.includes(n.name.text)) duplicates.push(`${path}:${n.name.text}`); ts.forEachChild(n,walk); } walk(other);
}
const texts=['src/pages/CloningQc.tsx','contracts/cloningMockQc.ts'].flatMap(path=>[...fs.readFileSync(path,'utf8').matchAll(/"([^"\n]*[\u4e00-\u9fff][^"\n]*)"/g)].map(m=>m[1]));
console.log(JSON.stringify({missing:[...new Set(texts.filter(key=>!en[key]))],duplicates},null,2));

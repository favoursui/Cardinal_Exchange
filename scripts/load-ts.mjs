import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const root=fileURLToPath(new URL('../',import.meta.url));
const dependencyRequire=createRequire(new URL('../package.json',import.meta.url));
const cache=new Map();
export function loadTS(path) {
 let file=resolve(root,path);
 if(!existsSync(file))file+='.ts';
 if(cache.has(file))return cache.get(file).exports;
 const compiled={exports:{}};cache.set(file,compiled);
 const js=ts.transpileModule(readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const require=(name)=>name.startsWith('@/')?loadTS(`src/${name.slice(2)}`):name.startsWith('.')?loadTS(resolve(dirname(file),name)):dependencyRequire(name);
 new Function('module','exports','require',js)(compiled,compiled.exports,require);
 return compiled.exports;
}

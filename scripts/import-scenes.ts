import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { importedScenes, adaptScenePrompt } from '../packages/shared/imported-scenes';
import type { Style } from '../packages/shared/types';
const file='config/styles/styles.json';
const styles: Style[]=JSON.parse(readFileSync(file,'utf8'));
const migrationFile='config/styles/scene-quality-migration.json';
const migration:Record<string,Record<string,string|string[]>>=existsSync(migrationFile)?JSON.parse(readFileSync(migrationFile,'utf8')):{};
const sourceDir='docs/sources/prompt-import-2026-09-29/单张照片提示词';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const remember=(id:string,key:string,value:unknown)=>{
 migration[id]??={};
 const previous=migration[id][key];
 migration[id][key]=[...new Set([...(Array.isArray(previous)?previous:previous?[previous]:[]),hash(value)])];
};
for (const scene of importedScenes) {
 const original=styles.find(s=>s.id===scene.id);
 const name=readdirSync(sourceDir).find(f=>f.startsWith(scene.code+'｜'))!;
 const update:Style={id:scene.id,name:scene.name,description:scene.description,
  prompt:adaptScenePrompt(readFileSync(path.join(sourceDir,name),'utf8'),scene.people,scene.code),
  generationPreset:scene.code==='01'?'coming-of-age':'directed-portrait',sceneOrientation:scene.orientation,subjectCount:scene.people,sourceCode:scene.code,
  version:original?.version??1,enabled:scene.people===1,exampleUrl:`/examples/scene-${scene.code.toLowerCase()}.webp`,size:'HQ',color:scene.color};
 if (original) {
  for (const key of ['name','prompt','description','exampleUrl','size'] as const) {
   if(original[key]!==update[key] && original[key]!==undefined) remember(scene.id,key,original[key]);
  }
  const changed = Object.entries(update).some(([key,value])=>key!=='version' && JSON.stringify((original as any)[key])!==JSON.stringify(value));
  Object.assign(original,update,{version:original.version+(changed?1:0)});
 } else styles.push(update);
}
// Size-only upgrades are independent of editable prompts and theme enable switches.
for (const style of styles) {
 if(style.size==='1.5K') {remember(style.id,'size',style.size);style.size='HQ';}
}
writeFileSync(migrationFile,JSON.stringify(migration,null,2)+'\n');
writeFileSync(file,JSON.stringify(styles,null,2)+'\n');
console.log({total:styles.length,enabled:styles.filter(s=>s.enabled).length,imported:importedScenes.length});

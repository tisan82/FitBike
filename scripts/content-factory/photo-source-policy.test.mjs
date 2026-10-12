import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
const {PGlite}=await import(process.env.PGLITE_MODULE??'@electric-sql/pglite');
const migration=readFileSync(new URL('../../supabase/migrations/20261012203358_photo_source_policy.sql',import.meta.url),'utf8');
test('all historical levels allow Native methods without rewriting their Contract; external methods remain denied',async()=>{
 const db=await PGlite.create();try{
  const children=JSON.parse(readFileSync(new URL('./fixtures/authoring-children.json',import.meta.url),'utf8'));
  await db.exec(children.find(x=>x.proname==='content_pipeline_validate_visual_contract_v5').definition+';');
  await db.exec(migration);await db.exec(readFileSync(new URL('./photo-source-policy-regression.sql',import.meta.url),'utf8'));
  const row=(await db.query(`select public.content_pipeline_reference_generation_allowed_v1('{"contract_version":5}', 'NATIVE_FULL_GENERATION') as allowed`)).rows[0];assert.equal(row.allowed,false);
 }finally{await db.close();}
});
for(const dir of ['content-pipeline-visual-mcp','content-pipeline-source-stage'])test(`${dir}: references are optional guidance; real edit input identity remains mandatory`,()=>{
 const code=readFileSync(new URL(`../../supabase/functions/${dir}/generation.ts`,import.meta.url),'utf8').replace(/^import(?:[\s\S]*?)?;\n/gm,'').replace(/export /g,'');
 const ctx={URL,Date,Error,JSON,Array,Number,String,sourceUrl:x=>new URL(x)};vm.runInNewContext(ts.transpile(code,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}),ctx);
 const spec={productionMethod:'REFERENCE_BASED_GENERATION',prompt:'Create a parked motorcycle inspection scene.',references:[],transform:{}};
 assert.equal(ctx.validateGenerationSpec(spec).productionMethod,'REFERENCE_BASED_GENERATION');
 const guide={sourcePageUrl:'https://example.org/hint',sourceOwner:'Example'};assert.equal(ctx.validateGenerationSpec({...spec,references:[guide]}).references.length,1);
 assert.throws(()=>ctx.validateGenerationSpec({...spec,productionMethod:'REAL_SOURCE_AI_EDIT',inputAssetUrl:'https://example.org/photo.jpg'}),/AI_EDIT_INPUT_REFERENCE_REQUIRED/);
 const edit={...spec,productionMethod:'REAL_SOURCE_AI_EDIT',inputAssetUrl:'https://example.org/photo.jpg',references:[{...guide,sourceAssetUrl:'https://example.org/photo.jpg'}]};assert.equal(ctx.validateGenerationSpec(edit).productionMethod,'REAL_SOURCE_AI_EDIT');
});

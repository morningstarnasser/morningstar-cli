import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync}from'node:fs';
import {tmpdir}from'node:os';import{join}from'node:path';
import {loadImageBackend,runImageBackend,type ImageBackend}from'../src/image-backend.js';
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=';
function fixture(t:any,code:string){const dir=mkdtempSync(join(tmpdir(),'morningstar-image-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const script=join(dir,'backend.mjs');writeFileSync(script,code);const backend:ImageBackend={name:'Local fixture',command:process.execPath,args:[script],timeoutMs:1500};return{dir,backend,out:join(dir,'result.png')};}
test('only explicit valid global image-backend configuration is accepted',t=>{
 const f=fixture(t,'');const path=join(f.dir,'backend.json');assert.equal(loadImageBackend(path),undefined);
 writeFileSync(path,JSON.stringify(f.backend));assert.deepEqual(loadImageBackend(path),f.backend);
 for(const change of [{command:'relative-executable'},{args:[7]},{timeoutMs:0}]){writeFileSync(path,JSON.stringify({...f.backend,...change}));assert.throws(()=>loadImageBackend(path),/Ungültige/);}
});
test('image backend receives literal prompt via stdin and saves verified PNG bytes with actual metadata',async t=>{
 const prompt='Logo "Morningstar"; $(literal)\nGrüezi';const f=fixture(t,`let raw='';for await(const c of process.stdin)raw+=c;const request=JSON.parse(raw);if(request.prompt!==${JSON.stringify(prompt)}||request.version!==1||request.options.seed!==42)throw Error('request mismatch');console.log(JSON.stringify({image:${JSON.stringify(PNG)},seed:42,steps:6,duration:1.2}));`);
 const result=await runImageBackend(f.backend,prompt,{seed:42},f.out);assert.equal(result.model,'Local fixture');assert.equal(result.resolution,'1x1');assert.equal(result.seed,42);assert.deepEqual(readFileSync(f.out),Buffer.from(PNG,'base64'));
 await assert.rejects(runImageBackend(f.backend,prompt,{seed:42},f.out),/EEXIST/);
});
test('invalid image and protocol output cannot create a success artifact',async t=>{
 const f=fixture(t,'');
 for(const output of ['not json',JSON.stringify({image:'aGVsbG8=',seed:1,steps:6,duration:1}),JSON.stringify({image:PNG,seed:-1,steps:6,duration:1})]){
  writeFileSync(f.backend.args[0],`process.stdin.resume();process.stdin.on('end',()=>console.log(${JSON.stringify(output)}));`);
  await assert.rejects(runImageBackend(f.backend,'test',{},f.out));assert.equal(existsSync(f.out),false);
 }
});
test('backend failure and timeout are bounded and never expose stderr secrets',async t=>{
 const f=fixture(t,`process.stdin.resume();process.stdin.on('end',()=>{console.error('SECRET_TOKEN');process.exitCode=1;});`);
 await assert.rejects(runImageBackend(f.backend,'test',{},f.out),e=>e instanceof Error&&/fehlgeschlagen/.test(e.message)&&!e.message.includes('SECRET_TOKEN'));
 writeFileSync(f.backend.args[0],'setInterval(()=>{},1000)');await assert.rejects(runImageBackend({...f.backend,timeoutMs:80},'test',{},f.out),/Zeitlimit/);
 assert.equal(existsSync(f.out),false);
});

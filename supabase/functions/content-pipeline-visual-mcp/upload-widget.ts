// No network client, credentials, or generation API. File helpers belong to the ChatGPT host.
export const uploadWidget = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:16px system-ui;margin:16px;color:#17202a;background:#fff}button,input{font:inherit;max-width:100%}button{padding:10px 14px;margin:8px 4px 8px 0;border:1px solid #aaa;border-radius:8px;background:#f5f7fa}p{line-height:1.5}#status{white-space:pre-wrap}label{display:block;margin-top:12px}</style>
<h3>FitBike 이미지 파일 전달</h3><p id="task">작업 정보를 불러오는 중입니다.</p>
<p>ChatGPT에서 만든 이미지를 선택하거나, 다운로드한 PNG·JPEG·WebP 파일을 업로드하세요. 접수 후 채팅에서 이미지 검사를 계속합니다.</p>
<button id="pick">채팅 파일에서 선택</button><label>생성 이미지 파일 <input id="file" type="file" accept="image/png,image/jpeg,image/webp"></label>
<div id="original" hidden><label>편집에 사용한 원본 사진 <input id="input" type="file" accept="image/png,image/jpeg,image/webp"></label></div>
<button id="send" disabled>이미지 전달</button><p id="status" role="status" aria-live="polite"></p>
<script>
const status=document.getElementById('status'),send=document.getElementById('send'),pick=document.getElementById('pick');
let task=null,selected=null,selectedInput=null,busy=false,seq=0,bridge=false;
const pending=new Map();
function request(method,params){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('응답이 중단되었습니다. 채팅에서 동일 operationId로 결과를 확인하세요.'));},45000);pending.set(id,{resolve,reject,timer});window.parent.postMessage({jsonrpc:'2.0',id,method,params},'*');});}
function showTask(t){if(!t?.requestId||!t?.spec)return;task=t;document.getElementById('task').textContent='이미지 작업 '+t.pipelineImageId;document.getElementById('original').hidden=!t.requiresInputFile;refresh();}
function refresh(){send.disabled=busy||!task||!selected||(task.requiresInputFile&&!selectedInput);pick.disabled=busy||!window.openai?.selectFiles;}
window.addEventListener('message',e=>{if(e.source!==window.parent)return;const m=e.data;if(!m||m.jsonrpc!=='2.0')return;if(m.id&&pending.has(m.id)){const p=pending.get(m.id);clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);return;}if(m.method==='ui/notifications/tool-result')showTask(m.params?.structuredContent);});
request('ui/initialize',{protocolVersion:'2026-01-26',appInfo:{name:'FitBike image upload',version:'1.0.0'},appCapabilities:{}}).then(()=>{bridge=true;window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized',params:{}},'*');}).catch(()=>{});
window.addEventListener('openai:set_globals',e=>showTask(e.detail?.globals?.toolOutput));showTask(window.openai?.toolOutput);
async function fromId(f){const d=await window.openai.getFileDownloadUrl({fileId:f.fileId});return{file_id:f.fileId,download_url:d.downloadUrl,...(f.mimeType?{mime_type:f.mimeType}:{}),...(f.fileName?{file_name:f.fileName}:{})};}
async function upload(f){if(!window.openai?.uploadFile||!window.openai?.getFileDownloadUrl)throw new Error('이 화면에서 파일 업로드 기능을 사용할 수 없습니다. 이미지를 채팅에 첨부한 뒤 dispatch_visual_generation의 file 입력으로 전달해 달라고 요청하세요.');if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>8388608)throw new Error('PNG·JPEG·WebP, 8MB 이하 파일을 선택하세요.');const r=await window.openai.uploadFile(f);return fromId({fileId:r.fileId,mimeType:f.type,fileName:f.name});}
pick.onclick=async()=>{try{const f=await window.openai.selectFiles();if(f.length!==1)throw new Error('생성 이미지 한 개를 선택하세요.');selected=await fromId(f[0]);status.textContent='이미지 선택 완료';refresh();}catch(e){status.textContent=e.message;}};
for(const [id,isInput] of [['file',false],['input',true]])document.getElementById(id).onchange=async e=>{if(busy||!e.target.files[0])return;busy=true;refresh();try{const f=await upload(e.target.files[0]);if(isInput)selectedInput=f;else selected=f;status.textContent='파일 준비 완료';}catch(e){status.textContent=e.message;}finally{busy=false;refresh();}};
async function call(name,args){const r=bridge?await request('tools/call',{name,arguments:args}):await window.openai.callTool(name,args);if(r?.isError)throw new Error(r.content?.find(x=>x.type==='text')?.text||'파일 접수 실패');return r?.structuredContent||r;}
send.onclick=async()=>{if(send.disabled)return;busy=true;refresh();try{const recovered=await call('get_visual_dispatch_result',{requestId:task.requestId,operationId:task.operationId});let r=recovered;if(recovered.result==='NOT_FOUND'){selected=await fromId({fileId:selected.file_id,mimeType:selected.mime_type,fileName:selected.file_name});if(selectedInput)selectedInput=await fromId({fileId:selectedInput.file_id,mimeType:selectedInput.mime_type,fileName:selectedInput.file_name});r=await call('dispatch_visual_generation',{requestId:task.requestId,operationId:task.operationId,spec:task.spec,file:selected,...(selectedInput?{inputFile:selectedInput}:{})});}status.textContent='접수 상태: '+(r.status||r.result||'확인 필요')+'\\nJob: '+(r.jobId||'')+'\\n채팅에서 같은 Job의 STAGED 확인과 픽셀·390px·SEO 검사를 계속하세요.';}catch(e){status.textContent=e.message;}finally{busy=false;refresh();}};
refresh();
</script></html>`;

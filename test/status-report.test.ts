import { test } from "node:test";
import assert from "node:assert/strict";
import { measuredStatusReport } from "../src/runtime/status-report.js";
import { runAgent } from "../src/agent-runner.js";
import type { CLIConfig, ToolResult } from "../src/types.js";

const snapshot: ToolResult = {tool:"bash",success:true,command:'ssh operator@host "hostname; uptime -p; free -b; df -B1 /; systemctl is-active network.service app.service" 2>&1',result:`example-host
up 10 weeks, 1 day, 4 hours
               total        used        free      shared  buff/cache   available
Mem:     17001922560  6103908352   377618432   112197632 10757652480 10898014208
Swap:     2147467264  1102774272  1044692992
Filesystem         1B-blocks         Used     Available Use% Mounted on
/dev/root 1967241846784 127390453760 1739842412544   7% /
active
active`};
const endpoint: ToolResult = {tool:"mcp__host_status__entity_status__abcdef0123456789",success:true,result:JSON.stringify({entity:"vps",label:"Example VPS",observed_at:"2026-11-27T11:42:30Z",data:{uptime_seconds:3556290,mem_used_gb:17.95,mem_total_gb:31.35,disk_root_percent:29,disk_root_free_gb:695,load1:0.59,tailscale:"up",nordvpn:"inactive"},display:{uptime:"41 Tage, 3 Stunden, 51 Minuten"}})};

test("direct status uses measured byte values, correct units and named service states",()=>{
  const text=measuredStatusReport("vps netcup und pi5 status geben",[snapshot,endpoint])!;
  assert.match(text,/5\.68 GiB \/ 15\.83 GiB \(35\.9%\)/);
  assert.match(text,/118\.64 GiB \/ 1832\.14 GiB \(7% belegt\) · 1620\.35 GiB frei/);
  assert.match(text,/network\.service \| active/);
  assert.match(text,/NordVPN \| inactive/);
  assert.match(text,/17\.95 \/ 31\.35 GB \(57\.3%\)/);
  assert.match(text,/2026-11-27T11:42:30Z/);
  assert.match(text,/Langzeitstabilität.*nicht belegt/);
});

test("analysis, historical questions, mixed reads and failures are never hidden by the status formatter",()=>{
  for(const task of ["Warum ist der VPS langsam? Status", "merke dir das und gib mir Status", "VPS Status gestern", "Analyse und VPS Status", "Wie beurteilst du den Status?"])
    assert.equal(measuredStatusReport(task,[snapshot]),undefined);
  for(const result of [{...snapshot,success:false},{tool:"read",success:true,result:"extra context"},{...snapshot,result:"unparseable"}])
    assert.equal(measuredStatusReport("vps status",[endpoint,result]),undefined);
});

test("final lifecycle and history use computed values and withhold unverified model numbers from streaming",async()=>{
  const config:CLIConfig={provider:"ollama",model:"test",apiKey:"",baseUrl:"",maxTokens:100,temperature:0,permissionMode:"bypassPermissions"};
  let turn=0;const streamed:string[]=[],ended:string[]=[];
  const result=await runAgent([{role:"user",content:"vps status"}],config,process.cwd(),{
    streamFn:async function*(){if(turn++===0)yield {type:"tool_call",text:"",toolCall:{id:"measure",name:"read",arguments:'{"filePath":"status.json"}'}};else yield {type:"content",text:"Wrong model values: 1 GB and everything healthy."};},
    nativeToolExecFn:()=>snapshot,onContent:text=>streamed.push(text),onTurnEnd:text=>ended.push(text),
  });
  assert.equal(streamed.length,0);
  assert.doesNotMatch(result.finalText,/Wrong model|everything healthy/);
  assert.equal(result.messages.at(-1)?.content,result.finalText);
  assert.equal(ended.at(-1),result.finalText);
  assert.match(result.finalText,/15\.83 GiB/);
});

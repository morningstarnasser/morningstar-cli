import { test } from "node:test";
import assert from "node:assert/strict";

import {
  clearDiscoveredProviderModels,
  getDiscoveredProviderModels,
  getProviderModelRefreshStatus,
  refreshProviderModelCatalogs as refreshLiveCatalogs,
} from "../src/provider-model-discovery.js";
import { listProviders, resolveModelName } from "../src/providers.js";

const refreshProviderModelCatalogs: typeof refreshLiveCatalogs = (credential, options) =>
  refreshLiveCatalogs(credential, { openCodeModelsFn: async () => [], ...options });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("live discovery normalizes provider ids and keeps only generation models", async (t) => {
  clearDiscoveredProviderModels();
  t.after(clearDiscoveredProviderModels);

  const fetchFn: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("11434")) return jsonResponse({ models: [{ name: "local-test:latest" }] });
    if (url.includes("anthropic")) {
      return jsonResponse({ data: [
        { id: "claude-opus-5" },
        { id: "embedding-not-a-claude-model" },
      ] });
    }
    if (url.includes("openai.com")) {
      return jsonResponse({ data: [
        { id: "gpt-5.2" },
        { id: "gpt-image-1" },
        { id: "gpt-realtime" },
        { id: "gpt-4o-mini-transcribe" },
        { id: "gpt-4o-audio-preview" },
        { id: "gpt-4o-mini-tts" },
        { id: "text-embedding-3-large" },
        { id: "omni-moderation-latest" },
        { id: "whisper-1" },
      ] });
    }
    if (url.includes("deepseek")) {
      return jsonResponse({ data: [{ id: "deepseek-chat" }] });
    }
    if (url.includes("googleapis")) {
      return jsonResponse({ models: [
        {
          name: "models/gemini-3.6-flash",
          baseModelId: "gemini-3.6-flash",
          supportedGenerationMethods: ["generateContent"],
        },
        {
          name: "models/text-embedding-004",
          supportedGenerationMethods: ["embedContent"],
        },
      ] });
    }
    if (url.includes("nvidia")) {
      return jsonResponse({ data: [
        { id: "meta/llama-4" },
        { id: "nvidia/nemotron-chat" },
        { id: "nvidia/nv-embed-v2" },
      ] });
    }
    if (url.includes("github")) {
      return jsonResponse([
        {
          id: "openai/gpt-4.1",
          supported_output_modalities: ["text"],
        },
      ]);
    }
    if (url.includes("groq")) {
      return jsonResponse({ data: [
        { id: "llama-3.3-70b-versatile" },
        { id: "groq/compound" },
        { id: "whisper-large-v3" },
      ] });
    }
    return jsonResponse({ data: [{ id: "anthropic/claude-opus-5" }] });
  };

  const results = await refreshProviderModelCatalogs(
    () => "test-key",
    { fetchFn, force: true, now: () => 1_000 },
  );

  assert.equal(results.every(({ status }) => status === "updated"), true);
  assert.deepEqual(getDiscoveredProviderModels("anthropic"), ["claude-opus-5"]);
  assert.deepEqual(getDiscoveredProviderModels("openai"), ["gpt-5.2"]);
  assert.deepEqual(getDiscoveredProviderModels("google"), ["gemini-3.6-flash"]);
  assert.deepEqual(getDiscoveredProviderModels("nvidia"), [
    "nvidia/meta/llama-4",
    "nvidia/nvidia/nemotron-chat",
  ]);
  assert.deepEqual(getDiscoveredProviderModels("github-models"), ["github/openai/gpt-4.1"]);
  assert.deepEqual(getDiscoveredProviderModels("groq"), [
    "groq/llama-3.3-70b-versatile",
    "groq/groq/compound",
  ]);
  assert.equal(
    resolveModelName("nvidia/nvidia/nemotron-chat", "nvidia"),
    "nvidia/nemotron-chat",
  );
  assert.equal(
    resolveModelName("groq/groq/compound", "groq"),
    "groq/compound",
  );
  assert.equal(getProviderModelRefreshStatus("groq"), "updated");

  const anthropic = listProviders().find(({ name }) => name === "anthropic");
  assert.deepEqual(anthropic?.models, ["claude-opus-5"]);
});

test("OpenAI discovery keeps chat fine-tunes but rejects non-chat endpoint models", async (t) => {
  clearDiscoveredProviderModels();
  t.after(clearDiscoveredProviderModels);

  const fetchFn: typeof fetch = async (input) => {
    if (String(input).includes("openai.com")) {
      return jsonResponse({ data: [
        { id: "gpt-5.2" },
        { id: "ft:gpt-5.2:org:audio-helper:run-1" },
        { id: "gpt-image-1" },
        { id: "gpt-realtime-mini" },
        { id: "gpt-4o-transcribe" },
        { id: "gpt-audio" },
        { id: "gpt-4o-mini-tts" },
        { id: "whisper-1" },
        { id: "text-embedding-3-small" },
        { id: "omni-moderation-latest" },
      ] });
    }
    return jsonResponse({ error: "unavailable" }, 503);
  };

  await refreshProviderModelCatalogs(
    (provider) => provider === "openai" ? "openai-test-key" : "",
    { fetchFn, force: true },
  );

  assert.deepEqual(getDiscoveredProviderModels("openai"), [
    "gpt-5.2",
    "ft:gpt-5.2:org:audio-helper:run-1",
  ]);
});

test("catalog refresh uses TTL cache and skips credentialed providers without keys", async (t) => {
  clearDiscoveredProviderModels();
  t.after(clearDiscoveredProviderModels);
  let requests = 0;
  const fetchFn: typeof fetch = async input => {
    requests++;
    return String(input).includes("11434") ? jsonResponse({ models: [] }) : jsonResponse({ data: [{ id: "openrouter/test-model" }] });
  };

  const first = await refreshProviderModelCatalogs(
    () => "",
    { fetchFn, now: () => 5_000 },
  );
  assert.equal(first.filter(({ status }) => status === "skipped").length, 8);
  assert.equal(first.find(({ provider }) => provider === "openrouter")?.status, "updated");
  assert.equal(requests, 2);

  const second = await refreshProviderModelCatalogs(
    () => "",
    { fetchFn, now: () => 5_001 },
  );
  assert.equal(second.find(({ provider }) => provider === "openrouter")?.status, "cached");
  assert.equal(getProviderModelRefreshStatus("openrouter"), "cached");
  assert.equal(requests, 2);
});

test("failed discovery remains non-throwing without inventing selectable models", async (t) => {
  clearDiscoveredProviderModels();
  t.after(clearDiscoveredProviderModels);

  const results = await refreshProviderModelCatalogs(
    () => "test-key",
    {
      fetchFn: async () => jsonResponse({ error: "no" }, 503),
      openCodeModelsFn: async () => { throw new Error("offline"); },
      force: true,
    },
  );

  assert.equal(results.every(({ status }) => status === "failed"), true);
  assert.equal(getDiscoveredProviderModels("anthropic"), undefined);
  assert.ok(
    (listProviders().find(({ name }) => name === "anthropic")?.models.length ?? 0) === 0,
  );
});

test("catalog discovery rejects redirects without forwarding credentials", async (t) => {
  clearDiscoveredProviderModels();
  t.after(clearDiscoveredProviderModels);

  const secret = "provider-secret-that-must-not-leak";
  const calls: Array<{ url: string; redirect: RequestRedirect | undefined }> = [];
  const fetchFn: typeof fetch = async (input, init) => {
    calls.push({
      url: String(input),
      redirect: init?.redirect,
    });
    return new Response("", {
      status: 302,
      headers: { location: "https://credential-thief.invalid/catalog" },
    });
  };

  const results = await refreshProviderModelCatalogs(
    () => secret,
    { fetchFn, force: true },
  );

  assert.equal(calls.length, 10);
  assert.equal(calls.every(({ redirect }) => redirect === "manual"), true);
  assert.equal(
    calls.some(({ url }) => url.includes("credential-thief.invalid")),
    false,
  );
  assert.equal(results.filter(p => p.provider !== "opencode").every(({ status }) => status === "failed"), true);
  for (const result of results.filter(p => p.provider !== "opencode")) {
    assert.match(result.error ?? "", /redirect blocked/);
    assert.equal(result.error?.includes(secret), false);
    assert.equal(result.error?.includes("credential-thief.invalid"), false);
  }
});

 test("Ollama catalog follows the running server and drops stopped or deleted models", async () => {
  clearDiscoveredProviderModels();
  const fetchFn: typeof fetch = async url => String(url).includes("11434") ? jsonResponse({ models: [{ name: "fixture:latest" }] }) : jsonResponse({}, 503);
  await refreshProviderModelCatalogs(() => "", { fetchFn, force: true });
  assert.deepEqual(listProviders().find(p => p.name === "ollama")?.models, ["fixture:latest"]);
  await refreshProviderModelCatalogs(() => "", { fetchFn: async () => jsonResponse({}, 503), force: true });
  assert.deepEqual(listProviders().find(p => p.name === "ollama")?.models, []);
  clearDiscoveredProviderModels();
 });


test("forced refresh replaces removed entries, including a successfully empty cloud catalog", async t => {
  clearDiscoveredProviderModels(); t.after(clearDiscoveredProviderModels);
  let ids = ["gpt-old"], calls = 0;
  const fetchFn: typeof fetch = async input => { if (String(input).includes("openai.com")) { calls++; return jsonResponse({data: ids.map(id => ({id}))}); } return jsonResponse({},503); };
  const credentials = (p:string) => p === "openai" ? "test-key" : "";
  for (const expected of [["gpt-old"],["gpt-new"],[]]) {
    ids=expected; await refreshProviderModelCatalogs(credentials,{fetchFn,force:true,now:()=>1000});
    assert.deepEqual(getDiscoveredProviderModels("openai"),expected);
    assert.equal(getProviderModelRefreshStatus("openai"),"updated");
  }
  assert.equal(calls,3);
});

test("failed or malformed replies never keep obsolete selectable entries", async t => {
  clearDiscoveredProviderModels();t.after(clearDiscoveredProviderModels);
  const creds=(p:string)=>p==="openai"?"test-key":"";
  for(const bad of [jsonResponse({},503),jsonResponse({error:"bad"}),new Response("not JSON")]) {
    await refreshProviderModelCatalogs(creds,{force:true,fetchFn:async()=>jsonResponse({data:[{id:"gpt-old"}]})});
    await refreshProviderModelCatalogs(creds,{force:true,fetchFn:async()=>bad.clone()});
    assert.equal(getDiscoveredProviderModels("openai"),undefined);
    assert.equal(getProviderModelRefreshStatus("openai"),"failed");
  }
});

test("credential removal and account changes invalidate cached models",async t=>{
  clearDiscoveredProviderModels();t.after(clearDiscoveredProviderModels);
  let id="gpt-account-one",count=0;
  const fetchFn:typeof fetch=async input=>{if(String(input).includes("openai.com")){count++;return jsonResponse({data:[{id}]});}return jsonResponse({},503);};
  await refreshProviderModelCatalogs(p=>p==="openai"?"key-one":"",{fetchFn,now:()=>1000});
  id="gpt-account-two";
  await refreshProviderModelCatalogs(p=>p==="openai"?"key-two":"",{fetchFn,now:()=>1001});
  assert.equal(count,2);assert.deepEqual(getDiscoveredProviderModels("openai"),[id]);
  await refreshProviderModelCatalogs(()=>"",{fetchFn,now:()=>1002});
  assert.equal(getDiscoveredProviderModels("openai"),undefined);assert.equal(getProviderModelRefreshStatus("openai"),"skipped");
});

test("Ollama discovery follows inference endpoint and never reuses another server catalog",async t=>{
  clearDiscoveredProviderModels();t.after(clearDiscoveredProviderModels);
  const urls:string[]=[];
  const fetchFn:typeof fetch=async(input,init)=>{const u=String(input);urls.push(u);if(u.includes("example.test")){assert.equal(new Headers(init?.headers).has("Authorization"),false);return jsonResponse({models:[{name:u.includes("second")?"second:latest":"first:latest"}]});}return jsonResponse({},503);};
  await refreshProviderModelCatalogs(()=>"",{fetchFn,now:()=>1000,ollamaBaseUrl:"https://first.example.test/prefix/v1"});
  assert.deepEqual(getDiscoveredProviderModels("ollama"),["first:latest"]);
  await refreshProviderModelCatalogs(()=>"",{fetchFn,now:()=>1001,ollamaBaseUrl:"https://second.example.test/v1"});
  assert.deepEqual(getDiscoveredProviderModels("ollama"),["second:latest"]);
  assert.ok(urls.includes("https://first.example.test/prefix/api/tags"));
  assert.ok(urls.includes("https://second.example.test/api/tags"));
});

test("late responses cannot restore removed models or clear newer catalogs",async t=>{
  clearDiscoveredProviderModels();t.after(clearDiscoveredProviderModels);
  let release!:(r:Response)=>void;
  const old=refreshProviderModelCatalogs(()=>"",{force:true,fetchFn:async input=>String(input).includes("11434")?new Promise<Response>(resolve=>{release=resolve;}):jsonResponse({},503)});
  await refreshProviderModelCatalogs(()=>"",{force:true,fetchFn:async input=>String(input).includes("11434")?jsonResponse({models:[{name:"new:latest"}]}):jsonResponse({},503)});
  release(jsonResponse({models:[{name:"old:latest"}]}));await old;
  assert.deepEqual(getDiscoveredProviderModels("ollama"),["new:latest"]);
});

test("invalid endpoint credentials are rejected without any request or diagnostic leak",async t=>{
 clearDiscoveredProviderModels();t.after(clearDiscoveredProviderModels);const urls:string[]=[];
 const results=await refreshProviderModelCatalogs(()=>"",{force:true,ollamaBaseUrl:"https://user:private-secret@example.test/v1",fetchFn:async input=>{urls.push(String(input));return jsonResponse({},503);}});
 assert.ok(urls.every(url=>!url.includes("example.test")));
 const result=results.find(r=>r.provider==="ollama")!;assert.equal(result.status,"failed");assert.doesNotMatch(result.error??"",/private-secret|user|example.test/);
});

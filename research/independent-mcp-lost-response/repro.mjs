import assert from 'node:assert/strict';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';

async function runCase({mode,label}){
  let effectCount=0,dropOnce=true,observed=[],requestIds=[];
  const committed=new Map();
  const server=new McpServer({name:'neevan-mcp-v2-test',version:'0.0.1'});
  server.registerTool('make_record',{
    description:'isolated fixture, no real external effects',
    inputSchema:z.object({ operationId:z.string(), content:z.string() })
  },async({operationId,content})=>{
     if(mode==='key' && committed.has(operationId)){
        return {content:[{type:'text',text:committed.get(operationId)}]};
     }
     effectCount++;
     const value='record-'+effectCount+':'+content;
     if(mode==='key')committed.set(operationId,value);
     return {content:[{type:'text',text:value}]};
  });
  const [clientWire,serverWire]=InMemoryTransport.createLinkedPair();
  await server.connect(serverWire);
  const client=new Client({name:'neevan-v2-lost-response-client',version:'0.0.1'});
  await client.connect(clientWire);
  const originalSend=serverWire.send.bind(serverWire);
  serverWire.send=async(message,...args)=>{
    if(typeof message?.id==='number' && ('result' in message || 'error' in message)){
      requestIds.push(message.id);
      if(dropOnce && message?.result?.content?.[0]?.text?.startsWith('record-')){
        dropOnce=false;return; // deterministic loss of the first response, AFTER the tool effect
      }
    }
    return originalSend(message,...args);
  };
  const request={name:'make_record',arguments:{operationId:'logical-1',content:'example'}};
  try{
    let firstError=null;
    try{await client.callTool(request,{timeout:120});}catch(e){firstError={name:e.name,message:String(e.message).slice(0,260)};}
    assert(firstError,'first response unexpectedly delivered');
    observed.push(firstError);
    const retry=await client.callTool(request,{timeout:2500});
    observed.push(retry?.content?.[0]?.text);
    if(mode==='baseline')assert.equal(effectCount,2);
    else assert.equal(effectCount,1);
    assert.equal(requestIds.length,2);
    assert.notEqual(requestIds[0],requestIds[1]);
    if (mode === 'key') {
      const legitimateRepeat=await client.callTool({
        name:'make_record',arguments:{operationId:'logical-2',content:'example'}
      },{timeout:2500});
      assert.equal(effectCount,2);
      assert.equal(legitimateRepeat.content?.[0]?.text,'record-2:example');
    }
    console.log('MCP_V2_RESULT '+JSON.stringify({label,mode,postRetryEffectCount:mode==='key'?1:effectCount,finalEffectCount:effectCount,requestIds,observed}));
  }finally{
    await client.close();await server.close();
  }
}
await runCase({mode:'baseline',label:'lost-response -> explicit application retry'});
await runCase({mode:'key',label:'same scenario with local application-level operation-ID deduplication'});


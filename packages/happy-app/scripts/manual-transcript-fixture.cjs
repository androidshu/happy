// Run with node; open the printed localhost URL and evaluate
// await window.runTranscriptChecks() in a real browser.
const { build } = require('esbuild');
const { createServer } = require('node:http');
const path = require('node:path');
const { createPaginationHarness } = require('./sync-pagination-harness.cjs');

(async () => {
    const bundle = await build({
        stdin: { resolveDir: path.resolve(__dirname, '..'), loader: 'tsx', contents: `
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ManualTranscript } from './sources/components/ManualTranscript';
const root = createRoot(document.getElementById('root'));
let items = Array.from({length:1500}, (_,i) => ({id:'row-'+i, height:i%5===0?240:32}));
let loading=false, hasMore=true, calls=0, finish, syncMode=false;
async function syncRequest(action) {
    const data=await (await fetch('/sync/'+action)).json();
    items=data.messages.map(row=>({...row,height:40}));hasMore=data.hasMoreOlder;loading=false;render();
    return data;
}
function render() { flushSync(() => root.render(<ManualTranscript items={items}
    renderItem={i => <div style={{height:items[i].height,boxSizing:'border-box',borderBottom:'1px solid #444'}}>Message {items[i].id}</div>}
    hasMore={hasMore} loading={loading} color="#ddd" backgroundColor="#222"
    loadLabel="Load older messages" loadingLabel="Loading" errorLabel="Retry" bottomLabel="Latest messages"
    loadOlder={() => {calls++; loading=true; render(); if(syncMode) return syncRequest('older'); return new Promise((resolve,reject)=> {finish=(fail=false)=> {
        loading=false;
        if(!fail) items=[...Array.from({length:100},(_,i)=>({id:'older-'+calls+'-'+i,height:i%3===0?160:28})),...items];
        render(); fail?reject(new Error('fixture failure')):resolve();
    };});}} />)); }
render();
window.runTranscriptChecks = async () => {
    const results=[];
    const check=(name,ok,detail={}) => {results.push({name,pass:ok,...detail}); if(!ok) throw new Error(JSON.stringify(results));};
    const tick=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const scroller=document.querySelector('[data-testid="manual-transcript"]');
    const older=()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Load older messages'||b.textContent==='Retry');
    const firstVisible=()=>Array.from(scroller.querySelectorAll('[data-transcript-row]')).find(n=>n.getBoundingClientRect().bottom>scroller.getBoundingClientRect().top);
    await tick();
    check('opens at latest',Math.abs(scroller.scrollHeight-scroller.clientHeight-scroller.scrollTop)<2);
    scroller.scrollTop=12000; await tick();
    const saved=firstVisible(), y=saved.getBoundingClientRect().top, offset=scroller.scrollTop;
    for(let i=0;i<80;i++) { items=[...items,{id:'append-'+i,height:50}];render(); }
    await tick();
    check('80 appended messages preserve reading position',scroller.scrollTop===offset&&saved.getBoundingClientRect().top===y);
    items=items.map((row,i)=>i===items.length-1?{...row,height:800}:row);render();await tick();
    check('streaming growth below viewport preserves position',scroller.scrollTop===offset&&saved.getBoundingClientRect().top===y);
    for(let i=0;i<10;i++) render(); await tick();
    check('status rerenders preserve DOM row and position',saved.isConnected&&scroller.scrollTop===offset);
    scroller.scrollTop=0;await tick();
    check('reaching top does not fetch',calls===0);
    const anchor=firstVisible(), anchorY=anchor.getBoundingClientRect().top;
    older().click(); await tick();
    check('loading indicator does not move rows',anchor.getBoundingClientRect().top===anchorY);
    finish();await tick();
    check('explicit prepend preserves visible message',anchor.isConnected&&Math.abs(anchor.getBoundingClientRect().top-anchorY)<1);
    scroller.scrollTop=0;await tick();older().click();await tick();
    scroller.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:100}));scroller.scrollTop=150;await tick();
    finish();await tick();
    check('user scroll during request cancels pending correction',scroller.scrollTop===150);
    scroller.scrollTop=0;await tick();older().click();await tick();finish(true);await tick();
    check('failed load exposes retry',Boolean(older()?.textContent==='Retry'));
    older().click();await tick();finish();await tick();
    check('retry succeeds',Boolean(older()?.textContent==='Load older messages'));
    for(const offset of [200,6000,17000,30000,70000]) {
        scroller.scrollTop=offset;await tick();
        const r=scroller.getBoundingClientRect();
        const node=document.elementFromPoint(r.left+50,r.top+200);
        check('content present at scroll '+offset,Boolean(node?.closest('[data-transcript-row]')));
    }
    document.querySelector('button[aria-label="Latest messages"]').click();await tick();
    check('explicit latest button works',Math.abs(scroller.scrollHeight-scroller.clientHeight-scroller.scrollTop)<2);
    return {passed:results.length,results};
};
window.runSyncChecks = async () => {
    syncMode=true;
    const results=[];
    const check=(name,ok,detail={})=>{results.push({name,pass:ok,...detail});if(!ok)throw new Error(JSON.stringify(results));};
    const tick=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    await syncRequest('open');await tick();
    const scroller=document.querySelector('[data-testid="manual-transcript"]');
    const latest=()=>document.querySelector('button[aria-label="Latest messages"]').click();
    for(let i=0;i<3;i++) {
        latest();await tick();const offset=scroller.scrollTop;
        await new Promise(r=>setTimeout(r,600));const data=await syncRequest('status');await tick();
        check('latest stays put without background history '+i,data.requests.length===1&&items.length===100&&scroller.scrollTop===offset,
            {requests:data.requests.length,rows:items.length,scrollTop:scroller.scrollTop});
    }
    scroller.scrollTop=0;await tick();
    const row=scroller.querySelector('[data-transcript-row]'), top=row.getBoundingClientRect().top;
    Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Load older messages').click();
    await new Promise(r=>setTimeout(r,600));const older=await syncRequest('status');await tick();
    check('explicit history loads one page and preserves row',older.requests.length===2&&items.length===200&&Math.abs(row.getBoundingClientRect().top-top)<1);
    await syncRequest('forward');await tick();
    check('forward sync appends new messages without older fetch',items.length===202&&items[0].id==='row-801'&&items[201].id==='row-1002');
    return {passed:results.length,results};
};
` },
        bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
    });
    let pagination;
    const server = createServer(async (request, response) => {
        if (request.url.startsWith('/sync/')) {
            try {
                if (request.url === '/sync/open') {
                    pagination = createPaginationHarness();
                    await pagination.sync.fetchMessages('chat');
                } else if (request.url === '/sync/older') {
                    await pagination.sync.loadOlderMessages('chat');
                } else if (request.url === '/sync/forward') {
                    await pagination.sync.fetchMessages('chat');
                }
                response.setHeader('Content-Type', 'application/json');
                response.end(JSON.stringify({ ...pagination.entry, requests: pagination.requests,
                    messages: pagination.pages.flat().sort((a,b)=>a.seq-b.seq) }));
            } catch (error) {
                response.statusCode = 500;
                response.end(String(error));
            }
            return;
        }
        response.setHeader('Content-Type', request.url === '/bundle.js' ? 'text/javascript' : 'text/html');
        response.end(request.url === '/bundle.js' ? bundle.outputFiles[0].text :
            '<html><meta charset="utf-8"><body style="margin:0;background:#222"><div id="root" style="display:flex;height:600px;width:900px"></div><script src="/bundle.js"></script></body></html>');
    });
    server.listen(0, '127.0.0.1', () => console.log('http://127.0.0.1:' + server.address().port));
})();

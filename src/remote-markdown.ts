/** Browser-side renderer: only explicitly created DOM nodes, never model HTML. */
export const remoteMarkdown = String.raw`
  function markdown(text) {
    const root=el('div',undefined,'markdown');
    const append=(parent,tokens,depth=0)=>{if(depth>30)return;for(const t of tokens||[]){
      const nested=(tag,children=t.tokens)=>{const node=el(tag);append(node,children,depth+1);parent.append(node);return node;};
      switch(t.type){
        case 'space':break;
        case 'strong':nested('strong');break; case 'em':nested('em');break; case 'del':nested('del');break;
        case 'paragraph':nested('p');break;
        case 'heading':nested('h'+Math.max(2,Math.min(6,t.depth+1)));break;
        case 'blockquote':nested('blockquote');break;
        case 'list':{const list=el(t.ordered?'ol':'ul');if(t.ordered&&Number.isInteger(t.start))list.start=t.start;for(const item of t.items){const li=el('li');if(item.task)li.append(document.createTextNode(item.checked?'☑ ':'☐ '));append(li,item.tokens,depth+1);list.append(li);}parent.append(list);break;}
        case 'text':if(t.tokens)append(parent,t.tokens,depth+1);else parent.append(document.createTextNode(t.text||''));break;
        case 'escape':parent.append(document.createTextNode(t.text||''));break;
        case 'codespan':parent.append(el('code',t.text));break;
        case 'code':{const wrap=el('div',undefined,'code-block'),head=el('div',undefined,'code-head'),button=el('button','Kopieren');head.append(el('span',(t.lang||'Code').split(/\s/)[0]),button);button.onclick=()=>copy(t.text,button);const pre=el('pre');pre.append(el('code',t.text));wrap.append(head,pre);parent.append(wrap);break;}
        case 'link':{let safe=false;try{safe=['https:','http:','mailto:'].includes(new URL(t.href).protocol);}catch{}if(safe){const link=nested('a');link.href=t.href;link.target='_blank';link.rel='noopener noreferrer';}else append(parent,t.tokens,depth+1);break;}
        case 'image':parent.append(el('span','[Bild: '+(t.text||'Anhang')+']','image-label'));break;
        case 'br':parent.append(el('br'));break;case 'hr':parent.append(el('hr'));break;
        case 'table':{const wrap=el('div',undefined,'table-scroll'),table=el('table'),head=el('thead'),tr=el('tr');for(const c of t.header){const th=el('th');append(th,c.tokens,depth+1);tr.append(th);}head.append(tr);table.append(head);const body=el('tbody');for(const row of t.rows){const tr=el('tr');for(const c of row){const td=el('td');append(td,c.tokens,depth+1);tr.append(td);}body.append(tr);}table.append(body);wrap.append(table);parent.append(wrap);break;}
        default:parent.append(document.createTextNode(t.raw||t.text||''));
      }
    }};
    try{append(root,marked.lexer(text,{gfm:true}));}catch{root.textContent=text;}
    return root;
  }
  async function copy(text,button){
    let copied=false;
    try{if(navigator.clipboard&&isSecureContext){await navigator.clipboard.writeText(text);copied=true;}}catch{}
    if(!copied){const field=el('textarea'),active=document.activeElement;field.value=text;field.className='copy-buffer';document.body.append(field);field.focus();field.select();try{copied=document.execCommand('copy');}catch{}finally{field.remove();active?.focus({preventScroll:true});}}
    if(copied){button.textContent='Kopiert';setTimeout(()=>button.textContent='Kopieren',1800);}else notice('Bitte den Text markieren und über das Auswahlmenü kopieren.');
  }
`;

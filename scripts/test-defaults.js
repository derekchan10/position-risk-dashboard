const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8'),code=fs.readFileSync('app.js','utf8');
class Element{constructor(value=''){this.value=value;this.listeners={};this.children=[];}setAttribute(){}addEventListener(name,fn){this.listeners[name]=fn;}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}}
function boot(storage){
 const elements=Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(match=>[match[1],new Element()]));
 for(const match of html.matchAll(/<input\b[^>]*id="([^"]+)"[^>]*>/g))elements[match[1]].value=match[0].match(/\bvalue="([^"]*)"/)?.[1]??'';
 const radio=new Element('long');radio.checked=true;
 const context={document:{getElementById:id=>elements[id],querySelector:()=>radio,querySelectorAll:()=>[radio],createElement:()=>new Element()},window:{dispatchEvent(){}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},Event};
 vm.createContext(context);vm.runInContext(code,context);return elements;
}
const store=new Map([['position-calculator-default70-v6',JSON.stringify({risk:999,marginLimit:9999})]]);
let e=boot(store);assert.equal(Number(e.risk.value),500);assert.equal(Number(e.marginLimit.value),3000);
e['default-risk'].value='600';e['default-margin'].value='2000';e['default-risk'].listeners.change();assert.equal(Number(e.risk.value),600);assert.equal(Number(e.marginLimit.value),2000);
e.risk.value='100';e.risk.listeners.input();e=boot(store);assert.equal(Number(e.risk.value),600);assert.equal(Number(e.marginLimit.value),2000);
e['default-margin'].value='';e['default-margin'].listeners.change();assert.equal(e.marginLimit.value,'');e=boot(store);assert.equal(e.marginLimit.value,'');
e['default-risk'].value='0';e['default-risk'].listeners.change();assert(e['defaults-error'].textContent);assert.equal(Number(e.risk.value),600);
console.log('PASS: initial 500/3000 defaults, immediate apply, reload persistence, temporary edits, unlimited margin and invalid inputs');

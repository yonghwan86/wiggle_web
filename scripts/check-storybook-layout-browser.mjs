// Production build, isolated SQLite/assets, Chrome touch emulation. No live student data.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {startTestServer} from '../tests/harness/server.mjs';
import {sha256} from '../lib/token-crypto.ts';
import {emptyStorybookDocument, STORYBOOK_TEXT_BOX, applyStorybookTemplate} from '../lib/storybook-model.ts';
import {emptyDocument} from '../lib/drawing-model.ts';

const {chromium}=createRequire(import.meta.url)(process.env.BOOK_PLAYWRIGHT_MODULE || 'playwright');
const server=await startTestServer({env:{OPENAI_API_KEY:'',SWEETBOOK_API_KEY:''}});
await server.fetch('/api/student');
const student='student_layout',room='class_layout',teacher='teacher_layout',token=randomUUID(),expiresAt=new Date(Date.now()+3600000).toISOString();
await server.DB.batch([
 server.DB.prepare("INSERT INTO teachers(id,email,display_name) VALUES(?,?,'검증 교사')").bind(teacher,'layout@example.test'),
 server.DB.prepare("INSERT INTO classrooms(id,teacher_id,display_name,class_code,join_token) VALUES(?,?,'검증 학급','1738',?)").bind(room,teacher,randomUUID()),
 server.DB.prepare("INSERT INTO student_profiles(id,classroom_id,nickname,animal,seat_number,real_name,entry_code,claimed_at,last_activity_at) VALUES(?,?,'봄이','cat',1,'예시 학생','2468',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").bind(student,room),
 server.DB.prepare('INSERT INTO device_sessions(token_hash,student_id,expires_at,last_used_at) VALUES(?,?,?,CURRENT_TIMESTAMP)').bind(await sha256(token),student,expiresAt),
 ...Array.from({length:3},(_,i)=>server.DB.prepare("INSERT INTO artworks(id,student_id,classroom_id,title,topic,learning_mode,ops_json) VALUES(?,?,?,?,'집','free',?)").bind('artwork_layout'+i,student,room,i ? '우리 동네에서 친구들과 만난 이야기' : '내 그림',JSON.stringify(emptyDocument()))),
]);
const headers={authorization:'Bearer '+token,'content-type':'application/json'};
const titles=['1 - 복사본','내가 친구들과 함께 만든 아주 긴 제목의 그림책 이야기','띄어쓰기없이아주길게이어지는제목도카드밖으로나가지않아요','2','내 마음 그림 그림책','나의 새 그림책'];
const ids=[];
for(const [i,title] of titles.entries()){
 const response=await server.fetch('/api/storybooks',{method:'POST',headers,body:JSON.stringify({title})});
 assert.equal(response.status,201);
 const id=(await response.json()).storybook.id;ids.push(id);
 if(i>=3) await server.DB.prepare("UPDATE storybooks SET status='complete',completed_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
}
const doc=emptyStorybookDocument();
doc.pages[0].elements[0].text='위쪽에 고정된 이야기 칸이에요.';
const legacy=emptyStorybookDocument('squarebook-hc','page_layoutlegacy','element_layoutlegacy').pages[0];
legacy.elements[0].text='예전에 저장한 글과 위치는 그대로 남아요.';legacy.elements[0].y=.35;
doc.pages.push(legacy,applyStorybookTemplate(emptyStorybookDocument('squarebook-hc','page_layoutauthor','element_layoutauthor').pages[0],'author',()=> 'element_'+randomUUID().replaceAll('-','')));
await server.DB.prepare('UPDATE storybooks SET document_json=? WHERE id=?').bind(JSON.stringify(doc),ids[0]).run();
const before=await server.DB.prepare('SELECT id,title,document_json,status FROM storybooks ORDER BY id').all();
const output='work/storybook-layout';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.BOOK_CHROME_PATH || undefined,headless:true});
try {
 const context=await browser.newContext({viewport:{width:768,height:1024},hasTouch:true,reducedMotion:'no-preference'});
 await context.addInitScript(({student,token,expiresAt})=>{
  localStorage.setItem('wiggle.deviceProfiles.v2',JSON.stringify([{studentId:student,nickname:'봄이',animal:'cat',classroomName:'검증 학급'}]));
  sessionStorage.setItem('wiggle.activeSession.v2',JSON.stringify({studentId:student,deviceToken:token,expiresAt}));
 },{student,token,expiresAt});
 const page=await context.newPage();page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const sizes=[[320,568],[390,844],[600,960],[768,1024],[820,1180],[844,390],[1024,768],[1180,820],[1280,800],[1440,1000]];
 const overflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page horizontal overflow');
 async function inspectGrid(selector,cardSelector){
  const metrics=await page.locator(selector).evaluateAll((grids,cardSelector)=>grids.map(grid=>{
   const rect=el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom};};
   return {bounds:rect(grid),cards:[...grid.querySelectorAll(cardSelector)].map(el=>({bounds:rect(el),button:el.querySelector('button') ? rect(el.querySelector('button')) : null,overflow:el.scrollWidth>el.clientWidth+1}))};
  }),cardSelector);
  const all=metrics.flatMap(grid=>grid.cards);
  assert.ok(all.length>=6);
  assert.ok(Math.max(...all.map(c=>c.bounds.width))-Math.min(...all.map(c=>c.bounds.width))<2,'same card widths in both groups');
  for(const grid of metrics){
   for(const card of grid.cards){
    assert.equal(card.overflow,false,'card content fits');
    assert.ok(card.bounds.x>=grid.bounds.x-1&&card.bounds.right<=grid.bounds.right+1,'card fits grid');
    if(card.button){assert.ok(card.button.height>=44,'touch target');assert.ok(card.button.right<=card.bounds.right+1&&card.button.bottom<=card.bounds.bottom+1,'copy stays inside item');}
    for(const peer of grid.cards.filter(other=>Math.abs(other.bounds.y-card.bounds.y)<2)){
     assert.ok(Math.abs(peer.bounds.height-card.bounds.height)<2,'equal row heights');
     if(peer.button&&card.button)assert.ok(Math.abs(peer.button.y-card.button.y)<2,'aligned copy buttons');
    }
   }
  }
 }
 await page.goto(server.origin+'/student');await page.locator('.desk-book-card').last().waitFor();
 for(const [width,height]of sizes){
  await page.setViewportSize({width,height});await overflow();
  assert.equal(await page.locator('.desk-book-card').count(),6);
  assert.equal(await page.getByRole('link',{name:'내 그림책 모두 보기 (6권)',exact:true}).count(),1);
  assert.ok(await page.locator('.desk-book-row').first().locator('li').first().getByRole('link',{name:/새 그림책/}).count());
  await inspectGrid('.desk-book-row',':scope > li');
  await page.locator('[aria-labelledby="desk-book-title"]').screenshot({path:`${output}/home-books-${width}.png`});
  if([768,1180].includes(width))await page.screenshot({path:`${output}/home-${width}.png`,fullPage:true});
 }
 await page.goto(server.origin+'/student/books');await page.locator('.storybook-book-grid>article').last().waitFor();
 for(const [width,height]of sizes){
  await page.setViewportSize({width,height});await overflow();await inspectGrid('.storybook-book-grid',':scope > article');
  if([768,1180].includes(width))await page.screenshot({path:`${output}/library-${width}.png`,fullPage:true});
 }
 console.log('PASS 10 sizes: home/library counts, consistent groups/rows, long titles, 44px copy buttons, no horizontal overflow');
 await page.goto(server.origin+'/student/books/'+ids[0]);
 const text=()=>page.getByRole('textbox',{name:'이 쪽의 이야기',exact:true});
 const btn=name=>page.getByRole('button',{name,exact:true});
 const saved=()=>page.waitForFunction(()=>document.querySelector('.storybook-save-state')?.textContent.includes('✓ 저장됨'));
 await text().waitFor();await page.waitForTimeout(1000);
 assert.deepEqual(await server.DB.prepare('SELECT id,title,document_json,status FROM storybooks ORDER BY id').all(),before,'opening lists/editor does not rewrite existing books');
 const range=async(name,value)=>page.getByRole('slider',{name,exact:true}).evaluate((el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(value));el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);
 for(const [width,height]of sizes){
  await page.setViewportSize({width,height});await overflow();await text().tap();
  assert.equal(await page.locator('.storybook-editor-header').evaluate(el=>{
   const boxes=[...el.querySelectorAll('a,input,button')].map(e=>e.getBoundingClientRect());
   return boxes.some((a,i)=>boxes.slice(i+1).some(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1));
  }),false,`editor header overlap ${width}`);
  assert.equal(await page.getByRole('slider',{name:'이야기 칸 세로 위치',exact:true}).count(),0);
  const top=await text().evaluate(el=>el.parentElement.style.top);
  await range('이야기 칸 높이',.30);await saved();
  assert.equal(await text().evaluate(el=>el.parentElement.style.top),top,'height cannot move top');
  assert.equal(await text().evaluate(el=>el.parentElement.style.height),'30%');
  await range('이야기 칸 높이',.16);await saved();
  if([768,1180].includes(width))await page.screenshot({path:`${output}/text-tools-${width}.png`});
  await btn('꾸미기 닫기').click();
 }
 await page.reload();await text().waitFor();
 assert.equal(await text().evaluate(el=>el.parentElement.style.top),`${STORYBOOK_TEXT_BOX.y*100}%`);
 await page.locator('.storybook-page-rail>button').nth(1).click();
 assert.equal(await text().inputValue(),legacy.elements[0].text);
 assert.equal(await text().evaluate(el=>el.parentElement.style.top),'35%','preserve previously positioned text');
 await page.locator('.storybook-page-rail>button').nth(2).click();
 assert.equal(await text().evaluate(el=>el.parentElement.style.top),'43%','author template keeps its layout');
 await page.getByRole('button',{name:/쪽 추가/}).click();await btn('이야기 칸 추가').click();
 assert.equal(await page.locator('.storybook-stage:not(.preview) .text').last().evaluate(el=>el.style.top),`${STORYBOOK_TEXT_BOX.y*100}%`,'new text starts at the top');
 await saved();
 assert.deepEqual(errors,[]);
 console.log('PASS fixed text top during height changes and reload; legacy text/template geometry preserved; new text anchored at top');
}finally{await browser.close();await server.dispose();}

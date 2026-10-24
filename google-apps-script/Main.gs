/* Set SPREADSHEET_ID in Project Settings > Script properties. Keep the sheet private. */
function doPost(e) {
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    if (!e || !e.postData || e.postData.contents.length > 180000) throw new Error('Invalid request');
    var p = JSON.parse(e.postData.contents);
    validatePayload(p);
    locked = lock.tryLock(25000);
    if (!locked) throw new Error('Busy; retry');
    var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!id) throw new Error('Missing spreadsheet configuration');
    var book = SpreadsheetApp.openById(id);
    var sheet = book.getSheetByName('Responses') || book.insertSheet('Responses');
    var columns = ['شناسه پاسخ', 'زمان ثبت سرور', 'نسخه', 'بدون چالش در موضوعات'];
    SECTIONS.forEach(function(s) {s.questions.forEach(function(q) {
      if (q.type === 'topics') return;
      columns.push(q.title);
      if (q.follow) columns.push(q.follow.label);
    });});
    TOPICS.forEach(function(g) {columns.push(g.title + ' | موضوع‌ها و کدها', g.title + ' | توضیحات');});
    if (!sheet.getLastRow()) {sheet.appendRow(columns);sheet.setFrozenRows(1);sheet.setRightToLeft(true);}
    var existingHeaders=sheet.getRange(1,1,1,columns.length).getValues()[0];
    if (JSON.stringify(existingHeaders)!==JSON.stringify(columns)) throw new Error('Sheet schema mismatch');
    if (sheet.getLastRow()>1) {
      var found=sheet.getRange(2,1,sheet.getLastRow()-1,1).createTextFinder(p.id).matchEntireCell(true).findNext();
      if(found) return reply({ok:true,id:p.id,duplicate:true});
    }
    var row=[p.id,new Date(),p.version,p.none?'بله':'خیر'];
    SECTIONS.forEach(function(s) {s.questions.forEach(function(q) {
      if(q.type==='topics')return;
      row.push(safeCell(q.options?q.options[p.answers[q.id]]:(p.answers[q.id]||'')));
      if(q.follow) row.push(safeCell(q.follow.when.indexOf(p.answers[q.id])>=0?p.answers[q.id+'_detail']:''));
    });});
    TOPICS.forEach(function(g) {
      var chosen=g.topics.filter(function(t){return p.topics.indexOf(t.id)>=0;});
      row.push(safeCell(chosen.map(function(t){return t.id+' — '+t.title;}).join('\n')),safeCell(chosen.length?p.notes[g.id]:''));
    });
    sheet.appendRow(row);
    SpreadsheetApp.flush();
    return reply({ok:true,id:p.id});
  } catch (err) {
    console.error(String(err));
    return reply({ok:false,error:'Submission could not be confirmed. Check configuration or retry.'});
  } finally {if(locked)lock.releaseLock();}
}
function reply(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
function safeCell(value){var s=String(value||'');return /^[\s]*[=+\-@]/.test(s)?"'"+s:s;}
function validatePayload(p){
  if(!p||p.version!==1||typeof p.id!=='string'||!/^[a-f0-9-]{36}$/i.test(p.id))throw new Error('Invalid ID');
  if(!p.answers||typeof p.answers!=='object'||Array.isArray(p.answers)||!p.notes||typeof p.notes!=='object'||Array.isArray(p.notes)||!Array.isArray(p.topics)||typeof p.none!=='boolean')throw new Error('Invalid structure');
  function text(v,required,max){if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw new Error('Invalid text');}
  SECTIONS.forEach(function(s){s.questions.forEach(function(q){
    if(q.type==='topics')return;
    var v=p.answers[q.id];
    if(q.type==='text')text(v,!q.optional,5000);
    else {
      if(!Number.isInteger(v)||v<0||v>=q.options.length)throw new Error('Invalid option');
      if(q.follow&&q.follow.when.indexOf(v)>=0)text(p.answers[q.id+'_detail'],true,q.follow.short?200:5000);
    }
  });});
  var allowed=TOPICS.reduce(function(a,g){return a.concat(g.topics.map(function(t){return t.id;}));},[]);
  if(p.topics.length>allowed.length||new Set(p.topics).size!==p.topics.length||p.topics.some(function(t){return allowed.indexOf(t)<0;}))throw new Error('Invalid topic');
  if((p.none&&p.topics.length)||(!p.none&&!p.topics.length))throw new Error('Topic selection required');
  TOPICS.forEach(function(g){if(g.topics.some(function(t){return p.topics.indexOf(t.id)>=0;}))text(p.notes[g.id],true,5000);});
}

const fs=require('fs'), path=require('path');
// Regenerate ANSWERS.md from the puzzle JSON:  node tools/make-answers.js
const ROOT=path.resolve(__dirname,'..');
const HM=require(ROOT+'/assets/acrostic.js');

const index=JSON.parse(fs.readFileSync(ROOT+'/puzzles/index.json'));
const order=index.puzzles.map(p=>p.slug);

const files=fs.readdirSync(ROOT+'/puzzles').filter(f=>f!=='index.json'&&f.endsWith('.json'));
// Follow index.json order, then anything not listed there.
const slugs=[...order.filter(s=>files.includes(s+'.json')),
             ...files.map(f=>f.replace('.json','')).filter(s=>!order.includes(s))];

const esc=(s)=>String(s).replace(/\|/g,'\\|');
const out=[];
const warn=[];

out.push('# Answer Key');
out.push('');
out.push('Backup reference for running the hunt. Generated from the puzzle JSON files.');
out.push('');
out.push(`_${slugs.length} puzzles · ${slugs.reduce((n,s)=>n+JSON.parse(fs.readFileSync(`${ROOT}/puzzles/${s}.json`)).items.length,0)} works_`);
out.push('');

// Summary table
out.push('## Clue words');
out.push('');
out.push('| Puzzle | Link | Works | Clue word |');
out.push('|---|---|---|---|');
slugs.forEach(s=>{
  const d=JSON.parse(fs.readFileSync(`${ROOT}/puzzles/${s}.json`));
  out.push(`| ${esc(d.title||s)} | \`?p=${s}\` | ${d.items.length} | **${HM.normalize(d.clue)}** |`);
});
out.push('');

const phrase=slugs.map(s=>HM.normalize(JSON.parse(fs.readFileSync(`${ROOT}/puzzles/${s}.json`)).clue)).join(' ');
out.push(`Combined, in the order above: **${phrase}**`);
out.push('');
out.push('The teams have to work out the order themselves. Arranged correctly the clue');
out.push('words read:');
out.push('');
out.push('> **GIFT SHOP · I WON ART WORD**');
out.push('');
out.push('Passphrase for the gift shop clerk: _"I won art word"_.');
out.push('');
out.push('---');
out.push('');

slugs.forEach(s=>{
  const d=JSON.parse(fs.readFileSync(`${ROOT}/puzzles/${s}.json`));
  const clue=HM.normalize(d.clue);
  const laid=HM.layout(d);

  out.push(`## ${d.title||s}`);
  out.push('');
  out.push(`**Link:** \`?p=${s}\` · **Clue word:** **${clue}**`);
  out.push('');
  out.push('| # | Asked for | Answer | Clue letter | Hint | Image |');
  out.push('|---|---|---|---|---|---|');

  d.items.forEach((it,i)=>{
    const norm=HM.normalize(it.answer);
    const row=laid.rows[i];
    const letter=clue[i]||'?';
    const pos=row?row.clueIndex:-1;
    if(pos<0) warn.push(`${s} row ${i+1}: "${norm}" does not contain clue letter ${letter}`);
    // Mark which letter of the answer lands in the clue column.
    const marked=pos>=0 ? norm.slice(0,pos)+`**${norm[pos]}**`+norm.slice(pos+1) : norm;
    out.push(`| ${i+1} | ${esc(HM.promptFor(it))} | **${esc(it.answer)}** | ${letter} (pos ${pos+1}) | ${esc(it.hint||'—')} | \`${path.basename(it.image||'')}\` |`);
    void marked;
  });
  out.push('');

  // Show the solved grid exactly as players see it.
  out.push('Solved grid:');
  out.push('');
  out.push('```');
  laid.rows.forEach((r)=>{
    out.push(' '.repeat(r.offset*2)+r.answer.split('').join(' '));
  });
  const reads=laid.rows.map(r=>r.answer[r.clueIndex]).join('');
  out.push('');
  out.push(`reads: ${reads}${reads===clue?'':'  <-- MISMATCH'}`);
  out.push('```');
  out.push('');
  if(reads!==clue) warn.push(`${s}: grid reads "${reads}" but clue is "${clue}"`);
});

fs.writeFileSync(ROOT+'/ANSWERS.md', out.join('\n')+'\n');
console.log('wrote ANSWERS.md');
console.log('warnings:', warn.length?warn:'none');

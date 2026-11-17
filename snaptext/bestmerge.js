// BestMerge - fase 2: allineamento e correzioni prudenti tracciabili.
// Le righe non abbinate restano intatte; nessun modello AI.
function normalize(value) {
  return String(value).toLocaleLowerCase('und').normalize('NFKC')
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
function dice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = value => {
    const s = ` ${value} `, map = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      map.set(g, (map.get(g) || 0) + 1);
    }
    return map;
  };
  const x = grams(a), y = grams(b);
  let common = 0, sx = 0, sy = 0;
  for (const count of x.values()) sx += count;
  for (const count of y.values()) sy += count;
  for (const [g, count] of x) common += Math.min(count, y.get(g) || 0);
  return 2 * common / (sx + sy);
}
function comparisonText(value) {
  // Togliamo SOLO ai fini del confronto simboli isolati ai bordi.
  // Le righe in uscita conservano la stringa originale immutata.
  return normalize(value).replace(/^(?:[a-z] ){1,2}(?=[\p{L}\p{N}]{4,})/u, '');
}
function lineScore(a, b) {
  const x = comparisonText(a), y = comparisonText(b);
  if (!x || !y) return 0;
  if (Math.min(x.length, y.length) < 8) return x === y ? 1 : 0;
  const similarity = dice(x, y);
  const ratio = Math.min(x.length, y.length) / Math.max(x.length, y.length);
  return similarity >= 0.56 && ratio >= 0.48 ? similarity : 0;
}
function suspectFragment(raw) {
  const s = String(raw).trim();
  // Solo indizio: caratteri isolati o puri separatori; non equivale a errore certo.
  return Boolean(s) && (normalize(s).length <= 2 || /^[|\]![{};:'"\s]+$/.test(s));
}
export function alignLines(tesseractText, paddleText) {
  const tLines = String(tesseractText).replace(/\r\n?/g, '\n').split('\n');
  const pLines = String(paddleText).replace(/\r\n?/g, '\n').split('\n');
  const a = tLines.map((text, index) => ({ text, index })).filter(l => normalize(l.text));
  const b = pLines.map((text, index) => ({ text, index })).filter(l => normalize(l.text));
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    const sim = lineScore(a[i].text, b[j].text);
    dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1], sim ? sim + dp[i + 1][j + 1] : 0);
  }
  const matchedT = new Map(), matchedP = new Set();
  let i = 0, j = 0;
  while (i < n && j < m) {
    const sim = lineScore(a[i].text, b[j].text);
    if (sim && sim + dp[i + 1][j + 1] >= dp[i][j] - 1e-8) {
      matchedT.set(a[i].index, { paddleIndex: b[j].index, similarity: sim });
      matchedP.add(b[j].index);
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const lines = tLines.map((text, index) => {
    const blank = !String(text).trim();
    const matched = matchedT.get(index);
    const status = blank ? 'blank' : matched ? 'matched' : suspectFragment(text) ? 'suspect' : 'unmatched';
    return { text, index, status, paddleIndex: matched?.paddleIndex ?? null };
  });
  const unmatchedPaddle = b.filter(line => !matchedP.has(line.index));
  return {
    lines, unmatchedPaddle,
    matchedCount: matchedT.size,
    unmatchedTesseractCount: lines.filter(x=>x.status==='unmatched').length,
    suspectCount: lines.filter(x=>x.status==='suspect').length,
    unmatchedPaddleCount: unmatchedPaddle.length,
    text: tLines.join('\n')
  };
}

// Fase 2: piccoli interventi verificabili sui segmenti di righe già allineate.
// Nessun dizionario/AI. Si corregge solo se le parole di contesto coincidono.
const wordParts = s => Array.from(String(s).matchAll(/\p{L}[\p{L}\p{M}\p{N}'’\-]*|\p{N}+|[^\p{L}\p{N}]+/gu), m => ({text:m[0],start:m.index,end:m.index+m[0].length,word:/^[\p{L}\p{N}]/u.test(m[0])}));
const words = s => wordParts(s).filter(x=>x.word);
const canonical = s => String(s).normalize('NFKC').toLocaleLowerCase('und').replace(/[’‘]/g,"'");
function oneEdit(a,b) {
  a=canonical(a);b=canonical(b);
  if (Math.abs(a.length-b.length)>1 || Math.min(a.length,b.length)<5 || a===b) return false;
  let i=0,j=0,errors=0;
  while(i<a.length&&j<b.length) {
    if(a[i]===b[j]){i++;j++;continue;}
    if(++errors>1)return false;
    if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++;}
  }
  return errors+(a.length-i)+(b.length-j)===1;
}
function commonAnchors(t,p) {
  const a=words(t),b=words(p),n=a.length,m=b.length;
  const dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)
    dp[i][j]=canonical(a[i].text)===canonical(b[j].text)?1+dp[i+1][j+1]:Math.max(dp[i+1][j],dp[i][j+1]);
  const anchors=[];let i=0,j=0;
  while(i<n&&j<m){if(canonical(a[i].text)===canonical(b[j].text)){anchors.push({ti:i,pj:j});i++;j++;}
    else if(dp[i+1][j]>=dp[i][j+1])i++;else j++;}
  return {a,b,anchors};
}
// Confronto dei token in eccesso tra parole identiche: non usa dizionari né AI.
// Eliminazioni solo quando l’intera sequenza di parole di PaddleOCR e’ presente
// in Tesseract; i casi ambigui restano segnalati.
function extraTokenCandidates(t, p) {
  const {a, b, anchors} = commonAnchors(t, p);
  const edits = [], suggestions = [];
  if (anchors.length < 2) return {edits, suggestions};

  // Un token assente da PaddleOCR NON e' necessariamente un errore:
  // la cancellazione automatica e' autorizzata solo se TUTTE le parole
  // PaddleOCR esistono, nello stesso ordine, in Tesseract. Questo evita
  // di tagliare righe/parole quando il secondo OCR ha perso un passaggio.
  const completePaddle = anchors.length === b.length;
  const extraIndices = [];
  let cursor = 0;
  for (const anchor of anchors) {
    for (; cursor < anchor.ti; cursor++) extraIndices.push(cursor);
    cursor = anchor.ti + 1;
  }
  while (cursor < a.length) extraIndices.push(cursor++);

  // Evita il caso di testi troppo diversi o con poche parole di contesto.
  const comparable = completePaddle && b.length >= 4 &&
    extraIndices.length >= 1 && extraIndices.length <= 2 &&
    dice(comparisonText(t), comparisonText(p)) >= 0.77 &&
    anchors.length / a.length >= 0.75;
  const extraIndexSet = new Set(extraIndices);
  for (const index of extraIndices) {
    const token = a[index];
    if (!/^\p{L}{1,2}$/u.test(token.text)) continue;
    let start = token.start, end = token.end;
    const before = index ? a[index-1] : null;
    const after = index < a.length - 1 ? a[index+1] : null;
    // Cancellare unicamente il token e uno spazio: non toccare
    // apostrofi, trattini, virgole o altre parti del testo originale.
    if (index === 0 && after && /^\s+$/u.test(t.slice(token.end,after.start))) {
      end = after.start;
    } else if (before && /\s+$/u.test(t.slice(before.end,token.start))) {
      const whitespace = t.slice(before.end,token.start).match(/\s+$/u)[0];
      start = token.start - whitespace.length;
    } else if (after && /^\s+$/u.test(t.slice(token.end,after.start))) {
      end = after.start;
    } else {
      suggestions.push({token:token.text,reason:'Spaziatura/punteggiatura ambigua: verifica manuale'});
      continue;
    }
    const candidate = {start,end,from:t.slice(start,end),to:'',token:token.text,
      reason:'Token in eccesso: tutte le altre parole coincidono, nello stesso ordine, con PaddleOCR'};
    const noAdjacentExtras = !extraIndexSet.has(index-1) && !extraIndexSet.has(index+1);
    // Anche articoli e preposizioni sono eliminabili, ma solo se l'intera
    // riga e' confermata dal secondo motore senza omissioni e con tante ancore.
    if (comparable && noAdjacentExtras && (token.text.length === 1 || b.length >= 7)) {
      edits.push(candidate);
    } else {
      suggestions.push({...candidate,reason:'Confronto non abbastanza sicuro: verifica manuale'});
    }
  }
  return {edits,suggestions};
}
// La singola "j" è un artefatto già verificato nel test: cancellarla soltanto
// se PaddleOCR conferma la riga restante esattamente, con almeno due parole.
function strayOpeningJ(t,p) {
  const match = t.match(/^(\s*)(j)(\s+)(.+)$/u);
  if (!match || words(match[4]).length < 2) return null;
  if (canonical(match[4].trim()) !== canonical(p.trim())) return null;
  const start = match[1].length;
  return {start,end:start+match[2].length+match[3].length,from:t.slice(start,start+match[2].length+match[3].length),to:'',
    reason:'Carattere j iniziale assente in PaddleOCR; testo restante identico'};
}
// Ricomposizione cauta senza dipendere dalla corrispondenza 1:1 delle righe.
// Per intervenire occorrono due prove indipendenti: spezzatura in Tesseract e
// identica parola (intera o spezzata) in un piccolo intorno di PaddleOCR.
// I paragrafi vuoti e le righe senza una prova univoca NON vengono uniti.
function hyphenationCandidate(left, right, paddleLines, leftPIndex, rightPIndex) {
  const end = String(left).match(/([\p{L}\p{M}]{2,})-\s*(?:(?:[|\]\[{}]|i)\s*)?$/u);
  const start = String(right).match(/^\s*([\p{Ll}\p{M}]{2,})(?=$|[^\p{L}\p{M}])/u);
  if (!end || !start || !/^\p{Ll}/u.test(end[1])) return null;
  const stem = canonical(end[1]), suffix = canonical(start[1]);
  const whole = stem + suffix;
  if (whole.length < 5 || /[0-9]/u.test(whole)) return null;
  // Servono riferimenti di allineamento almeno in una delle due righe.
  // Nessuna ricerca globale: evitiamo di collegare parole ripetute lontane.
  const anchors = [leftPIndex, rightPIndex].filter(Number.isInteger);
  if (!anchors.length) return null;
  if (anchors.length === 2 && (rightPIndex <= leftPIndex || rightPIndex - leftPIndex > 3)) return null;
  const lo = Math.max(0, Math.min(...anchors) - 2);
  const hi = Math.min(paddleLines.length, Math.max(...anchors) + 4);
  const paddleSlice = paddleLines.slice(lo, hi);
  // Verifica ESATTA delle due porzioni su righe adiacenti Paddle, anche se
  // l'allineatore non ha collegato le due righe Tesseract agli stessi indici.
  let evidence = false;
  for (let i = 0; i < paddleSlice.length - 1; i++) {
    const pEnd = paddleSlice[i].match(/([\p{L}\p{M}]{2,})-\s*$/u);
    const pStart = paddleSlice[i + 1].match(/^\s*([\p{Ll}\p{M}]{2,})(?=$|[^\p{L}\p{M}])/u);
    if (pEnd && pStart && canonical(pEnd[1]) === stem && canonical(pStart[1]) === suffix) {
      evidence = true; break;
    }
  }
  // In alternativa Paddle ha già ricomposto la stessa parola intera.
  if (!evidence) evidence = paddleSlice.some(line =>
    words(line).some(w => canonical(w.text) === whole));
  if (!evidence) return null;
  // Evita una corrispondenza isolata e casuale: almeno una riga lunga deve
  // risultare allineata al relativo testo Paddle con somiglianza affidabile.
  const supported = (Number.isInteger(leftPIndex) &&
    lineScore(left, paddleLines[leftPIndex]) >= 0.7) ||
    (Number.isInteger(rightPIndex) &&
    lineScore(right, paddleLines[rightPIndex]) >= 0.7);
  if (!supported) return null;
  // Siamo a fine riga: il trattino si elimina e la riga successiva si accoda.
  // Se dopo '-' c'era un simbolo OCR isolato, lo trattiamo solo quando
  // la stessa prova Paddle conferma la ricomposizione.
  const offset = left.length - end[0].length + end[1].length;
  return {
    start: offset, end: left.length, from: left.slice(offset), to: '',
    reason: `Parola confermata dall'altro OCR: ${end[1]}-${start[1]} → ${end[1]}${start[1]}`,
    joinNext: true
  };
}
function variantCandidates(t,p) {
  // Confronto solo fra due parole-ancora uguali: nessuna ricostruzione libera.
  const {a,b,anchors}=commonAnchors(t,p);
  const edits=[],suggestions=[];
  for(let z=0;z<anchors.length-1;z++) {
    const left=anchors[z],right=anchors[z+1];
    const ta=a.slice(left.ti+1,right.ti), pb=b.slice(left.pj+1,right.pj);
    if(ta.length!==1 || pb.length!==1)continue;
    const from=ta[0].text,to=pb[0].text;
    if(canonical(from)===canonical(to))continue;
    const similar=oneEdit(from,to) || dice(canonical(from),canonical(to))>=0.72;
    if(!similar)continue;
    const edit={start:ta[0].start,end:ta[0].end,from,to,
      token:from,reason:'Parole diverse fra due ancore comuni: verifica sulla fotografia'};
    // Correzione automatica SOLO per un carattere OCR non alfabetico
    // confuso in mezzo a lettere: il secondo OCR deve confermare
    // esattamente la parola dopo la sostituzione 0→o oppure 1→l/i.
    const hasGlyph=/^\p{L}+[01]\p{L}+$/u.test(from);
    const glyphMatches=hasGlyph && [from.replace(/0/g,'o').replace(/1/g,'l'),
      from.replace(/0/g,'o').replace(/1/g,'i')].some(x=>canonical(x)===canonical(to));
    if(glyphMatches && /^\p{L}{4,}$/u.test(to)) {
      edits.push({...edit,reason:'Carattere 0/1 all’interno di parola, confermato dal secondo OCR fra ancore uguali'});
    } else suggestions.push(edit);
  }
  return {edits,suggestions};
}
function correctionCandidates(t,p) {
  const edits=[];
  const variants=variantCandidates(t,p);
  edits.push(...variants.edits);
  // Segni chiaramente estranei a fine riga, se il resto è uguale al secondo OCR.
  // NON rimuove lettere singole, che possono avere significato reale.
  const trailing=t.match(/\s*([|\]\[{}])\s*$/u);
  if(trailing && canonical(t.slice(0,trailing.index).trim())===canonical(p.trim()))
    edits.push({start:trailing.index,end:t.length,from:t.slice(trailing.index),to:'',reason:'Simbolo estraneo a fine riga, assente in PaddleOCR'});
  const opening = strayOpeningJ(t,p);
  if (opening) edits.push(opening);
  const extras=extraTokenCandidates(t,p);
  edits.push(...extras.edits);
  const accepted=[];
  for(const edit of edits.sort((x,y)=>x.start-y.start)) {
    if(accepted.length && edit.start<accepted[accepted.length-1].end)continue;
    accepted.push(edit);
  }
  return {edits:accepted,suggestions:extras.suggestions,variants:variants.suggestions};
}
export function mergeWords(tesseractText,paddleText){
  const aligned=alignLines(tesseractText,paddleText);
  const paddleLines=String(paddleText).replace(/\r\n?/g,'\n').split('\n');
  let changes=0, unresolved=0, suggestionCount=0, joinedWords=0;
  // Prima le correzioni locali, senza modificare i risultati dei motori.
  const prepared=aligned.lines.map(line=>{
    if(line.status!=='matched')return {...line,edits:[],suggestions:[],variants:[]};
    const paddle=paddleLines[line.paddleIndex];
    const {edits,suggestions,variants}=correctionCandidates(line.text,paddle);
    suggestionCount+=suggestions.length;
    return {...line,edits,suggestions,variants,paddle};
  });
  // La de-sillabazione usa anche la riga SUCCESSIVA. Non applicarla a
  // righe mancanti/riordinate in PaddleOCR, né oltre un paragrafo vuoto.
  for (let i=0;i<prepared.length-1;i++) {
    const current=prepared[i], next=prepared[i+1];
    if (!current.text.trim() || !next.text.trim()) continue;
    if (next.index !== current.index + 1) continue;
    const candidate = hyphenationCandidate(current.text, next.text, paddleLines,
      current.paddleIndex, next.paddleIndex);
    if (!candidate)continue;
    const overlapping = current.edits.filter(e => candidate.start < e.end && e.start < candidate.end);
    // Le correzioni già previste nello stesso suffisso (es. "- |") sono
    // assorbite dalla ricomposizione, NON devono bloccarla.
    if (overlapping.some(e => e.start < candidate.start || e.end > candidate.end)) continue;
    current.edits = current.edits.filter(e => !overlapping.includes(e));
    current.edits.push(candidate);
    current.joinNext=true;
    next.joinedFromPrevious=true;
    joinedWords++;
  }
  const lines=prepared.map(line=>{
    const segments=[];let at=0;
    for(const edit of [...line.edits].sort((a,b)=>a.start-b.start)){
      if(edit.start<at)continue;
      if(edit.start>at)segments.push({text:line.text.slice(at,edit.start),changed:false});
      segments.push({text:edit.to,changed:true,from:edit.from,reason:edit.reason,paddle:line.paddle});
      at=edit.end;changes++;
    }
    if(at<line.text.length)segments.push({text:line.text.slice(at),changed:false});
    if(!segments.length)segments.push({text:'',changed:false});
    const reconstructed=segments.map(s=>s.text).join('');
    if(line.status==='matched' && canonical(reconstructed.replace(/[|\]\[{}]/g,'').replace(/[^\p{L}\p{N}]+/gu,' '))!==canonical(line.paddle.replace(/[^\p{L}\p{N}]+/gu,' ')))unresolved++;
    return {...line,segments};
  });
  const parts=[];
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    parts.push(line.segments.map(s=>s.text).join(''));
    if(i<lines.length-1 && !line.joinNext)parts.push('\n');
  }
  return {...aligned,lines,changes,joinedWords,suggestionCount,variantCount:lines.reduce((n,l)=>n+(l.variants||[]).length,0),unresolved,text:parts.join('')};
}

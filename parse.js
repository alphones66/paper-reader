// 把貼上的考卷文字整理成題目。格式很寬鬆：題號、選項、答案、解析可以在題目裡面，也可以集中放在最後面。
// 只把會影響判斷的全形字母、數字和幾個符號換成半形；題目內容的標點保持原樣
const FW = s => s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/（/g, '(').replace(/）/g, ')').replace(/．/g, '.').replace(/：/g, ':').replace(/　/g, ' ');
const CIRC = { '①': 'A', '②': 'B', '③': 'C', '④': 'D', '⑤': 'E' };
const TF = { 'O': 'O', '○': 'O', '◯': 'O', '對': 'O', '是': 'O', 'T': 'O', 'TRUE': 'O', '✓': 'O', 'X': 'X', '×': 'X', '✗': 'X', '錯': 'X', '否': 'X', 'F': 'X', 'FALSE': 'X', '不對': 'X', '不是': 'X' };
const RE_Q = /^\s*(?:第\s*)?(\d{1,3})\s*(?:題|[.、)\]]|\s)\s*(.*)$/;
const RE_Q2 = /^\s*\((\d{1,3})\)\s*(.*)$/;
const RE_OPT = /^\s*\(?([A-Ea-e])[).、]\s*(.*)$/;
const RE_OPTC = /^\s*([①②③④⑤])\s*(.*)$/;
const RE_ANS = /^\s*(答案|解答|正解|標準答案|Ans(?:wer)?)\s*[:：]?\s*(.*)$/i;
const RE_EXP = /^\s*(解析|詳解|說明|解說|解釋|講解)\s*[:：]?\s*(.*)$/;

function normAns(a) {
  a = String(a || '').trim().replace(/[()。.]/g, '').trim();
  if (!a) return '';
  if (CIRC[a[0]]) return a.split('').map(c => CIRC[c] || '').join('');
  const up = a.toUpperCase();
  if (TF[a] || TF[up]) return TF[a] || TF[up];
  if (/^[A-E]+$/.test(up)) return up;
  if (/^[1-5]$/.test(a)) return 'ABCDE'[+a - 1];
  return '';
}

function parsePaper(raw) {
  const lines = FW(String(raw || '')).split(/\r?\n/);
  const paper = { title: '', subject: '', audio: '', qs: [], warn: [] };
  let q = null, mode = '', globalExp = false, gcur;
  const keys = {}, exps = {};
  const push = () => { if (q) { q.q = q.q.trim(); q.exp = (q.exp || '').trim(); paper.qs.push(q); } q = null; };
  const addOpt = (k, t) => { if (!q) return; q.opts.push({ k: k.toUpperCase(), t: t.trim() }); mode = 'opt'; };
  const nonEmpty = lines.map(l => l.trim());
  const nextLine = i => { for (let j = i + 1; j < nonEmpty.length; j++) if (nonEmpty[j]) return nonEmpty[j]; return ''; };
  for (let li = 0; li < lines.length; li++) {
    const t = nonEmpty[li];
    if (!t) { continue; }
    let m;
    if ((m = t.match(/^#\s*(.+)$/)) || (m = t.match(/^(?:標題|考卷|試卷)\s*[:：]\s*(.+)$/))) { if (!paper.title) paper.title = m[1].trim(); continue; }
    if ((m = t.match(/^音檔\s*[:：]\s*(\S+)\s*$/))) { paper.audio = m[1]; continue; }   // 聽力考卷的音檔檔名
    if ((m = t.match(/^(?:科目|年級|範圍)\s*[:：]\s*(.+)$/))) { paper.subject = (paper.subject ? paper.subject + ' ' : '') + m[1].trim(); continue; }
    // 集中放在後面的答案：「答案：1.B 2.C 3.A」
    if ((m = t.match(RE_ANS))) {
      const rest = m[2];
      const pairs = [...rest.matchAll(/(\d{1,3})\s*[.、:)]?\s*([A-Ea-e①②③④⑤OX○×對錯是否]+)/g)];
      if (pairs.length >= 2 || (pairs.length === 1 && !q)) { pairs.forEach(p => { keys[+p[1]] = normAns(p[2]); }); mode = 'key'; continue; }
      if (!rest && /^\d{1,3}\s*[.、:)]?\s*[A-Ea-e①②③④⑤OX○×對錯是否]/.test(nextLine(li))) { mode = 'key'; continue; }
      if (q) { q.ans = normAns(rest); mode = 'ans'; continue; }
    }
    if ((m = t.match(RE_EXP))) {
      if (!m[2] && /^\d{1,3}\s*[.、:)]/.test(nextLine(li)) && (!q || Object.keys(keys).length || paper.qs.length > 0)) { push(); globalExp = true; mode = 'gexp'; gcur = undefined; continue; }
      if (q) { q.exp = m[2]; mode = 'exp'; continue; }
    }
    // 答案區：「1. B」「2. C」一行一題
    if (mode === 'key') {
      const prs = [...t.matchAll(/(\d{1,3})\s*[.、:)]?\s*([A-Ea-e①②③④⑤OX○×對錯是否]+)/g)];
      if (prs.length && prs.map(p => p[0]).join('').replace(/\s/g, '') === t.replace(/[\s,;、]/g, '')) { prs.forEach(p => { keys[+p[1]] = normAns(p[2]); }); continue; }
    }
    // 詳解區：「1. 因為……」
    if (globalExp && (m = t.match(/^(\d{1,3})\s*[.、:)]\s*(.*)$/))) { exps[+m[1]] = m[2]; mode = 'gexp'; globalExp = true; gcur = +m[1]; continue; }
    if (mode === 'gexp' && typeof gcur !== 'undefined') { exps[gcur] = (exps[gcur] ? exps[gcur] + ' ' : '') + t; continue; }
    // 一行放好幾個選項：「A.紅 B.黃 C.藍 D.綠」
    if (q && /^[①②③④⑤]/.test(t) && (t.match(/[①②③④⑤]/g) || []).length >= 2) { t.split(/(?=[①②③④⑤])/).map(x => x.trim()).filter(Boolean).forEach(p => addOpt(CIRC[p[0]], p.slice(1))); continue; }
    if (q && /^\(?A[).、]/i.test(t) && (t.match(/(?:^|\s)\(?[B-E][).、]/g) || []).length >= 1 && !/\n/.test(t)) {
      const parts = t.split(/(?=(?:^|\s)\(?[A-E][).、])/).map(x => x.trim()).filter(Boolean);
      if (parts.length >= 2) { parts.forEach(p => { const mm = p.match(RE_OPT); if (mm) addOpt(mm[1], mm[2]); }); continue; }
    }
    if (q && (m = t.match(RE_OPT))) { addOpt(m[1], m[2]); continue; }
    if (q && (m = t.match(RE_OPTC))) { addOpt(CIRC[m[1]], m[2]); continue; }
    if ((m = t.match(RE_Q2)) || (m = t.match(RE_Q))) {
      // 「(1)」開頭是題號；答案括號在題目裡的情況不處理
      push(); q = { n: +m[1], q: m[2], opts: [], ans: '', exp: '' }; mode = 'q'; globalExp = false; gcur = undefined; continue;
    }
    // 其他：接在目前的段落後面
    if (q) {
      if (mode === 'exp') q.exp += ' ' + t;
      else if (mode === 'opt' && q.opts.length) q.opts[q.opts.length - 1].t += ' ' + t;
      else q.q += ' ' + t;
    } else if (!paper.title) paper.title = t;
  }
  push();
  paper.qs.forEach(x => {
    x.listen = /^【聽力/.test(x.q);   // 聽力題：要先聽音檔，題目文字不顯示
    if (keys[x.n] && !x.ans) x.ans = keys[x.n];
    if (exps[x.n] && !x.exp) x.exp = exps[x.n];
    if (x.q.match(/[(（]\s*[)）]/) === null) x.q = x.q;
    if (!x.opts.length && (x.ans === 'O' || x.ans === 'X' || !x.ans)) { x.type = 'tf'; x.opts = [{ k: 'O', t: '對' }, { k: 'X', t: '錯' }]; }
    else x.type = 'mc';
    if (x.ans && !x.opts.some(o => x.ans.includes(o.k))) { paper.warn.push(`第 ${x.n} 題的答案「${x.ans}」不在選項裡`); }
    if (!x.ans) paper.warn.push(`第 ${x.n} 題沒有答案`);
    if (x.opts.length < 2) paper.warn.push(`第 ${x.n} 題選項不夠`);
  });
  if (!paper.title) paper.title = '我的考卷';
  return paper;
}
if (typeof module !== 'undefined') module.exports = { parsePaper };

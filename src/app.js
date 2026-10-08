/* 算得清 v1.1 — local-only browser ledger. No servers or external dependencies. */
(function () {
  'use strict';

  const KEY = 'resale-ledger-v1'; // Keep the original key so existing local records remain readable.
  const L = window.LedgerLogic;
  const $ = (s) => document.querySelector(s);
  const cash = (cents) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const html = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const uid = () => (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : 'r-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  const today = () => {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
  };
  const empty = () => ({products: [], transactions: [], expenses: []});
  let db = empty();
  let currentPage = 'overview';
  let formType = '';
  let loadWarning = '';

  function validate(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.products) || !Array.isArray(raw.transactions)) {
      throw Error('备份格式不正确');
    }
    const copy = {products: raw.products, transactions: raw.transactions, expenses: raw.expenses || []};
    if (!Array.isArray(copy.expenses) || copy.products.length > 10000 || copy.transactions.length > 100000 || copy.expenses.length > 100000) {
      throw Error('备份格式或数据量不正确');
    }
    const pids = new Set(), ids = new Set();
    for (const p of copy.products) {
      if (!p || typeof p.id !== 'string' || !p.id || typeof p.name !== 'string' || !p.name.trim() || typeof p.sku !== 'string' || pids.has(p.id)) throw Error('商品数据不正确');
      pids.add(p.id);
    }
    for (const t of copy.transactions) {
      if (!t || typeof t.id !== 'string' || !t.id || ids.has(t.id) || !['purchase','sale'].includes(t.type) ||
          typeof t.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) throw Error('交易数据不正确');
      ids.add(t.id);
    }
    for (const e of copy.expenses) {
      if (!e || typeof e.id !== 'string' || !e.id || ids.has(e.id) || typeof e.name !== 'string' || !e.name.trim() ||
          typeof e.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw Error('支出数据不正确');
      ids.add(e.id);
    }
    L.calculate(copy); // Includes FIFO inventory and money validation.
    return copy;
  }

  try {
    const saved = localStorage.getItem(KEY);
    if (saved) db = validate(JSON.parse(saved));
  } catch (e) {
    loadWarning = '旧数据读取失败，请先导出原文件或使用备份恢复，避免覆盖。';
    console.error(e);
  }

  const names = () => Object.fromEntries(db.products.map(p => [p.id, p]));
  const nameOf = (id) => names()[id]?.name || '未知商品';
  const summary = () => L.calculate(db);
  function notify(message, error) {
    const el = $('#toast');
    el.textContent = message;
    el.className = 'toast show' + (error ? ' error' : '');
    clearTimeout(notify.timeout);
    notify.timeout = setTimeout(() => { el.className = 'toast'; }, 3300);
  }
  function persist(next) {
    const safe = validate(next);
    localStorage.setItem(KEY, JSON.stringify(safe));
    db = safe;
    loadWarning = '';
    render();
  }
  function action(label, cmd, extra) {
    return '<button class="btn ' + (extra || 'btn-primary') + '" type="button" data-action="' + cmd + '">' + label + '</button>';
  }
  function section(title, subtitle, right) {
    return '<div class="page-heading"><div><span class="eyebrow">个人生意账本 · USD</span><h1>' + title + '</h1><p>' + subtitle + '</p></div><div class="heading-actions">' + (right || '') + '</div></div>';
  }
  function stat(label, value, hint, kind, symbol) {
    return '<article class="stat-card ' + (kind || '') + '"><div class="stat-top"><span>' + label + '</span><span class="stat-icon" aria-hidden="true">' + symbol + '</span></div><strong>' + value + '</strong><small>' + hint + '</small></article>';
  }
  function table(head, rows, emptyMsg) {
    if (!rows.length) return '<div class="empty-state">' + (emptyMsg || '暂时没有记录') + '</div>';
    return '<div class="table-scroller"><table><thead><tr>' + head.map(t => '<th>' + t + '</th>').join('') +
      '</tr></thead><tbody>' + rows.map(row => '<tr>' + row.map(t => '<td>' + t + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  }
  function tag(type) {
    return '<span class="type-tag ' + type + '">' + (type === 'purchase' ? '进货' : type === 'sale' ? '销售' : '支出') + '</span>';
  }
  function entries(m) {
    const all = db.transactions.map((t, i) => ({
      id: t.id, type: t.type, name: nameOf(t.productId), date: t.date, quantity: t.quantity,
      total: t.type === 'purchase' ? (L.money(t.unitCost) * t.quantity + L.money(t.freight || 0)) :
        (L.money(t.unitPrice) * t.quantity), seq: i
    }));
    db.expenses.forEach((e, i) => all.push({
      id: e.id, type: 'expense', name: e.name, date: e.date, quantity: '—', total: L.money(e.amount),
      seq: db.transactions.length + i
    }));
    return all.sort((a, b) => b.date.localeCompare(a.date) || b.seq - a.seq);
  }

  function overview(m) {
    const totalPurchases = m.purchaseOutflow;
    const gap = m.cashDifference;
    const gotData = db.transactions.length > 0 || db.expenses.length > 0;
    const isRecovered = totalPurchases > 0 && gap >= 0;
    const status = !gotData ? '从第一笔进货开始' : isRecovered ? '进货本金已经收回' : gap < 0 ? '还有一部分投入未收回' : '现金收支已打平';
    let content = section('我的生意账本', '不用懂会计，也能知道自己花了多少、卖了多少、赚了多少。');
    if (loadWarning) content += '<div class="notice notice-danger">' + html(loadWarning) + '</div>';
    content += '<section class="balance-hero"><div class="hero-copy"><span class="hero-kicker">现金回收情况</span><h2>' + status + '</h2><p>销售收款 − 全部进货款 − 销售手续费与运费 − 其他支出</p><div class="balance-number ' + (gap < 0 ? 'negative' : '') + '">' +
      (gap > 0 ? '+' : '') + cash(gap) + '</div><div class="hero-caption">' + (gap >= 0 ? '目前现金回收差额为正；不代表全部库存已经卖完。' : '这是现金回收差额，不等于亏损。库存还有价值。') +
      '</div></div><div class="hero-mark" aria-hidden="true"><div class="orbit orbit-a"></div><div class="orbit orbit-b"></div><div class="orbit-center">$</div></div></section>';
    content += '<div class="stat-grid">' +
      stat('进货总投入', cash(m.purchaseOutflow), '买入所有商品的钱，含采购运费', '', '↙') +
      stat('销售收款', cash(m.revenue), '已记录销售的成交总金额', '', '↗') +
      stat('经营已实现利润', cash(m.profit), '扣售出成本、手续费、运费及其他支出', m.profit < 0 ? 'loss' : 'gain', '✦') +
      stat('还压在货里的钱', cash(m.inventory), '目前还剩 ' + m.quantity + ' 件商品', '', '▦') +
      '</div>';
    content += '<section class="panel quick-panel"><div class="panel-head"><div><h2>今天要记什么？</h2><p>点一个按钮，填几个数字就行。</p></div></div><div class="quick-grid">' +
      '<button type="button" class="quick-btn purchase" data-action="add-purchase"><span class="quick-icon">↙</span><strong>记进货</strong><small>买入商品、补库存</small></button>' +
      '<button type="button" class="quick-btn sale" data-action="add-sale"><span class="quick-icon">↗</span><strong>记销售</strong><small>卖出商品、自动算利润</small></button>' +
      '<button type="button" class="quick-btn expense" data-action="add-expense"><span class="quick-icon">−</span><strong>记支出</strong><small>包装费、交通费、广告费</small></button>' +
      '<button type="button" class="quick-btn product" data-action="add-product"><span class="quick-icon">＋</span><strong>添加商品</strong><small>第一次卖新品，先建档</small></button>' +
      '</div></section>';
    const latest = entries(m).slice(0, 6);
    content += '<div class="lower-grid"><section class="panel"><div class="panel-head"><div><h2>最近记账</h2><p>你的每一笔进货、销售和支出</p></div><button class="text-link" data-nav="ledger">查看全部 →</button></div>' +
      table(['日期','类型','内容','金额'], latest.map(e => [html(e.date), tag(e.type), html(e.name), '<strong>' + (e.type === 'sale' ? '+' : '−') + cash(e.total) + '</strong>']), '还没有交易。先添加商品，再记录进货。') +
      '</section><section class="panel note-panel"><div class="panel-head"><div><h2>这两个数字不一样</h2><p>看账时记住这一点就够了</p></div></div><div class="explainer"><span class="explainer-icon">①</span><div><strong>现金有没有回本？</strong><p>看最上面的现金回收差额：已经卖到手的钱，减去目前一共付出去的钱。</p></div></div><div class="explainer"><span class="explainer-icon">②</span><div><strong>实际卖货赚了多少？</strong><p>看「经营已实现利润」：只扣已经卖出的商品成本，再扣其他已记录费用。</p></div></div></section></div>';
    if (!gotData && !db.products.length) content += '<p class="demo-hint">只是想先试试看？ <button data-action="demo" class="text-link">载入演示数据</button></p>';
    return content;
  }

  function productsPage(m) {
    return section('我的商品', '商品有多少件、还占着多少本金，直接看这里。', action('＋ 添加商品','add-product') + action('↙ 记进货','add-purchase','btn-secondary')) +
      '<section class="panel">' + table(['商品','分类','剩余件数','库存成本','提醒',''], db.products.map(p => {
        const s = m.stats[p.id];
        return ['<strong>' + html(p.name) + '</strong><div class="table-muted">' + html(p.sku) + '</div>',
          html(p.category || '未分类'), s.quantity + ' 件', cash(s.value),
          s.quantity <= Number(p.threshold || 0) ? '<span class="low-stock">库存偏低</span>' : '<span class="stock-ok">正常</span>',
          '<button class="mini-button" data-delete-product="' + html(p.id) + '">删除</button>'];
      }), '你还没有添加商品。点「添加商品」开始。') + '</section>';
  }

  function ledgerPage(m) {
    return section('每一笔记录', '进货、卖货、额外开销，全部记在这里。', action('↙ 进货','add-purchase') + action('↗ 销售','add-sale','btn-secondary') + action('− 支出','add-expense','btn-secondary')) +
      '<section class="panel"><div class="panel-head"><div><h2>收支流水</h2><p>按记录日期排列</p></div><div class="heading-actions">' + action('导出 CSV','export-csv','btn-ghost') + action('导入备份','import-json','btn-ghost') + '</div></div>' +
      table(['日期','类型','内容','数量','金额','操作'], entries(m).map(e => [
        html(e.date), tag(e.type), html(e.name), html(e.quantity),
        '<strong class="' + (e.type !== 'sale' ? 'outgoing' : 'incoming') + '">' + (e.type === 'sale' ? '+' : '−') + cash(e.total) + '</strong>',
        '<button class="mini-button" data-delete-' + (e.type === 'expense' ? 'expense' : 'tx') + '="' + html(e.id) + '">删除</button>'
      ]), '还没有进货、销售或支出记录。') + '</section>';
  }

  function analyticsPage(m) {
    return section('利润怎么看', '把销售收入、商品成本、其他支出拆开看，避免算错。') +
      '<div class="stat-grid">' +
      stat('销售收入',cash(m.revenue),'全部售出的成交金额','','↗') +
      stat('售出商品的成本',cash(m.cost),'不是全部进货的钱','','▦') +
      stat('销售相关费用',cash(m.fees + m.shipping),'平台手续费和发货运费','','−') +
      stat('额外支出',cash(m.expenseTotal),'单独记录的包装、交通等','','−') +
      '</div><section class="panel breakdown-panel"><h2>利润是这样算出来的</h2>' +
      '<div class="breakdown-row"><span>销售收入</span><strong>' + cash(m.revenue) + '</strong></div>' +
      '<div class="breakdown-row"><span>− 已卖商品的进货成本（含分摊运费）</span><strong>−' + cash(m.cost) + '</strong></div>' +
      '<div class="breakdown-row"><span>− 销售手续费与发货运费</span><strong>−' + cash(m.fees + m.shipping) + '</strong></div>' +
      '<div class="breakdown-row"><span>− 其他经营支出</span><strong>−' + cash(m.expenseTotal) + '</strong></div>' +
      '<div class="breakdown-row breakdown-total"><span>经营已实现利润</span><strong>' + cash(m.profit) + '</strong></div>' +
      '<p class="fine-print">按 FIFO 先进先出计算售出成本。未记录的税费、退款、人工等不在统计里；负数也不一定代表所有库存卖完后会亏损。</p></section>' +
      '<section class="panel"><div class="panel-head"><h2>每种商品赚了多少</h2></div>' +
      table(['商品','已售件数','销售额','商品销售利润'],db.products.map(p => {
        const s = m.stats[p.id];
        return [html(p.name), s.sold + ' 件', cash(s.revenue), cash(s.profit)];
      }), '还没有商品数据。') +
      '<p class="fine-print">商品销售利润未分摊“额外支出”；扣掉这些费用后的总利润以上方数字为准。</p></section>';
  }

  function render() {
    let m;
    try { m = summary(); } catch(e) { $('#view').innerHTML = '<div class="notice notice-danger">' + html(e.message) + '</div>'; return; }
    const labels = {overview:'首页', products:'我的商品', ledger:'收支流水', analytics:'利润明细'};
    $('#crumb').textContent = labels[currentPage];
    document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === currentPage));
    $('#view').innerHTML = ({overview, products:productsPage, ledger:ledgerPage, analytics:analyticsPage})[currentPage](m);
  }

  function field(key, label, type, attrs, hint, wide) {
    return '<label class="field' + (wide ? ' wide' : '') + '"><span>' + label + '</span><input name="' + key +
      '" type="' + (type || 'text') + '" ' + (attrs || '') + ' required />' + (hint ? '<small>' + hint + '</small>' : '') + '</label>';
  }
  function selectProduct() {
    return '<label class="field wide"><span>哪件商品？</span><select name="productId" required>' +
      db.products.map(p => '<option value="' + html(p.id) + '">' + html(p.name) + '（' + html(p.sku) + '）</option>').join('') +
      '</select></label>';
  }
  function openForm(type) {
    if (type !== 'product' && type !== 'expense' && !db.products.length) {
      notify('先添加一件商品，再来记录进货或销售。',true);
      openForm('product');
      return;
    }
    formType = type;
    const titles = {product:'添加一种商品',purchase:'记一笔进货',sale:'记一笔销售',expense:'记一笔支出'};
    $('#dialogTitle').textContent = titles[type];
    $('#formError').hidden = true;
    let fields = '';
    if (type === 'product') fields =
      field('name','商品名称','text','maxlength="120" placeholder="例如 Chiikawa 挂件"','',true) +
      field('sku','商品编号 / SKU','text','maxlength="80" placeholder="例如 CHII-01"','便于区分不同款式') +
      field('category','分类','text','maxlength="80" value="其他"') +
      field('threshold','剩几件提醒我？','number','min="0" step="1" value="2"');
    if (type === 'purchase') fields =
      selectProduct() + field('quantity','买了几件？','number','min="1" step="1" value="1"') +
      field('unitCost','每件进货多少钱（$）','number','min="0" step="0.01" placeholder="4.81"') +
      field('freight','这一批总运费（$）','number','min="0" step="0.01" value="0"') +
      field('date','进货日期','date','value="' + today() + '"');
    if (type === 'sale') fields =
      selectProduct() + field('quantity','卖了几件？','number','min="1" step="1" value="1"') +
      field('unitPrice','每件卖了多少钱（$）','number','min="0" step="0.01" placeholder="15.00"') +
      field('fee','这单手续费（$）','number','min="0" step="0.01" value="0"') +
      field('shipping','这单发货运费（$）','number','min="0" step="0.01" value="0"') +
      field('channel','在哪里卖的？','text','maxlength="80" placeholder="线下 / 小红书 / eBay"') +
      field('date','销售日期','date','value="' + today() + '"');
    if (type === 'expense') fields =
      field('name','这笔钱花在哪里？','text','maxlength="120" placeholder="例如：买包装盒"','',true) +
      '<label class="field"><span>支出类型</span><select name="category"><option>包装材料</option><option>交通</option><option>广告推广</option><option>仓储</option><option>其他</option></select></label>' +
      field('amount','一共花了多少钱（$）','number','min="0" step="0.01" placeholder="5.00"') +
      field('date','支出日期','date','value="' + today() + '"') + '<div class="field wide"><small>已经填在进货或销售里的运费，不要在这里重复记账。</small></div>';
    $('#formFields').innerHTML = '<div class="form-grid">' + fields + '</div>';
    $('#entryDialog').showModal();
  }
  $('#entryForm').addEventListener('submit', e => {
    e.preventDefault();
    const o = Object.fromEntries(new FormData(e.target));
    const fail = $('#formError'); fail.hidden = true;
    try {
      const next = {...db, products:[...db.products], transactions:[...db.transactions], expenses:[...db.expenses]};
      const date = o.date || today();
      if (formType === 'product') {
        if (!o.name?.trim() || !o.sku?.trim()) throw Error('请填写商品名称和商品编号。');
        if (next.products.some(p => p.sku.toLowerCase() === o.sku.trim().toLowerCase())) throw Error('这个商品编号已经存在。');
        const threshold = Number(o.threshold);
        if (!Number.isSafeInteger(threshold) || threshold < 0) throw Error('库存提醒必须是非负整数。');
        next.products.push({id:uid(),name:o.name.trim(),sku:o.sku.trim(),category:(o.category||'其他').trim(),threshold});
      } else if (formType === 'expense') {
        L.money(o.amount);
        if (!o.name?.trim()) throw Error('请填写这笔钱花在哪里。');
        next.expenses.push({id:uid(),name:o.name.trim(),category:o.category||'其他',amount:o.amount,date});
      } else {
        const quantity = L.integer(o.quantity);
        if (formType === 'purchase') { L.money(o.unitCost); L.money(o.freight); }
        if (formType === 'sale') { L.money(o.unitPrice); L.money(o.fee); L.money(o.shipping); }
        const t = {...o,id:uid(),type:formType,quantity,date};
        next.transactions.push(t);
      }
      persist(next);
      $('#entryDialog').close(); notify('已记到账本里 ✓');
    } catch(error) {
      fail.textContent = error.message;
      fail.hidden = false;
    }
  });
  function download(filename, text, mimetype) {
    const u=URL.createObjectURL(new Blob([text],{type:mimetype}));
    const a=document.createElement('a');a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500);
  }
  function csvCell(value) {
    let s=String(value ?? '');
    if (/^\s*[=+@]/.test(s) || /^\s*-(?!\d)/.test(s)) s="'"+s;
    return '"' + s.replace(/"/g,'""') + '"';
  }
  function exportCsv() {
    const rows=[['日期','类型','商品或支出内容','数量','总金额(USD)'],...entries(summary()).map(e=>[e.date,e.type==='purchase'?'进货':e.type==='sale'?'销售':'支出',e.name,e.quantity,(e.total/100).toFixed(2)])];
    download('算得清-收支流水.csv','\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
  }
  function deleteItem(type,id) {
    if (!confirm('确定删除这条记录吗？删除后金额与库存都会重新计算。')) return;
    try {
      const next = {...db, products:[...db.products], transactions:[...db.transactions], expenses:[...db.expenses]};
      if (type === 'product') {
        if (next.transactions.some(t=>t.productId===id)) throw Error('这个商品有交易记录，需要先删除相关交易。');
        next.products=next.products.filter(p=>p.id!==id);
      } else if (type === 'expense') next.expenses=next.expenses.filter(e=>e.id!==id);
      else next.transactions=next.transactions.filter(t=>t.id!==id);
      persist(next); notify('已删除记录。');
    } catch(err) { notify('无法删除：'+err.message,true); }
  }
  function demo() {
    if (db.products.length || db.transactions.length || db.expenses.length) return notify('已有记录时不能载入演示数据。',true);
    const p=uid();
    persist({products:[{id:p,name:'示例：Chiikawa 挂件',sku:'DEMO-01',category:'挂件',threshold:3}],transactions:[
      {id:uid(),type:'purchase',productId:p,quantity:39,unitCost:'4.81',freight:'0',date:today()},
      {id:uid(),type:'sale',productId:p,quantity:14,unitPrice:'15.00',fee:'0',shipping:'0',channel:'线下',date:today()}
    ],expenses:[]});
    notify('演示账本已载入。');
  }
  document.addEventListener('click', e => {
    const nav=e.target.closest('[data-nav]');
    if (nav) { currentPage=nav.dataset.nav;render();return; }
    const a=e.target.closest('[data-action]');
    if (a) {
      const cmd=a.dataset.action;
      if (cmd==='add-product') openForm('product');
      if (cmd==='add-purchase') openForm('purchase');
      if (cmd==='add-sale') openForm('sale');
      if (cmd==='add-expense') openForm('expense');
      if (cmd==='close-dialog') $('#entryDialog').close();
      if (cmd==='export-json') { download('算得清-备份-'+today()+'.json',JSON.stringify(db,null,2),'application/json');notify('备份已下载，请妥善保存。'); }
      if (cmd==='import-json') $('#importInput').click();
      if (cmd==='export-csv') exportCsv();
      if (cmd==='demo') demo();
    }
    const tx=e.target.closest('[data-delete-tx]');
    if(tx) deleteItem('transaction',tx.dataset.deleteTx);
    const expense=e.target.closest('[data-delete-expense]');
    if(expense) deleteItem('expense',expense.dataset.deleteExpense);
    const product=e.target.closest('[data-delete-product]');
    if(product) deleteItem('product',product.dataset.deleteProduct);
  });
  $('#importInput').addEventListener('change', async e => {
    const file=e.target.files?.[0];if(!file)return;
    try {
      if (file.size > 15*1024*1024) throw Error('文件超过 15 MB。');
      const next=validate(JSON.parse(await file.text()));
      if (confirm('导入备份会覆盖当前账本，确定继续？建议先导出当前数据。')) {
        persist(next);notify('备份已恢复 ✓');
      }
    } catch(err) { notify('导入失败：'+err.message,true); }
    e.target.value='';
  });
  render();
})();
const test=require('node:test'),assert=require('node:assert/strict');const {calculate,money,integer}=require('../src/logic.js');const p={id:'p',name:'Shoe',sku:'S1'};const base={products:[p],transactions:[{id:'a',type:'purchase',productId:'p',quantity:2,unitCost:'100',freight:'2'},{id:'b',type:'purchase',productId:'p',quantity:2,unitCost:'140',freight:'0'},{id:'c',type:'sale',productId:'p',quantity:3,unitPrice:'200',fee:'12',shipping:'8'}]};
test('FIFO across lots',()=>{const r=calculate(base);assert.equal(r.revenue,60000);assert.equal(r.cost,34200);assert.equal(r.profit,23800);assert.equal(r.inventory,14000);assert.equal(r.quantity,1)});
test('empty ledger',()=>assert.equal(calculate({products:[],transactions:[]}).profit,0));
test('oversell is rejected',()=>assert.throws(()=>calculate({...base,transactions:[...base.transactions,{type:'sale',productId:'p',quantity:2,unitPrice:'1'}]}),/库存不足/));
test('missing product rejected',()=>assert.throws(()=>calculate({products:[],transactions:base.transactions}),/不存在/));
test('invalid currency precision',()=>assert.throws(()=>money(1.234),/两位/));
test('integer quantity required',()=>assert.throws(()=>integer(1.5),/整数/));
test('freight allocation',()=>{const r=calculate({products:[p],transactions:[{type:'purchase',productId:'p',quantity:3,unitCost:'0',freight:'0.01'},{type:'sale',productId:'p',quantity:1,unitPrice:'1'}]});assert.equal(r.cost,1);assert.equal(r.inventory,0)});
test('fees are deducted',()=>assert.equal(calculate(base).fees,1200));
test('shipping deducted',()=>assert.equal(calculate(base).shipping,800));

test('Chiikawa: cash recovery is distinct from realized profit',()=>{
 const db={products:[{id:'p',name:'Chiikawa',sku:'C1'}],transactions:[
 {id:'in',type:'purchase',productId:'p',quantity:39,unitCost:'4.81',freight:'0'},
 {id:'out',type:'sale',productId:'p',quantity:14,unitPrice:'15',fee:'0',shipping:'0'}
 ]};
 const result=calculate(db);
 assert.equal(result.purchaseOutflow,18759);
 assert.equal(result.revenue,21000);
 assert.equal(result.inventory,12025);
 assert.equal(result.cost,6734);
 assert.equal(result.profit,14266);
 assert.equal(result.cashDifference,2241);
});
test('separate business expenses reduce overall profit and cash gap',()=>{
 const db={...base,expenses:[{id:'e',name:'Packaging',amount:'5.00',date:'2026-10-08'}]};
 const a=calculate(base),b=calculate(db);
 assert.equal(b.expenseTotal,500);
 assert.equal(b.profit,a.profit-500);
 assert.equal(b.cashDifference,a.cashDifference-500);
 assert.equal(b.inventory,a.inventory);
 assert.equal(b.cost,a.cost);
});
test('old database without expenses remains supported',()=>assert.equal(calculate(base).expenseTotal,0));
test('invalid expenses are rejected',()=>assert.throws(()=>calculate({...base,expenses:[{id:'e',name:'Packaging',amount:'-1',date:'2026-10-08'}]}),/金额/));
test('cash gap includes full purchase cost and purchase freight',()=>{
 const db={products:[p],transactions:[
 {type:'purchase',productId:'p',quantity:2,unitCost:'100',freight:'2'},
 {type:'sale',productId:'p',quantity:1,unitPrice:'150',fee:'4',shipping:'6'}
 ]};
 const result=calculate(db);
 assert.equal(result.purchaseOutflow,20200);
 assert.equal(result.cashDifference,-6200);
 assert.equal(result.profit,3900);
});

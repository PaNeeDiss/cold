(function(root){'use strict';
const money=x=>{const n=Number(x);if(!Number.isFinite(n)||n<0||Math.round(n*100)!==n*100&&Math.abs(Math.round(n*100)-n*100)>1e-6)throw Error('金额必须为非负数，最多两位小数');return Math.round(n*100)};
const integer=x=>{const n=Number(x);if(!Number.isSafeInteger(n)||n<=0)throw Error('数量必须为正整数');return n};
function calculate(data){const products=data.products||[],tx=data.transactions||[];const stocks={},stats={},sales=[];for(const p of products){stocks[p.id]=[];stats[p.id]={quantity:0,value:0,revenue:0,profit:0,sold:0};}
let revenue=0,cost=0,fees=0,shipping=0,purchaseOutflow=0;for(const t of tx){if(!stocks[t.productId])throw Error('交易对应的商品不存在');const q=integer(t.quantity),s=stats[t.productId];
if(t.type==='purchase'){const cents=money(t.unitCost),freight=money(t.freight||0),base=Math.floor(freight/q),extra=freight%q;for(let i=0;i<q;i++)stocks[t.productId].push(cents+base+(i<extra?1:0));s.quantity+=q;purchaseOutflow+=cents*q+freight;}
else if(t.type==='sale'){if(stocks[t.productId].length<q)throw Error('库存不足，不能出售');const gross=money(t.unitPrice)*q,fee=money(t.fee||0),ship=money(t.shipping||0);let c=0;for(let i=0;i<q;i++)c+=stocks[t.productId].shift();const profit=gross-c-fee-ship;s.quantity-=q;s.sold+=q;s.revenue+=gross;s.profit+=profit;revenue+=gross;cost+=c;fees+=fee;shipping+=ship;sales.push({...t,revenue:gross,cost:c,profit});}else throw Error('未知交易类型');}
let expenseTotal=0;for(const e of data.expenses||[]){if(!e||typeof e.id!=='string'||typeof e.name!=='string'||!e.name.trim()||typeof e.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(e.date))throw Error('支出记录格式无效');expenseTotal+=money(e.amount)}
let inventory=0,quantity=0;for(const p of products){stats[p.id].value=stocks[p.id].reduce((a,b)=>a+b,0);inventory+=stats[p.id].value;quantity+=stats[p.id].quantity;}
return{revenue,cost,fees,shipping,purchaseOutflow,expenseTotal,cashDifference:revenue-purchaseOutflow-fees-shipping-expenseTotal,profit:revenue-cost-fees-shipping-expenseTotal,inventory,quantity,stats,sales};}
const api={calculate,money,integer};root.LedgerLogic=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);

/**
 * Local stand-in for Razorpay's REST API + webhooks, for testing the real Razorpay code
 * path (src/services/payments/razorpay.ts) without a Razorpay account.
 *
 *   node scripts/fake-razorpay.mjs            (listens on :4200)
 *
 * Start a backend pointing at it (separate port so the normal mock-mode server keeps running):
 *   PORT=4005 RAZORPAY_KEY_ID=rzp_test_KEY RAZORPAY_KEY_SECRET=rzp_secret_123 \
 *   RAZORPAY_WEBHOOK_SECRET=wh_secret_456 RAZORPAY_API_BASE=http://localhost:4200 \
 *   DISABLE_STATUS_POLLER=true npx tsx src/index.ts
 *
 * Real endpoints imitated: POST /v1/orders, GET /v1/payments/:id, POST /v1/payments/qr_codes.
 * Test helpers (not Razorpay): POST /test/pay {orderId, method?, amountPaise?, webhook?}
 * returns {payment_id, signature} like checkout does (and optionally sends payment.captured);
 * POST /test/pay-qr {qrId, amountPaise, repeat?} sends qr_code.credited;
 * POST /test/webhook-again {paymentId} re-sends payment.captured.
 * Set TARGET to change where webhooks go (default http://localhost:4005/wallet/add-money/webhook).
 */
import http from "http"; import crypto from "crypto";
const KEY="rzp_test_KEY", SECRET="rzp_secret_123", WH="wh_secret_456", TARGET=process.env.TARGET||"http://localhost:4005/wallet/add-money/webhook";
const orders=new Map(), payments=new Map(); let n=0;
const id=(p)=>`${p}_${(++n).toString().padStart(6,"0")}${crypto.randomBytes(3).toString("hex")}`;
async function webhook(event,payload){const body=JSON.stringify({entity:"event",event,payload});const sig=crypto.createHmac("sha256",WH).update(body).digest("hex");const r=await fetch(TARGET,{method:"POST",headers:{"Content-Type":"application/json","X-Razorpay-Signature":sig},body});return r.status;}
http.createServer(async(req,res)=>{let b="";for await(const c of req)b+=c;const body=b?JSON.parse(b):{};const send=(s,o)=>{res.writeHead(s,{"Content-Type":"application/json"});res.end(JSON.stringify(o));};
 const authOk=req.headers.authorization===`Basic ${Buffer.from(`${KEY}:${SECRET}`).toString("base64")}`;
 if(req.url.startsWith("/v1/")&&!authOk)return send(401,{error:{description:"Authentication failed"}});
 if(req.method==="POST"&&req.url==="/v1/orders"){const o={id:id("order"),amount:body.amount,currency:"INR",receipt:body.receipt,status:"created"};orders.set(o.id,o);return send(200,o);}
 if(req.method==="GET"&&req.url.startsWith("/v1/payments/")){const p=payments.get(decodeURIComponent(req.url.split("/").pop()));return p?send(200,p):send(400,{error:{description:"not found"}});}
 if(req.method==="POST"&&req.url==="/v1/payments/qr_codes"){return send(200,{id:id("qr"),image_url:"https://rzp.example/qr.png",usage:body.usage});}
 if(req.method==="POST"&&req.url==="/test/pay"){const o=orders.get(body.orderId);const p={id:id("pay"),order_id:body.orderId,amount:body.amountPaise??o.amount,status:"captured",method:body.method||"upi"};payments.set(p.id,p);
   const signature=crypto.createHmac("sha256",SECRET).update(`${body.orderId}|${p.id}`).digest("hex");
   let wh=null; if(body.webhook) wh=await webhook("payment.captured",{payment:{entity:p}});
   return send(200,{payment_id:p.id,signature,webhook:wh});}
 if(req.method==="POST"&&req.url==="/test/pay-qr"){const p={id:id("pay"),order_id:null,amount:body.amountPaise,status:"captured",method:"upi"};payments.set(p.id,p);
   const s1=await webhook("qr_code.credited",{payment:{entity:p},qr_code:{entity:{id:body.qrId}}}); const s2=body.repeat?await webhook("qr_code.credited",{payment:{entity:p},qr_code:{entity:{id:body.qrId}}}):null; return send(200,{s1,s2,paymentId:p.id});}
 if(req.method==="POST"&&req.url==="/test/webhook-again"){const p=payments.get(body.paymentId);return send(200,{status:await webhook("payment.captured",{payment:{entity:p}})});}
 send(404,{});
}).listen(4200,()=>console.log("fake razorpay :4200"));

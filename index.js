// index.js
// Vinted sniper -> envoie photo + titre + lien sur Discord (intervalle par défaut 5000 ms = 5s)
// ATTENTION: requêtes toutes les 5s peuvent provoquer un blocage par Vinted.

const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const { WebhookClient } = require("discord.js");

const SEEN_FILE = path.join(__dirname, "seen.json");

// --------- CONFIG (override via env possible)
const WEBHOOK_URL = "https://discord.com/api/webhooks/1428857392300556414/Ye6YirWdifhES-DbFINU8Nr61eqCIQd_pGxLwsEkUxAxNP7GAf2KwJ645YTsg-KoVwBt";
const CHECK_URL = process.env.CHECK_URL || "https://www.vinted.fr/catalog?search_text=jeans";
const CHECK_INTERVAL_MS = parseInt(process.env.CHECK_INTERVAL_MS || "5000", 10); // 5000 ms = 5s
const BRAND_FILTERS = (process.env.BRANDS || "nike,adidas").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const MAX_PRICE = parseFloat(process.env.MAX_PRICE || "50"); // prix max en euros
const QUALITY_KEYWORDS = (process.env.QUALITY_KEYWORDS || "neuf,comme neuf,excellent état").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);

const MAX_SENDS_PER_RUN = parseInt(process.env.MAX_SENDS_PER_RUN || "2", 10); // nb max d'envois par cycle
const JITTER_MAX_MS = 200; // jitter pour éviter patterns stricts

if (!WEBHOOK_URL) {
  console.error("ERREUR: webhook manquant. Mets WEBHOOK_URL ou DISCORD_WEBHOOK.");
  process.exit(1);
}

const webhook = new WebhookClient({ url: WEBHOOK_URL });

// load seen
let seen = {};
try {
  if (fs.existsSync(SEEN_FILE)) seen = JSON.parse(fs.readFileSync(SEEN_FILE, "utf8")) || {};
} catch(e){ console.warn("read seen.json:", e.message); seen = {}; }

function saveSeen(){ try{ fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2), "utf8"); } catch(e){ console.warn("write seen.json:", e.message);} }

function matchesBrand(text){
  if (BRAND_FILTERS.length === 0) return true;
  return BRAND_FILTERS.some(b => text.includes(b));
}
function matchesQuality(text){
  if (QUALITY_KEYWORDS.length === 0) return true;
  return QUALITY_KEYWORDS.some(k => text.includes(k));
}

async function sendDiscord(item){
  try{
    const embed = {
      title: item.title?.substring(0,256) || "Annonce",
      url: item.link,
      fields: [
        { name: "Prix", value: item.price ? `${item.price} €` : "–", inline: true }
      ],
      timestamp: new Date().toISOString()
    };
    if (item.img) embed.image = { url: item.img };
    await webhook.send({ embeds: [embed] });
    console.log("Sent:", item.link);
  }catch(e){
    console.error("Discord send error:", e.message);
  }
}

let backoff = 1; // multiplier en cas de rate-limit

async function fetchOnce(){
  try{
    // jitter léger
    await new Promise(r => setTimeout(r, Math.floor(Math.random()*JITTER_MAX_MS)));

    const res = await axios.get(CHECK_URL, {
      headers: { "User-Agent": process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      timeout: 20000
    });
    const $ = cheerio.load(res.data);
    const items = [];

    $('a[href*="/items/"]').each((i, el) => {
      try{
        const a = $(el);
        let href = a.attr("href") || "";
        if (href.startsWith("/")) href = "https://www.vinted.fr" + href;
        const title = (a.find(".ItemBox__title, .title, .item-box__title").first().text().trim()) ||
                      (a.attr("title") || "").trim() || a.text().trim().slice(0,120);
        const priceText = a.find(".ItemBox__price, .price, .item-box__price").first().text() || "";
        const price = priceText ? parseFloat(priceText.replace(/\s|€|\u202f/g,"").replace(",", ".")) : null;
        const imgEl = a.find("img").first();
        const img = imgEl.attr("src") || imgEl.attr("data-src") || null;

        if (!href) return;
        items.push({ title: title || "–", link: href, price, img });
      }catch(e){}
    });

    // dedupe
    const uniq = [];
    const seenTmp = new Set();
    for(const it of items){
      if(!seenTmp.has(it.link)){
        seenTmp.add(it.link);
        uniq.push(it);
      }
    }

    let sends = 0;
    for(const it of uniq){
      if (sends >= MAX_SENDS_PER_RUN) break;
      const txt = (it.title||"").toLowerCase();
      if (!matchesBrand(txt)) continue;
      if (MAX_PRICE && it.price !== null && it.price > MAX_PRICE) continue;
      if (!matchesQuality(txt)) continue;
      if (seen[it.link]) continue;

      await sendDiscord(it);
      seen[it.link] = { ts: Date.now(), title: it.title };
      sends++;
    }
    if (sends > 0) saveSeen();

    // success -> reset backoff
    backoff = 1;
    return true;
  }catch(err){
    const status = err?.response?.status;
    console.error("Fetch error:", err.message || err);
    if (status === 429 || (err.message && err.message.toLowerCase().includes("rate"))) {
      backoff = Math.min(backoff * 2, 64);
      console.warn("Rate limit detected, backing off x", backoff);
    } else {
      backoff = Math.min(backoff * 1.5, 64);
    }
    return false;
  }
}

async function loop(){
  while(true){
    const ok = await fetchOnce();
    let wait = Math.max(CHECK_INTERVAL_MS * backoff, 1000); // sécurité min 1s
    await new Promise(r => setTimeout(r, wait + Math.floor(Math.random()*200)));
  }
}

// start
console.log("Starting sniper. Interval (ms):", CHECK_INTERVAL_MS, "Brands:", BRAND_FILTERS, "Max price:", MAX_PRICE);
loop();
const axios = require("axios");
const cheerio = require("cheerio");
const { WebhookClient } = require("discord.js");
const express = require("express");

// Ton webhook Discord
const webhook = new WebhookClient({ url: "https://discord.com/api/webhooks/1428857392300556414/Ye6YirWdifhES-DbFINU8Nr61eqCIQd_pGxLwsEkUxAxNP7GAf2KwJ645YTsg-KoVwBt" });

// URL Vinted à surveiller
const CHECK_URL = "https://www.vinted.fr/catalog?search_text=jeans";

// Intervalle en millisecondes
const INTERVAL_MS = 5 * 60 * 1000; // toutes les 5 minutes

async function checkVinted() {
  try {
    const { data } = await axios.get(CHECK_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
    const $ = cheerio.load(data);
    const items = [];

    $("a[href*='/items/']").slice(0, 5).each((i, el) => {
      const title = $(el).text().trim().slice(0, 120);
      let link = $(el).attr("href");
      if (link.startsWith("/")) link = "https://www.vinted.fr" + link;
      items.push({ title, link });
    });

    if (items.length) {
      console.log(`[${new Date().toLocaleTimeString()}] ${items.length} annonces trouvées`);
      await webhook.send(`🔔 ${items.length} nouvelles annonces ! Exemple: ${items[0].link}`);
    } else {
      console.log(`[${new Date().toLocaleTimeString()}] Aucune annonce trouvée`);
    }
  } catch (err) {
    console.error("Erreur fetch:", err.message);
  }
}

// Keepalive Express pour Replit
const app = express();
app.get("/", (req, res) => res.send("Bot Vinted actif !"));
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Serveur keepalive sur port ${port}`);
  checkVinted();
  setInterval(checkVinted, INTERVAL_MS);
});
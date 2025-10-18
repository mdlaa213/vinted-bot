const axios = require("axios");
const cheerio = require("cheerio");
const { WebhookClient } = require("discord.js");

const webhook = new WebhookClient({ url: "TON_WEBHOOK_ICI" });
const CHECK_URL = "https://www.vinted.fr/catalog?search_text=jeans";
const INTERVAL_MS = 2 * 60 * 1000; // toutes les 2 minutes
const sentItems = new Set();

async function checkVinted() {
  try {
    const { data } = await axios.get(CHECK_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
    const $ = cheerio.load(data);

    $("a[href*='/items/']").each(async (i, el) => {
      const title = $(el).text().trim().slice(0, 120);
      let link = $(el).attr("href");
      if (link.startsWith("/")) link = "https://www.vinted.fr" + link;

      const img = $(el).find("img").attr("src"); // récupère la photo
      if (!sentItems.has(link)) {
        sentItems.add(link);
        await webhook.send({
          content: `${title}\n${link}`,
          embeds: [{ image: { url: img } }]
        });
        console.log("Nouvelle annonce envoyée:", title);
      }
    });
  } catch (err) {
    console.error("Erreur fetch:", err.message);
  }
}

checkVinted();
setInterval(checkVinted, INTERVAL_MS);
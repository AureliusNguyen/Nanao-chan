import axios from "axios";
import * as cheerio from "cheerio";
import { Logger } from "./logger";
import { Redis } from "@upstash/redis";
const logger = new Logger("Scraper");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Cache TTL in seconds
const CACHE_TTL = 7 * 60 * 60 * 24; // 7 days
const MAX_CACHE_SIZE = 1024000; // 10MB limit for cached content

export const urlPattern =
  /https?:\/\/(www.)?[-a-zA-Z0-9@:%.+~#=]{1,256}.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%+.~#?&//=]*)/;

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\n+/g, " ").trim();
}

export async function scrapeUrl(url: string) {
  try {
    logger.info(`Scraping URL: ${url}`);
    const cached = await getCachedContent(url);
    if (cached) {
      logger.info(`Using Cached content for: ${url}`);
      return cached;
    }
    logger.info(`Cache miss. Proceeding with fresh scrape for: ${url}`);

    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    // Remove all script, style, link, noscript, iframe, img, video, audio, form, and button tags
    $("script").remove();
    $("style").remove();
    $("link").remove();
    $("noscript").remove();
    $("iframe").remove();
    $("img").remove();
    $("video").remove();
    $("audio").remove();
    $("form").remove();
    $("button").remove();

    // Extract all text from the body
    const title = $("title").text();
    const metaDescription = $("meta[name='description']").attr("content") || "";
    const h1 = $("h1")
      .map((_, el) => $(el).text())
      .get()
      .join(" ");
    const h2 = $("h2")
      .map((_, el) => $(el).text())
      .get()
      .join(" ");
    const h3 = $("h3")
      .map((_, el) => $(el).text())
      .get()
      .join(" ");
    const h4 = $("h4")
      .map((_, el) => $(el).text())
      .get()
      .join(" ");
    const h5 = $("h5")
      .map((_, el) => $(el).text())
      .get()
      .join(" ");
    const h6 = $("h6")
      .map((_, el) => $(el).text())
      .get()
      .join(" ");

    // Get text from important elements
    const articleText = $("article")
      .map((_, el) => $(el).text())
      .get()
      .join(" ");
    const mainText = $("main")
      .map((_, el) => $(el).text())
      .get()
      .join(" ");
    const contentText = $(".content, #content, [class*='content']")
      .map((_, el) => $(el).text())
      .get()
      .join(" ");
    const paragraphs = $("p")
      .map((_, el) => $(el).text())
      .get()
      .join(" ");
    const listItems = $("li")
      .map((_, el) => $(el).text())
      .get()
      .join(" ");

    // Combine all the content
    let combinedContent = [
      title,
      metaDescription,
      h1,
      h2,
      h3,
      h4,
      h5,
      h6,
      articleText,
      mainText,
      contentText,
      paragraphs,
      listItems,
    ].join(" ");

    // Clean and truncate the combined content
    combinedContent = cleanText(combinedContent).slice(0, 100000);

    const finalResponse = {
      url,
      title: cleanText(title),
      headings: {
        h1: cleanText(h1),
        h2: cleanText(h2),
        h3: cleanText(h3),
        h4: cleanText(h4),
        h5: cleanText(h5),
        h6: cleanText(h6),
      },
      metaDescription: cleanText(metaDescription),
      content: combinedContent,
      error: null,
    };

    await cachedContent(url, finalResponse);
  } catch (error) {
    console.error("Error scraping URL:", error);
    return {
      url,
      title: "",
      headings: { h1: "", h2: "", h3: "", h4: "", h5: "", h6: "" },
      metaDescription: "",
      content: "",
      error: "Failed to scrape URL",
    };
  }
}

export interface ScrapedContent {
  url: string;
  title: string;
  headings: {
    h1: string;
    h2: string;
    h3: string;
    h4: string;
    h5: string;
    h6: string;
  };
  metaDescription: string;
  content: string;
  error: string | null;
  cachedAt?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isValidScrapedContent(data: any): data is ScrapedContent {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof data.url === "string" &&
    typeof data.title === "string" &&
    typeof data.headings === "object" &&
    typeof data.headings.h1 === "string" &&
    typeof data.headings.h2 === "string" &&
    typeof data.headings.h3 === "string" &&
    typeof data.headings.h4 === "string" &&
    typeof data.headings.h5 === "string" &&
    typeof data.headings.h6 === "string" &&
    typeof data.metaDescription === "string" &&
    typeof data.content === "string" &&
    (data.error === null || typeof data.error === "string")
  );
}

function getCacheKey(url: string): string {
  const sanitizedUrl = url.substring(0, 200);
  return `scrape:${sanitizedUrl}`;
}

async function getCachedContent(url: string): Promise<ScrapedContent | null> {
  try {
    const cacheKey = getCacheKey(url);
    logger.info(`Checking cache for key: ${cacheKey}`);
    const cached = await redis.get(cacheKey);
    if (!cached) {
      logger.info(`Cache miss. No cached content found for: ${url}`);
      return null;
    }
    logger.info(`Cache hit. Found cached content for key: ${url}`);
    let parsed: any;
    if (typeof cached === "string") {
      try {
        parsed = JSON.parse(cached);
      } catch (parseError) {
        logger.error(
          `JSON parse error for cached content for key: ${parseError}`
        );
        await redis.del(cacheKey);
        return null;
      }
    } else {
      parsed = cached;
    }

    if (isValidScrapedContent(parsed)) {
      const age = Date.now() - (parsed.cachedAt || 0);
      logger.info(`Cached content age: ${Math.round(age / 1000 / 60)} minutes`);
      return parsed;
    }

    logger.warn(`Invalid cached content format for URL: ${url}`);
    await redis.del(cacheKey);
    return null;
  } catch (error) {
    logger.error(`Cached retrieval error: ${error}`);
    return null;
  }
}

async function cachedContent(
  url: string,
  content: ScrapedContent
): Promise<void> {
  try {
    const cacheKey = getCacheKey(url);
    content.cachedAt = Date.now();

    if (!isValidScrapedContent(content)) {
      logger.error(`Attempted to cache invalid content for URL: ${url}`);
      return;
    }

    const serialized = JSON.stringify(content);

    if (serialized.length > MAX_CACHE_SIZE) {
      logger.warn(
        `Content too large to cache for URL: ${url} ${serialized.length} bytes`
      );
      return;
    }

    await redis.set(cacheKey, serialized, { ex: CACHE_TTL });
    logger.info(
      `Successfully cached content for URL: ${url} ${serialized.length} bytes, TTL: ${CACHE_TTL} seconds`
    );
  } catch (error) {
    logger.error(`Cache storage error: ${error}`);
  }
}

// export async function saveConversation(id: string, messages: string) {
//   try {
//     logger.info(`Saving conversation with ID: ${id}`);
//     await redis.set(`conversation:${id}`, JSON.stringify(messages));
//     await redis.expire(`conversation:${id}`, 60 * 60 * 24 * 7);
//     logger.info(
//       `Successfully saved conversation ${id} with ${messages.length} messages.`
//     );
//   } catch (error) {
//     logger.error(`Failed to save conversation ${id}: ${error}`);
//     throw error;
//   }
// }

// export async function getConversation(id: string): Promise<Message[] | null> {
//   try {
//     logger.info(`Fetching conversation with ID: ${id}`);
//     const data = await redis.get(`conversation:${id}`);
//     if (!data) {
//       logger.info(`No conversation found for ID: ${id}`);
//       return null;
//     }
//     if (typeof data === "string") {
//       const messages = JSON.parse(data);
//       logger.info(
//         `Successfully fetched conversation ${id} with ${messages.length} messages.`
//       );
//       return messages;
//     }
//   } catch (error) {
//     logger.error(`Failed to get conversation ${id}: ${error}`);
//     return null;
//   }
// }

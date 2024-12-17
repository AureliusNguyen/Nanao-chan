import { NextResponse } from "next/server";
import getGroqResponse from "@/app/utils/GroqClient";
import { scrapeUrl, urlPattern } from "@/app/utils/scraper";

export async function POST(req: Request) {
  try {
    const { message, messages } = await req.json();

    console.log("message received:", message);
    console.log("messages received:", messages);

    const urlMatch = message.match(urlPattern);

    let scrapedContent = "";

    if (urlMatch) {
      console.log("URL Match:", urlMatch);
      const scraperResponse = await scrapeUrl(urlMatch[0]);
      console.log("Scraper Response:", scraperResponse);
      if (scraperResponse) {
        scrapedContent = scraperResponse.content;
      }
    }
    console.log("Scraped Content:", scrapedContent);

    const MAX_CONTENT_LENGTH = 23200;
    if (scrapedContent.length > MAX_CONTENT_LENGTH) {
      console.warn("Scraped content is too long, truncating...");
      scrapedContent = scrapedContent.slice(0, MAX_CONTENT_LENGTH);
    }

    console.log("Scraped Content (Truncated):", scrapedContent);

    // Extract the user's query by removing the URL from the message if it exists
    const userPrompt = message.replace(urlMatch ? urlMatch[0] : "", "").trim();
    const prompt = `
    Answer my question: "${userPrompt}"
    Based on the following content: 
    <content>
    ${scrapedContent}
    </content>
    `;

    const llmMessages = [
      ...messages,
      {
        role: "system",
        content: userPrompt,

      }
    ]
    console.log("Prompt:", prompt);
    const response = await getGroqResponse(llmMessages);

    return NextResponse.json({ message: response });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Error Meow :(" });
  }
}
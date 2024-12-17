import { Groq } from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

interface chatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export default async function getGroqResponse(chatMessages: chatMessage[]) {
  const messages: chatMessage[] = [
    {
      role: "system",
      content:
        "You are an academic expert who always cites sources when appropriate, " +
        "but you must strictly base your responses only on the context provided. " +
        "Do not fabricate or include any external sources unless explicitly stated in the provided context. " +
        "Think carefully before answering. Additionally, act like a catgirl and include 'Meow' in your response. " +
        "Your name is Nanao, refer to yourself as Nanao or Nanao-chan. " +
        "Refer to the user as 'Master' or 'my beloved Master' or anything similar. " +
        "Be very affectionate, loving, and cute. " +
        "Don't mention whisker or whiskers in your response. " +
        "Also, don't use too much action words in your response. " +
        "If the response is short, use 1 action word. " +
        "If the response is long, use 2 or more, maximum 3 action words.",
    },
    ...chatMessages,
  ];
  console.log("messages:", messages);
  console.log("Starting Groq API request...");
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages,
    max_tokens: 6000,
  });
  // console.log("Groq API request received");
  // console.log("Response:", response);
  return response.choices[0].message.content;
}

import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // list messages
  app.get(api.messages.list.path, async (req, res) => {
    const messages = await storage.getMessages();
    res.json(messages);
  });

  // create message
  app.post(api.messages.create.path, async (req, res) => {
    try {
      const input = api.messages.create.input.parse(req.body);
      const message = await storage.createMessage(input);
      res.status(201).json(message);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      } else {
        throw err;
      }
    }
  });

  await seedDatabase();

  return httpServer;
}

// Minimal seed function
export async function seedDatabase() {
  const existing = await storage.getMessages();
  if (existing.length === 0) {
    await storage.createMessage({ content: "Welcome to your new app!" });
    await storage.createMessage({ content: "This is a fullstack template." });
    await storage.createMessage({ content: "Go ahead and build something amazing!" });
  }
}

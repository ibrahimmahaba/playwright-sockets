import { Env, Insight } from "@semoss/sdk";
import type { McpToolContext } from "../types/browserEvents";
import { runPixel } from "./pixel";

type EnvWithTool = typeof Env & { TOOL?: unknown };
type McpToolStatus = "success" | "error" | "cancelled" | "paused";
type McpMediaPart = {
  type: "MEDIA";
  mediaInfo: {
    base64Data?: string;
    fileLocation?: string;
    fileName: string;
    mimeType?: string;
    sourceUrl?: string;
  };
};
type McpResponseOptions = {
  mediaParts?: McpMediaPart[];
};
type PlaygroundMessage = {
  io?: string;
  modelId?: string;
};
type RoomOptionsResponse = {
  OPTIONS?: unknown;
};
type InsightWithMcpResponse = typeof insight & {
  actions: typeof insight.actions & {
    sendMCPResponseToPlayground?: (
      response: string,
      status: McpToolStatus,
      executedParameters: Record<string, unknown>,
    ) => void;
  };
};

type McpToolResponse = {
  type: "SMSS_EXEC_TOOL";
  tool: {
    type: "MCP";
    message: string;
    id: string;
    name: string;
    response: string;
    roomId: string;
    tool_status: McpToolStatus;
    executedParameters: Record<string, unknown>;
    mediaParts?: McpMediaPart[];
  };
};

const semossEnvScript = document.getElementById("semoss-env");

if (semossEnvScript?.textContent) {
  try {
    Env.update(JSON.parse(semossEnvScript.textContent));
  } catch (error) {
    console.warn("Unable to parse SEMOSS environment payload", error);
  }
}

export const insight = new Insight();

let initialized = false;
let toolContext = normalizeToolContext((Env as EnvWithTool).TOOL);
let boundRoomId = "";
let boundInsightId = "";
let roomBinding: Promise<void> | null = null;
const subscribers = new Set<(context: McpToolContext | null) => void>();

function normalizeToolContext(rawTool: unknown): McpToolContext | null {
  if (!rawTool || typeof rawTool !== "object") {
    return null;
  }

  const tool = rawTool as Record<string, unknown>;
  const parameters =
    tool.parameters &&
    typeof tool.parameters === "object" &&
    !Array.isArray(tool.parameters)
      ? (tool.parameters as Record<string, unknown>)
      : {};

  const executedParameters =
    tool.executedParameters &&
    typeof tool.executedParameters === "object" &&
    !Array.isArray(tool.executedParameters)
      ? (tool.executedParameters as Record<string, unknown>)
      : undefined;

  return {
    type: typeof tool.type === "string" ? tool.type : "MCP",
    id: typeof tool.id === "string" ? tool.id : "",
    name:
      typeof tool.name === "string"
        ? tool.name
        : typeof tool.original_name === "string"
        ? tool.original_name
        : "",
    originalName:
      typeof tool.original_name === "string"
        ? tool.original_name
        : typeof tool.name === "string"
        ? tool.name
        : "",
    message: typeof tool.message === "string" ? tool.message : "",
    roomId: typeof tool.roomId === "string" ? tool.roomId : "",
    parameters,
    executedParameters,
    toolResponse: tool.tool_response,
  };
}

function setToolContext(nextToolContext: unknown) {
  toolContext = normalizeToolContext(nextToolContext);
  subscribers.forEach((subscriber) => {
    try {
      subscriber(toolContext);
    } catch (error) {
      console.warn("Unable to notify MCP tool context subscriber", error);
    }
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("message", (event) => {
    if (!event?.data || event.data.type !== "SMSS_INIT_TOOL") {
      return;
    }
    setToolContext(event.data.tool);
  });
}

export async function initSemoss(): Promise<McpToolContext | null> {
  if (initialized) {
    return toolContext;
  }

  try {
    const initializedContext = await insight.initialize();
    setToolContext(
      (initializedContext as { tool?: unknown } | undefined)?.tool ||
        (Env as EnvWithTool).TOOL ||
        toolContext,
    );
  } catch (error) {
    console.warn(
      "SEMOSS initialization failed; continuing without MCP context",
      error,
    );
  } finally {
    initialized = true;
  }

  return toolContext;
}

export function getMcpToolContext(): McpToolContext | null {
  return toolContext;
}

export function getSemossInsightId(): string {
  return insight.insightId || boundInsightId;
}

export async function runAppMcpTool<T = unknown>(
  name: string,
  parameters: Record<string, unknown>,
): Promise<T> {
  const appId = Env.APP;
  if (!appId) {
    throw new Error("SEMOSS app id is required to run an app MCP tool");
  }

  const { pixelReturn } = await runPixel<unknown>(
    `RunMCPTool(project=[${JSON.stringify(appId)}], function=[${JSON.stringify(
      name,
    )}], paramValues=[${JSON.stringify(parameters)}]);`,
  );

  const output = pixelReturn?.[0]?.output;
  if (typeof output === "string") {
    return JSON.parse(output) as T;
  }
  return output as T;
}

function readNestedString(value: unknown, keys: string[]): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === "string" && direct.trim()) {
      return direct.trim();
    }
  }

  for (const nested of Object.values(record)) {
    const found = readNestedString(nested, keys);
    if (found) {
      return found;
    }
  }

  return "";
}

export async function getRoomActiveModelId(roomId: string): Promise<string> {
  const normalizedRoomId = roomId.trim();
  if (!normalizedRoomId) {
    return "";
  }

  const { pixelReturn } = await runPixel<
    PlaygroundMessage[] | RoomOptionsResponse
  >(
    `GetPlaygroundMessages(roomId=${JSON.stringify([normalizedRoomId])}, limit=[25], offset=[0], sort=["DESC"]); GetRoomOptions(roomId=${JSON.stringify(normalizedRoomId)});`,
  );

  const messages = pixelReturn?.[0]?.output;
  if (Array.isArray(messages)) {
    for (const message of messages) {
      if (
        message &&
        typeof message === "object" &&
        (message as PlaygroundMessage).io === "INPUT" &&
        typeof (message as PlaygroundMessage).modelId === "string" &&
        (message as PlaygroundMessage).modelId?.trim()
      ) {
        return (message as PlaygroundMessage).modelId!.trim();
      }
    }

    for (const message of messages) {
      if (
        message &&
        typeof message === "object" &&
        typeof (message as PlaygroundMessage).modelId === "string" &&
        (message as PlaygroundMessage).modelId?.trim()
      ) {
        return (message as PlaygroundMessage).modelId!.trim();
      }
    }
  }

  const options = pixelReturn?.[1]?.output?.OPTIONS;
  return readNestedString(options, [
    "engine_id",
    "modelId",
    "model_id",
    "app_id",
  ]);
}

export async function askPlaygroundWithImage(
  roomId: string,
  engineId: string,
  image: string,
  command: string,
): Promise<void> {
  const normalizedRoomId = roomId.trim();
  const normalizedEngineId = engineId.trim();
  const normalizedImage = image.trim();
  if (!normalizedRoomId || !normalizedEngineId || !normalizedImage) {
    return;
  }

  await runPixel(
    `AskPlayground(engine=${JSON.stringify([normalizedEngineId])}, roomId=${JSON.stringify([normalizedRoomId])}, command=${JSON.stringify([`<encode>${command}</encode>`])}, image=${JSON.stringify([normalizedImage])}, paramValues=[${JSON.stringify({})}]);`,
  );
}

export async function bindSemossInsightToRoom(roomId: string): Promise<void> {
  const normalizedRoomId = roomId.trim();
  if (!normalizedRoomId) {
    throw new Error("Room ID is required to bind the SEMOSS insight");
  }
  if (boundRoomId === normalizedRoomId) {
    return;
  }
  if (roomBinding) {
    await roomBinding;
    if (boundRoomId === normalizedRoomId) {
      return;
    }
  }

  roomBinding = (async () => {
    const response = await runPixel(
      `SetRoomForInsight(roomId=${JSON.stringify(normalizedRoomId)});`,
    );
    if (response.insightID) {
      boundInsightId = response.insightID;
    }
    boundRoomId = normalizedRoomId;
  })();

  try {
    await roomBinding;
  } finally {
    roomBinding = null;
  }
}

export function subscribeToMcpToolContext(
  listener: (context: McpToolContext | null) => void,
): () => void {
  subscribers.add(listener);
  listener(toolContext);
  return () => subscribers.delete(listener);
}

export function sendMcpResponseToPlayground(
  response: unknown,
  toolStatus: McpToolStatus = "success",
  executedParameters: Record<string, unknown> = {},
  options: McpResponseOptions = {},
): void {
  const payload =
    typeof response === "string" ? response : JSON.stringify(response);
  const action = (insight as InsightWithMcpResponse).actions
    .sendMCPResponseToPlayground;
  if (action) {
    action(payload, toolStatus, executedParameters);
    return;
  }

  if (!toolContext) {
    throw new Error("No MCP tool execution context found");
  }
  if (typeof window === "undefined" || typeof window.parent === "undefined") {
    throw new Error(
      "Cannot send MCP tool response outside of embedded browser",
    );
  }

  const message: McpToolResponse = {
    type: "SMSS_EXEC_TOOL",
    tool: {
      type: "MCP",
      message: toolContext.message,
      id: toolContext.id,
      name: toolContext.name,
      response: payload,
      roomId: toolContext.roomId,
      tool_status: toolStatus,
      executedParameters,
      ...(options.mediaParts?.length
        ? { mediaParts: options.mediaParts }
        : {}),
    },
  };

  window.parent.postMessage(message, "*");
}

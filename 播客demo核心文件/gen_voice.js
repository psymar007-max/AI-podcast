"use strict";

// 长文本语音合成 - Node.js 脚本（MiniMax t2a_async_v2）
// 功能：
// 1) 创建语音生成任务（支持直接传 text，或传 text_file_id）
// 2) 基于 task_id 轮询查询任务状态
// 3) 成功后用返回的 file_id 下载音频文件到本地，并在 macOS 自动打开
//
// 运行示例（使用环境变量注入凭据）：
//   cd /Users/你的用户名/Desktop/播客demo代码文件
//   export MINIMAX_API_KEY="你的API_KEY"; export GROUP_ID="你的GroupId";
//   node gen_voice.js \
//     --model speech-2.5-hd-preview \
//     --text "这是待合成的文本" \
//     --voice-id audiobook_male_1 \
//     --format mp3 --bitrate 128000 --audio-sample-rate 32000 --channel 2
//
// 也可直接用参数传入：
//   node gen_voice.js --api-key "你的API_KEY" --group-id "你的GroupId" --text "你好" --voice-id audiobook_male_1

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function assertNodeFetchAvailable() {
  if (typeof fetch !== "function") {
    console.error("当前 Node 版本不支持全局 fetch。请使用 Node 18+ 运行此脚本。");
    process.exit(1);
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function toNumberOrDefault(val, def) {
  if (val === undefined || val === null) return def;
  const num = Number(val);
  return Number.isFinite(num) ? num : def;
}

function getNested(obj, pathArr) {
  return pathArr.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function deepFindFirstKey(obj, targetKeys) {
  const keysSet = new Set(Array.isArray(targetKeys) ? targetKeys : [targetKeys]);
  function dfs(value) {
    if (value && typeof value === "object") {
      for (const k of Object.keys(value)) {
        if (keysSet.has(k)) return value[k];
        const found = dfs(value[k]);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  }
  return dfs(obj);
}

async function createT2ATask(apiKey, groupId, params) {
  const url = `https://api.minimaxi.com/v1/t2a_async_v2?GroupId=${encodeURIComponent(groupId)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(params),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`创建任务失败(${res.status}): ${text}`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`解析创建任务响应失败: ${text}`);
  }
  const taskId = getNested(data, ["data", "task_id"]) || data.task_id || deepFindFirstKey(data, ["task_id"]);
  if (!taskId) {
    throw new Error(`未从创建任务响应中获取到 task_id，响应: ${text}`);
  }
  return { taskId, raw: data };
}

async function queryT2ATask(apiKey, groupId, taskId) {
  const url = `https://api.minimaxi.com/v1/query/t2a_async_query_v2?GroupId=${encodeURIComponent(groupId)}&task_id=${encodeURIComponent(taskId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`查询任务失败(${res.status}): ${text}`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`解析查询任务响应失败: ${text}`);
  }
  return data;
}

async function retrieveFile(apiKey, fileId) {
  const url = `https://api.minimaxi.com/v1/files/retrieve_content?file_id=${encodeURIComponent(fileId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
  });
  const contentType = res.headers.get("content-type") || "";
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (!res.ok) {
    let message = `下载文件失败(${res.status})`;
    if (contentType.includes("application/json")) {
      try { message += `: ${buffer.toString("utf8")}`; } catch {}
    }
    throw new Error(message);
  }

  // 如果服务端返回了 JSON，说明还未准备就绪或返回错误，避免误存为音频
  if (contentType.includes("application/json")) {
    throw new Error(`下载到的内容为 JSON，可能任务未完成或无效的 file_id: ${buffer.toString("utf8").slice(0, 500)}`);
  }

  return buffer;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSuccessStatus(status) {
  if (!status) return false;
  const normalized = String(status).toLowerCase();
  return ["succeed", "success", "completed", "finished", "done"].some((s) => normalized.includes(s));
}

async function main() {
  assertNodeFetchAvailable();
  const args = parseArgs(process.argv);

  const apiKey = args["api-key"] || process.env.MINIMAX_API_KEY;
  const groupId = args["group-id"] || process.env.GROUP_ID;

  const model = args["model"] || "speech-2.5-hd-preview";
  const text = args["text"]; // 可选，如果提供 text_file_id 则可以不传
  const textFileId = args["text-file-id"]; // 可选：若传入，表示用文件形式提供文本

  const voiceId = args["voice-id"] || "audiobook_male_1"; // 可替换成你复刻成功的 voice_id
  const speed = toNumberOrDefault(args["speed"], 1);
  const vol = toNumberOrDefault(args["vol"], 1);
  const pitch = toNumberOrDefault(args["pitch"], 1);

  const languageBoost = args["language-boost"] || "auto";

  const audioSampleRate = toNumberOrDefault(args["audio-sample-rate"], 32000);
  const bitrate = toNumberOrDefault(args["bitrate"], 128000);
  const format = args["format"] || "mp3";
  const channel = toNumberOrDefault(args["channel"], 2);

  const pollIntervalMs = toNumberOrDefault(args["poll-interval"], 3000);
  const timeoutMs = toNumberOrDefault(args["timeout-sec"], 300) * 1000;

  if (!apiKey || !groupId) {
    console.error("缺少凭据。请通过环境变量或参数传入：MINIMAX_API_KEY、GROUP_ID。");
    process.exit(1);
  }
  if (!text && !textFileId) {
    console.error("请通过 --text 或 --text-file-id 提供待合成文本。");
    process.exit(1);
  }

  const payload = {
    model,
    language_boost: languageBoost,
    voice_setting: {
      voice_id: voiceId,
      speed,
      vol,
      pitch,
    },
    audio_setting: {
      audio_sample_rate: audioSampleRate,
      bitrate,
      format,
      channel,
    },
  };
  if (textFileId) {
    payload.text_file_id = textFileId;
  } else if (text) {
    payload.text = text;
  }

  try {
    console.log("[1/3] 正在创建语音生成任务...");
    const { taskId } = await createT2ATask(apiKey, groupId, payload);
    console.log(`任务已创建，task_id = ${taskId}`);

    console.log("[2/3] 开始轮询任务状态...");
    const startTs = Date.now();
    let lastStatus = "";
    let resultFileId = undefined;

    while (Date.now() - startTs < timeoutMs) {
      const queryRes = await queryT2ATask(apiKey, groupId, taskId);
      const code = getNested(queryRes, ["base_resp", "status_code"]);
      const status = queryRes.status || getNested(queryRes, ["data", "status"]) || queryRes.task_status || "";
      const possibleFileId =
        getNested(queryRes, ["data", "file_id"]) ||
        getNested(queryRes, ["result", "file_id"]) ||
        queryRes.file_id ||
        deepFindFirstKey(queryRes, ["file_id"]);

      if (status && status !== lastStatus) {
        console.log(`当前任务状态: ${status}`);
        lastStatus = status;
      }

      if (code === 0 && isSuccessStatus(status) && possibleFileId) {
        resultFileId = possibleFileId;
        break;
      }

      await sleep(pollIntervalMs);
    }

    if (!resultFileId) {
      throw new Error("任务未在超时时间内返回成功文件。可增大 --timeout-sec 再试。");
    }

    console.log(`[3/3] 任务成功，开始下载音频。file_id = ${resultFileId}`);
    const buffer = await retrieveFile(apiKey, resultFileId);
    const outPath = path.resolve(`t2a_result_${Date.now()}.${format}`);
    fs.writeFileSync(outPath, buffer);
    console.log(`已保存到本地: ${outPath}`);

    if (process.platform === "darwin") {
      try {
        spawn("open", [outPath], { stdio: "ignore", detached: true });
      } catch {}
    }
  } catch (err) {
    console.error("执行失败:", err?.message || err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  createT2ATask,
  queryT2ATask,
  retrieveFile,
};

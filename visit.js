import https from "node:https";
import { URLSearchParams } from "node:url";
import notificationKit from "./notification-kit.js";

function logError(context, error, extra = {}) {
  console.error(
    `[visit][${context}]`,
    JSON.stringify(
      {
        message: error?.message,
        stack: error?.stack,
        ...extra,
      },
      null,
      2,
    ),
  );
}

/**
 * 发起 HTTPS 请求并返回响应信息。
 */
function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });

    req.on("error", (error) => {
      logError("httpRequest", error, {
        hostname: options?.hostname,
        path: options?.path,
        method: options?.method,
      });
      reject(error);
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

/**
 * 解析 Set-Cookie 头，返回 { name: value } 形式的对象。
 */
function parseCookies(setCookieHeaders = []) {
  const cookieJar = {};

  for (const header of setCookieHeaders) {
    if (!header) continue;
    const [pair] = header.split(";");
    if (!pair) continue;
    const eqIndex = pair.indexOf("=");
    if (eqIndex === -1) continue;
    const name = pair.slice(0, eqIndex).trim();
    const value = pair.slice(eqIndex + 1).trim();
    if (name) {
      cookieJar[name] = value;
    }
  }

  return cookieJar;
}

async function main() {
  const userAgent =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.65(0x1800412a) NetType/WIFI Language/zh_CN";

  // Step 1: GET 请求，获取 ik 与 VISITOR Cookie
  const getOptions = {
    hostname: "qiandao.sjtu.edu.cn",
    path: "/visitor/?xq=mh",
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh-Hans;q=0.9",
      "Accept-Encoding": "identity",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Site": "none",
      Priority: "u=0, i",
      "User-Agent": userAgent,
    },
  };

  let getResponse;
  try {
    getResponse = await httpRequest(getOptions);
  } catch (error) {
    logError("GET 请求失败", error, {
      hostname: getOptions.hostname,
      path: getOptions.path,
    });
    throw error;
  }
  const cookies = parseCookies(getResponse.headers["set-cookie"]);

  console.log("GET status:", getResponse.statusCode);
  console.log("Cookies fetched:", cookies);

  // if (!cookies.ik || !cookies.VISITOR) {
  if (!cookies.VISITOR) {
    console.warn("警告：未获取到预期的 ik 或 VISITOR Cookie。");
    // 如果未拿到必要的 cookie，后续请求通常会失败，这里仍然继续尝试。
  }

  const cookieHeader = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");

  // Step 2: POST 请求，携带相同 Cookie 与表单数据
  const shanghaiOffsetMinutes = 8 * 60;
  const now = new Date();
  const utcMillis = now.getUTCHours() * 60 * 60 * 1000 + now.getUTCMinutes() * 60 * 1000;
  const shanghaiMillis = utcMillis + shanghaiOffsetMinutes * 60 * 1000;
  const shanghaiHours = new Date(shanghaiMillis).getUTCHours();
  const timePeriod = shanghaiHours < 12 ? "1" : "2";

  const formData = new URLSearchParams({
    campus: "闵行校区",
    time: timePeriod,
    xm: "马俊",
    zjhm: "500223198808188713",
    phone: "18782180597",
  });
  const body = formData.toString();

  const postOptions = {
    hostname: "qiandao.sjtu.edu.cn",
    path: "/visitor/submit.php",
    method: "POST",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh-Hans;q=0.9",
      "Accept-Encoding": "identity",
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Site": "same-origin",
      Origin: "https://qiandao.sjtu.edu.cn",
      Referer: "https://qiandao.sjtu.edu.cn/visitor/",
      Priority: "u=0, i",
      "User-Agent": userAgent,
      Cookie: cookieHeader,
    },
  };
  try {
    
  } catch (error) {
    
  }

  let postResponse;
  try {
    postResponse = await httpRequest(postOptions, body);
  } catch (error) {
    logError("POST 请求失败", error, {
      hostname: postOptions.hostname,
      path: postOptions.path,
      payloadPreview: body.slice(0, 200),
    });
    throw error;
  }
  const responseText = postResponse.body.toString("utf8");

  console.log("POST status:", postResponse.statusCode);
  console.log("POST response body:");
  console.log(responseText);

  return {
    getStatus: getResponse.statusCode ?? 0,
    postStatus: postResponse.statusCode ?? 0,
    bodySnippet: responseText.slice(0, 500)
  };
}

async function notifySuccess(result) {
  const content = [
    `GET 状态码：${result.getStatus}`,
    `POST 状态码：${result.postStatus}`,
    "",
    "响应片段：",
    result.bodySnippet
  ].join("\n");

  await notificationKit.pushMessage({
    title: "访客预约脚本执行成功",
    content
  });
}

async function notifyFailure(error) {
  const message = error?.stack ?? error?.message ?? String(error);
  await notificationKit.pushMessage({
    title: "访客预约脚本执行失败",
    content: message
  });
}

main()
  .then(async (result) => {
    await notifySuccess(result);
  })
  .catch(async (error) => {
    console.error("请求过程出现异常：", error);
    await notifyFailure(error);
    process.exitCode = 1;
  });


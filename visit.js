import https from 'node:https';
import { URLSearchParams } from 'node:url';
import notificationKit from './notification-kit.js';

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
      2
    )
  );
}

/**
 * 发起 HTTPS 请求并返回响应信息。
 */
function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });

    req.on('error', (error) => {
      logError('httpRequest', error, {
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
    const [pair] = header.split(';');
    if (!pair) continue;
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) continue;
    const name = pair.slice(0, eqIndex).trim();
    const value = pair.slice(eqIndex + 1).trim();
    if (name) {
      cookieJar[name] = value;
    }
  }

  return cookieJar;
}

function buildCookieHeader(cookies = {}) {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

async function main() {
  const userAgent =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.65(0x1800412a) NetType/WIFI Language/zh_CN';
  const status = {
    firstGet: 0,
    secondGet: 0,
    post: 0,
  };

  // Step 1: 先访问 /visitor/?xq=mh，拿到 VISITOR 等关键 Cookie
  const firstGetOptions = {
    hostname: 'qiandao.sjtu.edu.cn',
    path: '/visitor/?xq=mh',
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
      'Accept-Encoding': 'identity',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Site': 'none',
      Priority: 'u=0, i',
      'User-Agent': userAgent,
    },
  };

  let firstResponse;
  try {
    firstResponse = await httpRequest(firstGetOptions);
  } catch (error) {
    logError('首次 GET (/visitor/?xq=mh) 请求失败', error, {
      hostname: firstGetOptions.hostname,
      path: firstGetOptions.path,
    });
    throw error;
  }
  const cookies = parseCookies(firstResponse.headers['set-cookie']);
  status.firstGet = firstResponse.statusCode ?? 0;

  if (!cookies.VISITOR) {
    console.warn('警告：首次访问未获取到 VISITOR Cookie。');
  }

  // Step 2: 带上 VISITOR 再访问 /visitor/，解析页面中的 ik
  const secondGetOptions = {
    hostname: 'qiandao.sjtu.edu.cn',
    path: '/visitor/',
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
      'Accept-Encoding': 'identity',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Site': 'none',
      Priority: 'u=0, i',
      'User-Agent': userAgent,
      ...(Object.keys(cookies).length ? { Cookie: buildCookieHeader(cookies) } : {}),
    },
  };

  let secondResponse;
  try {
    secondResponse = await httpRequest(secondGetOptions);
  } catch (error) {
    logError('二次 GET (/visitor/) 请求失败', error, {
      hostname: secondGetOptions.hostname,
      path: secondGetOptions.path,
    });
    throw error;
  }

  status.secondGet = secondResponse.statusCode ?? 0;

  const secondHtml = secondResponse.body.toString('utf8');
  const ikFromDocumentCookie =
    secondHtml.match(/document\.cookie\s*=\s*['"]ik=([^'";]+)['"]/i)?.[1] ?? null;
  if (ikFromDocumentCookie) {
    cookies.ik = ikFromDocumentCookie;
    console.log('ik extracted from document.cookie assignment:', ikFromDocumentCookie);
  } else if (!cookies.ik) {
    console.warn('未能从 document.cookie 语句中解析出 ik。');
  }

  if (!cookies.ik || !cookies.VISITOR) {
    throw new Error('未获取到预期的 ik 或 VISITOR Cookie。');
  }

  // Step 3: POST 请求，携带相同 Cookie 与表单数据
  const shanghaiOffsetMinutes = 8 * 60;
  const now = new Date();
  const utcMillis = now.getUTCHours() * 60 * 60 * 1000 + now.getUTCMinutes() * 60 * 1000;
  const shanghaiMillis = utcMillis + shanghaiOffsetMinutes * 60 * 1000;
  const shanghaiHours = new Date(shanghaiMillis).getUTCHours();
  const timePeriod = shanghaiHours < 12 ? '1' : '2';

  console.log(cookies, 'cookies*****');

  const formData = new URLSearchParams({
    campus: '闵行校区',
    time: timePeriod,
    xm: '马俊',
    zjhm: '500223198808188713',
    phone: '18782180597',
  });
  const body = formData.toString();

  const postOptions = {
    hostname: 'qiandao.sjtu.edu.cn',
    path: '/visitor/submit.php',
    method: 'POST',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
      'Accept-Encoding': 'identity',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Site': 'same-origin',
      Origin: 'https://qiandao.sjtu.edu.cn',
      Referer: 'https://qiandao.sjtu.edu.cn/visitor/',
      Priority: 'u=0, i',
      'User-Agent': userAgent,
      Cookie: buildCookieHeader(cookies),
    },
  };

  let postResponse;
  try {
    postResponse = await httpRequest(postOptions, body);
  } catch (error) {
    logError('POST 请求失败', error, {
      hostname: postOptions.hostname,
      path: postOptions.path,
      payloadPreview: body.slice(0, 200),
    });
    throw error;
  }
  const responseText = postResponse.body.toString('utf8') || '测试 body';
  status.post = postResponse.statusCode ?? 0;

  // console.log(responseText, 'responseText*****');
  // const responseText = '测试 body';

  return {
    ...status,
    bodySnippet: responseText,
  };
}

async function notifySuccess(result) {
  const content = ['响应片段：', result.bodySnippet].join('\n');

  await notificationKit.pushMessage({
    title: '访客预约脚本执行成功',
    content,
  });
}

async function notifyFailure(error) {
  const message = error?.stack ?? error?.message ?? String(error);
  await notificationKit.pushMessage({
    title: '访客预约脚本执行失败',
    content: message,
  });
}

main()
  .then(async (result) => {
    console.log(result, 'result*****');
    await notifySuccess(result);
  })
  .catch(async (error) => {
    console.error('请求过程出现异常：', error);
    await notifyFailure(error);
    process.exitCode = 1;
  });

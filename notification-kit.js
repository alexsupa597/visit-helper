import nodemailer from "nodemailer";
import axios from "axios";
import pkg from "./package.json" with { type: "json" };

const env = {
  EMAIL_USER: process.env.EMAIL_USER ?? "ma82180597@163.com",
  EMAIL_PASS: process.env.EMAIL_PASS ?? "MDTJMztHTy4CZx4Q",
  EMAIL_TO: process.env.EMAIL_TO ?? "ma82180597@163.com",
  DINGDING_WEBHOOK: process.env.DINGDING_WEBHOOK ?? ""
};

class NotificationKit {
  newVersion = {
    has: false,
    name: pkg.version,
    url: pkg.homepage ?? ""
  };

  async email(options) {
    const user = env.EMAIL_USER;
    const pass = env.EMAIL_PASS;
    const to = env.EMAIL_TO;

    if (!user || !pass || !to) {
      throw new Error("未配置邮箱账户/密码/收件人。");
    }

    const domain = user.match(/@(.*)/)?.[1];
    if (!domain) {
      throw new Error("邮箱格式不正确，缺少域名。");
    }

    const transporter = nodemailer.createTransport({
      host: `smtp.${domain}`,
      port: 465,
      secure: true,
      auth: {
        user,
        pass
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const body =
      options.msgtype === "html"
        ? options.content
        : `<pre style="margin:0;font-family:Menlo,Consolas,monospace;">${options.content}</pre>`;

    const template = `
<section style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f8f9fb;padding:24px;">
  <header style="border-bottom:1px solid #e5e7eb;padding-bottom:12px;margin-bottom:16px;">
    <strong style="font-size:16px;color:#111827;">Visit Helper</strong>
  </header>
  ${this.newVersion.has ? `<a href="${this.newVersion.url}" target="_blank" style="display:block;background:#fff4e5;color:#92400e;padding:8px 12px;border-radius:6px;text-decoration:none;margin-bottom:16px;font-size:13px;">
    发现新版本 ${this.newVersion.name}，点击查看 ›
  </a>` : ""}
  <main style="background:#fff;padding:16px;border-radius:8px;border:1px solid #e5e7eb;color:#111827;">
    ${body}
  </main>
  <footer style="font-size:12px;color:#6b7280;margin-top:16px;">
    Visit Helper v${pkg.version} · ${new Date().getFullYear()}
  </footer>
</section>
`.trim();

    await transporter.sendMail({
      from: `Visit Helper <${user}>`,
      to,
      subject: options.title,
      html: template
    });
  }

  async dingtalkWebhook(options) {
    if (!env.DINGDING_WEBHOOK) {
      throw new Error("未配置钉钉 Webhook。");
    }

    await axios.post(env.DINGDING_WEBHOOK, {
      msgtype: "text",
      text: {
        content: `${options.title}\n${options.content}`
      }
    });
  }

  async checkUpdate() {
    if (!pkg.releases_url) {
      return;
    }
    try {
      const result = await axios.get(pkg.releases_url, {
        headers: {
          "User-Agent": "visit-helper"
        }
      });
      const latest = Array.isArray(result.data) ? result.data[0] : undefined;
      if (!latest?.tag_name) {
        return;
      }

      const currentVersion = (pkg.version ?? "0.0.0").replace(/^v/, "");
      const latestVersion = latest.tag_name.replace(/^v/, "");

      this.newVersion.has = this.#compareSemver(currentVersion, latestVersion) < 0;
      this.newVersion.name = latest.tag_name;
      this.newVersion.url = latest.html_url ?? pkg.homepage ?? "";
    } catch {
      // 忽略版本检查失败
    }
  }

  #compareSemver(a, b) {
    const parse = (v) => v.split(".").map((n) => parseInt(n, 10) || 0);
    const [a1, a2, a3] = parse(a);
    const [b1, b2, b3] = parse(b);
    if (a1 !== b1) return a1 - b1;
    if (a2 !== b2) return a2 - b2;
    if (a3 !== b3) return a3 - b3;
    return 0;
  }

  async pushMessage(options) {
    const { title, content, msgtype = "text" } = options;
    // await this.checkUpdate();

    const tryNotify = async (label, action) => {
      try {
        await action({ title, content, msgtype });
        await axios.get(`https://sctapi.ftqq.com/SCT303302TBGGvJCpTuYAoXB5GUeH6c1Nu.send?title=${title}&desp=${content}`);
        
        console.log(`[${label}] 消息推送成功`);
      } catch (error) {
        console.warn(
          `[${label}] 消息推送失败: ${(error && error.message) || error}`
        );
      }
    };

    await tryNotify("邮件", this.email.bind(this));
    // await tryNotify("钉钉", this.dingtalkWebhook.bind(this));
  }
}

const notificationKit = new NotificationKit();

export default notificationKit;

/**
 * Clash Verge Rev 全局扩展脚本
 *
 * 功能：
 * 1. 链式代理：本机 -> 机场前置节点 -> 美国住宅代理 -> 目标网站。
 * 2. 使用 Loyalsoldier 规则分流：国内/局域网直连、广告拦截、国外流量走最终出口。
 * 3. 保留订阅中的机场节点、proxy-providers 和原有代理组。
 *
 * 使用前只需修改下面“住宅代理参数”中的 server、username、password。
 * 密码不要发到聊天或上传到网盘，泄露过就去服务商后台换一个新的。
 */

// ==================== 住宅代理参数 ====================
const RES_SERVER = "请在这里填写住宅代理IP";
const RES_PORT = 5432;
const RES_USER = "请在这里填写用户名";
const RES_PASS = "请在这里填写密码";

// 住宅代理协议："socks5" 或 "http"。
// 带账号密码的 SOCKS5 每建一条新连接要和住宅服务器来回 3 次（打招呼、认证、连接），
// HTTP 代理把认证和连接合在一个请求里，只来回 1 次。链式代理每次来回都要绕机场一圈，
// 服务商如果同一端口也支持 HTTP，改成 "http" 打开网页会明显快。HTTP 不支持 UDP。
const RES_TYPE = "socks5";
const RES_NAME =
  RES_TYPE === "http" ? "US-Residential-HTTP" : "US-Residential-SOCKS5";

// ==================== 可选开关 ====================
// 拦截 QUIC（UDP 443），浏览器会马上改用 TCP。
// 住宅代理大多不支持或跑不好 UDP，链式下 QUIC 要等超时才回落，YouTube、Google 最明显。
const BLOCK_QUIC = true;

// 用脚本内置 DNS（fake-ip + 阿里/腾讯 DoH）替换订阅自带的 DNS。
// Clash Verge Rev 设置里开了“DNS 覆写”时，以那边为准，这里不生效。
const OVERRIDE_DNS = true;

// 域名嗅探：TUN 模式下浏览器自带 DoH、App 直接连 IP 时，也能还原域名按规则分流，
// 国内网站不会因为认不出来被送去美国住宅绕一圈。
const ENABLE_SNIFFER = true;

// ==================== 代理组名称 ====================
const FRONT_GROUP = "① 机场前置节点";
const FRONT_AUTO_GROUP = "① 前置自动选择";
const LANDING_GROUP = "② 美国住宅IP落地";
const OUT_GROUP = "③ 最终出口";

// 订阅里“剩余流量”“套餐到期”“官网”这类信息节点，不能当前置用。
const INFO_NODE_KEYWORDS =
  "剩余|到期|过期|官网|网址|套餐|expire|traffic|remaining";
const TEST_URL = "https://www.gstatic.com/generate_204";

// ==================== Loyalsoldier 规则集 ====================
// 规则集经机场前置节点下载，不走住宅，也不依赖国内直连 jsDelivr 是否通畅。
// 规则集拉不下来时，国内网站会全部落到 MATCH 去美国住宅绕一圈，是最常见的“突然变慢”。
const RULE_BASE_URL =
  "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/";

function loyalsoldier(name, behavior) {
  return {
    type: "http",
    behavior: behavior,
    format: "yaml",
    url: RULE_BASE_URL + name + ".txt",
    path: "./ruleset/loyalsoldier/" + name + ".yaml",
    interval: 86400,
    proxy: FRONT_GROUP,
  };
}

const loyalsoldierProviders = {
  ls_reject: loyalsoldier("reject", "domain"),
  ls_icloud: loyalsoldier("icloud", "domain"),
  ls_apple: loyalsoldier("apple", "domain"),
  ls_google: loyalsoldier("google", "domain"),
  ls_proxy: loyalsoldier("proxy", "domain"),
  ls_direct: loyalsoldier("direct", "domain"),
  ls_private: loyalsoldier("private", "domain"),
  ls_telegramcidr: loyalsoldier("telegramcidr", "ipcidr"),
  ls_cncidr: loyalsoldier("cncidr", "ipcidr"),
  ls_lancidr: loyalsoldier("lancidr", "ipcidr"),
  ls_applications: loyalsoldier("applications", "classical"),
};

// ==================== DNS 与嗅探 ====================
// fake-ip 模式下这些域名返回真实 IP：局域网、Windows 联网检测、QQ/微信快捷登录、
// STUN 打洞、时间同步、游戏主机联机。
const FAKE_IP_FILTER = [
  "+.lan",
  "+.local",
  "+.home.arpa",
  "+.msftconnecttest.com",
  "+.msftncsi.com",
  "localhost.ptlogin2.qq.com",
  "localhost.sec.qq.com",
  "localhost.work.weixin.qq.com",
  "+.stun.*.*",
  "+.stun.*.*.*",
  "+.stun.*.*.*.*",
  "time.*.com",
  "ntp.*.com",
  "+.pool.ntp.org",
  "+.market.xiaomi.com",
  "+.srv.nintendo.net",
  "+.stun.playstation.net",
  "xbox.*.microsoft.com",
  "+.xboxlive.com",
];

function buildDns(oldDns) {
  // DoH 直接写 IP，省掉一次引导解析。
  // 走代理的域名不在本地解析，交给美国住宅那头解析：不漏 DNS，也能拿到美国的 CDN 节点。
  const domesticDoh = [
    "https://223.5.5.5/dns-query",
    "https://1.12.12.12/dns-query",
  ];
  const dns = {
    enable: true,
    ipv6: false,
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.18.0.1/16",
    "fake-ip-filter": FAKE_IP_FILTER,
    "default-nameserver": ["223.5.5.5", "119.29.29.29"],
    nameserver: domesticDoh,
    "proxy-server-nameserver": domesticDoh,
  };
  // 保留订阅原来的 DNS 监听地址
  if (oldDns && typeof oldDns === "object" && oldDns.listen) {
    dns.listen = oldDns.listen;
  }
  return dns;
}

const SNIFFER = {
  enable: true,
  "force-dns-mapping": true,
  "parse-pure-ip": true,
  "override-destination": true,
  sniff: {
    HTTP: { ports: ["80", "8080-8880"], "override-destination": true },
    TLS: { ports: ["443", "8443"] },
    QUIC: { ports: ["443", "8443"] },
  },
  "skip-domain": ["Mijia Cloud", "+.push.apple.com"],
};

function containsPlaceholder(value) {
  return (
    typeof value !== "string" ||
    value.length === 0 ||
    value.indexOf("请在这里填写") !== -1
  );
}

function main(config) {
  config = config || {};

  if (
    containsPlaceholder(RES_SERVER) ||
    containsPlaceholder(RES_USER) ||
    containsPlaceholder(RES_PASS)
  ) {
    throw new Error("请先填写住宅代理的 server、username 和 password");
  }

  if (!Number.isInteger(RES_PORT) || RES_PORT < 1 || RES_PORT > 65535) {
    throw new Error("住宅代理端口 RES_PORT 不正确");
  }

  if (RES_TYPE !== "socks5" && RES_TYPE !== "http") {
    throw new Error('RES_TYPE 只能填 "socks5" 或 "http"');
  }

  const originalProxies = Array.isArray(config.proxies) ? config.proxies : [];
  const originalGroups = Array.isArray(config["proxy-groups"])
    ? config["proxy-groups"]
    : [];

  // 清除旧版本脚本可能注入过的住宅节点，避免重复。
  const injectedProxyNames = [
    RES_NAME,
    "US-Residential-HTTP",
    "US-Residential-HTTPS",
    "US-Residential-SOCKS5",
    "US-Static-Residential",
    "US-Static-Residential-HTTP",
    "US-Static-Residential-HTTPS",
    "US-Static-Residential-SOCKS5",
  ];

  config.proxies = originalProxies.filter(function (proxy) {
    return (
      proxy &&
      proxy.name &&
      injectedProxyNames.indexOf(proxy.name) === -1
    );
  });

  // 读取订阅中的真实机场节点。
  const airportNodes = [];
  config.proxies.forEach(function (proxy) {
    if (airportNodes.indexOf(proxy.name) === -1) {
      airportNodes.push(proxy.name);
    }
  });

  // 同时兼容使用 proxy-providers 的机场订阅。
  const providerNames =
    config["proxy-providers"] &&
    typeof config["proxy-providers"] === "object"
      ? Object.keys(config["proxy-providers"])
      : [];

  if (airportNodes.length === 0 && providerNames.length === 0) {
    throw new Error("当前订阅中没有找到机场节点或 proxy-providers");
  }

  // 去掉信息节点；订阅里全是信息节点又没有 provider 时，退回原列表。
  const infoNodeRegex = new RegExp(INFO_NODE_KEYWORDS, "i");
  let frontNodes = airportNodes.filter(function (name) {
    return !infoNodeRegex.test(name);
  });
  if (frontNodes.length === 0 && providerNames.length === 0) {
    frontNodes = airportNodes;
  }

  // 住宅节点通过 FRONT_GROUP 拨号，链路是：
  // 本机 -> 机场节点 -> 美国住宅代理 -> 目标网站。
  const residential = {
    name: RES_NAME,
    type: RES_TYPE,
    server: RES_SERVER,
    port: RES_PORT,
    username: RES_USER,
    password: RES_PASS,
    "dialer-proxy": FRONT_GROUP,
  };
  if (RES_TYPE === "socks5") {
    residential.udp = true;
  }
  config.proxies.push(residential);

  // 自动测速只换中间那一跳，出口始终是同一个住宅 IP；
  // 当前机场节点掉线时自动换下一个，不用手动去点。
  const frontAutoGroup = {
    name: FRONT_AUTO_GROUP,
    type: "url-test",
    url: TEST_URL,
    interval: 300,
    tolerance: 50,
    lazy: true,
  };

  const frontGroup = {
    name: FRONT_GROUP,
    type: "select",
    proxies: [FRONT_AUTO_GROUP].concat(frontNodes),
  };

  if (frontNodes.length > 0) {
    frontAutoGroup.proxies = frontNodes;
  }
  if (providerNames.length > 0) {
    [frontAutoGroup, frontGroup].forEach(function (group) {
      group.use = providerNames;
      group["exclude-filter"] = "(?i)" + INFO_NODE_KEYWORDS;
    });
  }

  const landingGroup = {
    name: LANDING_GROUP,
    type: "select",
    proxies: [RES_NAME],
  };

  const outGroup = {
    name: OUT_GROUP,
    type: "select",
    // 默认第一项为住宅落地；也可以手动临时切换为普通机场或直连。
    proxies: [LANDING_GROUP, FRONT_GROUP, "DIRECT"],
  };

  // 更新核心组，同时保留订阅原有代理组，不破坏机场自带功能。
  const coreGroupNames = [
    FRONT_GROUP,
    FRONT_AUTO_GROUP,
    LANDING_GROUP,
    OUT_GROUP,
  ];
  const keptOriginalGroups = originalGroups.filter(function (group) {
    return (
      group &&
      group.name &&
      coreGroupNames.indexOf(group.name) === -1
    );
  });

  // 分流已经不经过订阅自带的组，测速类的组改成用到时才测，免得在后台反复测几十上百个节点。
  keptOriginalGroups.forEach(function (group) {
    if (
      group.type === "url-test" ||
      group.type === "fallback" ||
      group.type === "load-balance"
    ) {
      group.lazy = true;
    }
  });

  config["proxy-groups"] = [
    frontGroup,
    frontAutoGroup,
    landingGroup,
    outGroup,
    ...keptOriginalGroups,
  ];

  // 用 ls_ 前缀避免覆盖订阅中已有的同名规则集。
  config["rule-providers"] = {
    ...(config["rule-providers"] || {}),
    ...loyalsoldierProviders,
  };

  // 分流逻辑：
  // 国内/局域网/常见下载软件 -> DIRECT
  // 广告 -> REJECT
  // 国外及未匹配流量 -> ③最终出口
  const rules = [
    "RULE-SET,ls_applications,DIRECT",
    "RULE-SET,ls_private,DIRECT",
    "RULE-SET,ls_reject,REJECT",
    "RULE-SET,ls_icloud,DIRECT",
    "RULE-SET,ls_apple,DIRECT",
  ];
  if (BLOCK_QUIC) {
    rules.push("AND,((NETWORK,UDP),(DST-PORT,443)),REJECT");
  }
  rules.push(
    `RULE-SET,ls_google,${OUT_GROUP}`,
    `RULE-SET,ls_proxy,${OUT_GROUP}`,
    "RULE-SET,ls_direct,DIRECT",
    "RULE-SET,ls_lancidr,DIRECT,no-resolve",
    "RULE-SET,ls_cncidr,DIRECT,no-resolve",
    `RULE-SET,ls_telegramcidr,${OUT_GROUP},no-resolve`,
    "GEOIP,LAN,DIRECT,no-resolve",
    "GEOIP,CN,DIRECT,no-resolve",
    `MATCH,${OUT_GROUP}`
  );
  config.rules = rules;

  config.mode = "rule";
  config["allow-lan"] = false;
  config.ipv6 = false;

  // 域名解析出多个 IP 时同时发起连接，用最先连通的那个，直连和连机场节点都更快。
  config["tcp-concurrent"] = true;
  // 延迟测试只计一次往返，不同协议的节点可以直接比较，自动选择更准。
  config["unified-delay"] = true;
  // 重启后保留手动选过的节点和 fake-ip 映射，避免重启后部分 App 断网。
  config.profile = {
    ...(config.profile || {}),
    "store-selected": true,
    "store-fake-ip": true,
  };

  if (OVERRIDE_DNS) {
    config.dns = buildDns(config.dns);
  } else if (config.dns && typeof config.dns === "object") {
    config.dns.ipv6 = false;
  }

  if (ENABLE_SNIFFER) {
    config.sniffer = SNIFFER;
  }

  console.log("住宅落地链式代理与 Loyalsoldier 分流已启用");
  return config;
}

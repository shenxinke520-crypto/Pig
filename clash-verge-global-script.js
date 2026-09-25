/**
 * Clash Verge Rev 全局扩展脚本
 *
 * 功能：
 * 1. 保留“机场前置 -> 美国住宅 SOCKS5 落地”的链式代理。
 * 2. 使用 Loyalsoldier 规则进行分流：国内/局域网直连、广告拦截、国外流量走最终出口。
 * 3. 保留订阅中的机场节点、proxy-providers 和原有代理组。
 *
 * 使用前只修改下面“住宅代理参数”中的 3 项：server、username、password。
 * 请使用更换后的新密码，不要再次把密码发到聊天或上传到网盘。
 */

// ==================== 住宅代理参数 ====================
const RES_NAME = "US-Residential-SOCKS5";
const RES_SERVER = "请在这里填写住宅代理IP";
const RES_PORT = 443;
const RES_USER = "请在这里填写用户名";
const RES_PASS = "请在这里填写密码";

// ==================== 核心代理组名称 ====================
const FRONT_GROUP = "① 机场前置节点";
const FRONT_AUTO_GROUP = "① 前置自动测速";
const LANDING_GROUP = "② 美国住宅IP落地";
const OUT_GROUP = "③ 最终出口";

// 住宅 IP 在美国，前置优先用美国节点：第二跳“机场 -> 住宅”留在美国境内，
// 整条链路的往返时间最短。SOCKS5 每个新连接要在整条链路上来回好几次，
// 这段延迟会被放大好几倍。
const US_NODE_RE =
  /美国|美國|🇺🇸|United\s*States|洛杉矶|圣何塞|硅谷|西雅图|纽约|芝加哥|达拉斯|凤凰城|Los\s*Angeles|San\s*Jose|Seattle|New\s*York|Chicago|Dallas|(^|[^A-Za-z])USA?(?![A-Za-z])/i;

// 订阅里“剩余流量 / 到期时间 / 官网”这类信息节点，连不上，不能参与测速。
const INFO_NODE_RE =
  /剩余|到期|过期|套餐|官网|网址|重置|有效期|客服|traffic|expire|reset/i;

// ==================== Loyalsoldier 规则集 ====================
const ruleProviderCommon = {
  type: "http",
  format: "yaml",
  interval: 86400,
};

const loyalsoldierProviders = {
  ls_reject: {
    ...ruleProviderCommon,
    behavior: "domain",
    url: "https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/reject.txt",
    path: "./ruleset/loyalsoldier/reject.yaml",
  },
  ls_icloud: {
    ...ruleProviderCommon,
    behavior: "domain",
    url: "https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/icloud.txt",
    path: "./ruleset/loyalsoldier/icloud.yaml",
  },
  ls_apple: {
    ...ruleProviderCommon,
    behavior: "domain",
    url: "https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/apple.txt",
    path: "./ruleset/loyalsoldier/apple.yaml",
  },
  ls_google: {
    ...ruleProviderCommon,
    behavior: "domain",
    url: "https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/google.txt",
    path: "./ruleset/loyalsoldier/google.yaml",
  },
  ls_proxy: {
    ...ruleProviderCommon,
    behavior: "domain",
    url: "https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/proxy.txt",
    path: "./ruleset/loyalsoldier/proxy.yaml",
  },
  ls_direct: {
    ...ruleProviderCommon,
    behavior: "domain",
    url: "https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/direct.txt",
    path: "./ruleset/loyalsoldier/direct.yaml",
  },
  ls_private: {
    ...ruleProviderCommon,
    behavior: "domain",
    url: "https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/private.txt",
    path: "./ruleset/loyalsoldier/private.yaml",
  },
  ls_telegramcidr: {
    ...ruleProviderCommon,
    behavior: "ipcidr",
    url: "https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/telegramcidr.txt",
    path: "./ruleset/loyalsoldier/telegramcidr.yaml",
  },
  ls_cncidr: {
    ...ruleProviderCommon,
    behavior: "ipcidr",
    url: "https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/cncidr.txt",
    path: "./ruleset/loyalsoldier/cncidr.yaml",
  },
  ls_lancidr: {
    ...ruleProviderCommon,
    behavior: "ipcidr",
    url: "https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/lancidr.txt",
    path: "./ruleset/loyalsoldier/lancidr.yaml",
  },
  ls_applications: {
    ...ruleProviderCommon,
    behavior: "classical",
    url: "https://fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/applications.txt",
    path: "./ruleset/loyalsoldier/applications.yaml",
  },
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
    if (proxy && proxy.name && airportNodes.indexOf(proxy.name) === -1) {
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

  // 住宅节点通过 FRONT_GROUP 拨号，因此链路是：
  // 本机 -> 机场节点 -> 美国住宅 SOCKS5 -> 目标网站。
  config.proxies.push({
    name: RES_NAME,
    type: "socks5",
    server: RES_SERVER,
    port: RES_PORT,
    username: RES_USER,
    password: RES_PASS,
    // 必须保持 true。关掉后内核会认为这条链路不支持 UDP，
    // UDP 流量会跳过 ③ 一路落到 DIRECT，用本机真实 IP 发出去。
    udp: true,
    "dialer-proxy": FRONT_GROUP,
  });

  // 前置自动测速：从美国节点里挑延迟最低的；没有美国节点就在全部可用节点里挑。
  // 切换前置只改变“住宅代理看到的来源”，目标网站看到的始终是住宅 IP。
  const usableNodes = airportNodes.filter(function (name) {
    return !INFO_NODE_RE.test(name);
  });
  const usNodes = usableNodes.filter(function (name) {
    return US_NODE_RE.test(name);
  });
  let autoNodes = usNodes.length > 0 ? usNodes : usableNodes;
  if (autoNodes.length === 0 && providerNames.length === 0) {
    autoNodes = airportNodes;
  }

  const frontAutoGroup = {
    name: FRONT_AUTO_GROUP,
    type: "url-test",
    url: "https://www.gstatic.com/generate_204",
    interval: 300,
    // 新节点要比当前节点快 50ms 以上才切换，避免来回抖动。
    tolerance: 50,
  };

  if (autoNodes.length > 0) {
    frontAutoGroup.proxies = autoNodes;
  } else {
    frontAutoGroup.use = providerNames;
    frontAutoGroup["exclude-filter"] = "(?i)" + INFO_NODE_RE.source;
  }

  const frontGroup = {
    name: FRONT_GROUP,
    type: "select",
    // 默认用自动测速；订阅第一个节点常是“剩余流量”这类假节点，
    // 直接默认选中它的话整条住宅链路都不通。
    proxies: [FRONT_AUTO_GROUP].concat(airportNodes),
  };

  if (providerNames.length > 0) {
    frontGroup.use = providerNames;
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
  // 国内/局域网/常见国内程序 -> DIRECT
  // 广告 -> REJECT
  // 国外及未匹配流量 -> ③最终出口
  //
  // 走 ③ 的 QUIC（UDP 443）直接拒绝，浏览器和 App 会立刻改用 TCP。
  // QUIC 要经过“机场 UDP -> SOCKS5 UDP 转发”两层，晚高峰机场 UDP 常被限速，
  // 住宅代理也未必支持 UDP，放行只会让浏览器先卡一会再回退。
  // 国内直连的 QUIC 不受影响。
  const QUIC = "(NETWORK,UDP),(DST-PORT,443)";

  config.rules = [
    "RULE-SET,ls_applications,DIRECT",
    "RULE-SET,ls_private,DIRECT",
    "RULE-SET,ls_reject,REJECT",
    "RULE-SET,ls_icloud,DIRECT",
    "RULE-SET,ls_apple,DIRECT",
    `AND,(${QUIC},(RULE-SET,ls_google)),REJECT`,
    `RULE-SET,ls_google,${OUT_GROUP}`,
    `AND,(${QUIC},(RULE-SET,ls_proxy)),REJECT`,
    `RULE-SET,ls_proxy,${OUT_GROUP}`,
    "RULE-SET,ls_direct,DIRECT",
    "RULE-SET,ls_lancidr,DIRECT,no-resolve",
    "RULE-SET,ls_cncidr,DIRECT,no-resolve",
    `RULE-SET,ls_telegramcidr,${OUT_GROUP},no-resolve`,
    "GEOIP,LAN,DIRECT,no-resolve",
    "GEOIP,CN,DIRECT,no-resolve",
    `AND,(${QUIC}),REJECT`,
    `MATCH,${OUT_GROUP}`,
  ];

  config.mode = "rule";
  config["allow-lan"] = false;
  config.ipv6 = false;

  // 不强制覆盖订阅原有 DNS，避免引入额外兼容性问题。
  if (config.dns && typeof config.dns === "object") {
    config.dns.ipv6 = false;
  }

  console.log("住宅落地链式代理与 Loyalsoldier 分流已启用");
  return config;
}

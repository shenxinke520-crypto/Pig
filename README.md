# Shadowrocket 机场分流配置（中国大陆）

给国内用户用的小火箭配置。思路很直白：国内的东西一律直连，境外的按业务拆开走不同节点，中间容易踩坑的地方（微信、银行、App Store、测速、游戏下载）单独拎出来固定直连。

## 文件

| 文件 | 说明 |
| --- | --- |
| `Shadowrocket-CN.conf` | 主配置，规则集走 GitHub raw |
| `Shadowrocket-CN-jsdelivr.conf` | 同一份配置，规则集换成 jsDelivr 镜像，国内裸连更新更稳 |

规则集来自 [blackmatrix7/ios_rule_script](https://github.com/blackmatrix7/ios_rule_script)，仓库里只放配置骨架，规则内容由小火箭在线拉取，跟着上游更新。

## 导入

1. 打开 Shadowrocket → 底部「配置」→ 右上角 `+`
2. URL 填下面任意一条：

```
https://raw.githubusercontent.com/shenxinke520-crypto/Pig/claude/ios-rocket-airport-rules-pzil57/Shadowrocket-CN.conf
https://raw.githubusercontent.com/shenxinke520-crypto/Pig/claude/ios-rocket-airport-rules-pzil57/Shadowrocket-CN-jsdelivr.conf
```

3. 下载完点一下配置名使其生效
4. 回到首页，确认机场订阅已经添加并更新过节点

配置里的策略组用正则从订阅里自动抓节点，换机场不用改配置。

上面链接里的 `claude/ios-rocket-airport-rules-pzil57` 是当前分支名，合并到 `main` 之后把这段换成 `main` 即可。

## 策略组

- **🚀 节点选择**：总开关，其它组默认跟着它
- **♻️ 自动选择**：延迟测速自动切，已排除「剩余流量 / 到期时间 / 官网」这类信息节点
- **🎯 全部节点**：手动切换，排查问题时用
- **🤖 AI 服务**：ChatGPT、Claude、Gemini、Copilot。这些对 IP 纯净度敏感，独立一组方便挑干净的落地
- **🎬 奈飞视频 / 🎥 国际媒体**：解锁节点专用
- **🍎 苹果服务 / Ⓜ️ 微软服务 / 🎮 游戏平台**：默认直连，需要时手动切代理
- **📺 哔哩哔哩**：默认直连，看港澳台番剧时切到香港或台湾
- **🛡️ 广告拦截**：默认 REJECT，误杀了就切 DIRECT
- **🇭🇰 🇹🇼 🇯🇵 🇸🇬 🇺🇸**：地区组，正则自动分类

## 分流的几个取舍

**App Store 和 iCloud 走直连。** 国区 CDN 就在境内，走代理只会更慢，还容易触发账号异地风控。

**微信、知乎这类国内应用强制直连，且排在规则最前面。** 一旦被后面的境外规则误伤走了代理，风控和验证码会很烦。

**Google FCM 推送单独直连。** 国产 App 里嵌的 FCM 走代理绕一圈反而更慢。

**Speedtest 直连。** 不然测的是机场带宽不是宽带带宽。

**Steam 默认直连。** 商店页面打不开时把「🎮 游戏平台」切到节点，下载时切回直连——走代理下载既慢又烧机场流量。

**关闭 IPv6。** 多数机场对 v6 支持不全，开着容易出现部分流量绕过代理。

**UDP 不支持时直接 REJECT。** 免得节点不支持 UDP 的时候流量悄悄裸奔出去。

## 自己改

**换更激进的广告规则**，把这行的 `AdvertisingLite/AdvertisingLite` 改成 `Advertising/Advertising`：

```
RULE-SET,.../rule/Shadowrocket/AdvertisingLite/AdvertisingLite.list,🛡️ 广告拦截
```

**加自己的直连域名**，写在 `[Rule]` 开头：

```
DOMAIN-SUFFIX,example.com,DIRECT
DOMAIN-KEYWORD,mycompany,DIRECT
IP-CIDR,203.0.113.0/24,DIRECT,no-resolve
```

**自己切换镜像源**：

```bash
sed 's#https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master#https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master#g' \
  Shadowrocket-CN.conf > my.conf
```

## 排查

- **某个网站打不开**：首页开日志，看它命中了哪条规则，再决定加直连还是加代理
- **规则集拉不下来**：换 jsDelivr 版本，或者先连上代理再刷新配置
- **节点没被地区组抓到**：机场节点名可能用了别的写法，在 `[Proxy Group]` 里对应地区的 `policy-regex-filter` 加上关键词
- **银行 App 报网络异常**：把域名加进开头的直连规则，或者临时关掉代理

---

# Clash Verge Rev 住宅 IP 链式代理脚本

`clash-verge-global-script.js`：机场节点做前置，美国住宅 SOCKS5 做落地，分流用 Loyalsoldier 规则。

## 用法

1. Clash Verge Rev → 订阅 → 右键「全局扩展脚本」→ 编辑，整段粘进去
2. 把开头 `RES_SERVER`、`RES_USER`、`RES_PASS` 三项换成自己的住宅代理信息
3. 保存后刷新一次订阅

仓库里的这份只放占位符，真实账号密码只填在本机，不要提交上来。

## 代理组

- **① 机场前置节点**：住宅代理经由它拨号。默认选「① 前置自动测速」，也可以手动固定某个节点
- **① 前置自动测速**：优先在美国节点里挑延迟最低的，没有美国节点就在全部节点里挑，信息节点不参与
- **② 美国住宅IP落地**：住宅 SOCKS5 节点
- **③ 最终出口**：国外流量的出口，默认走住宅落地，临时可以切到机场或直连

前置节点怎么换都不影响落地 IP，目标网站看到的始终是住宅 IP。

## 几个取舍

**前置优先美国节点。** 住宅 IP 在美国，前置也在美国的话，机场到住宅这一跳很短。SOCKS5 每建一个新连接要在整条链路上往返好几次，这一跳的延迟会被成倍放大。

**走住宅的 QUIC 直接拒绝。** QUIC 要经过机场 UDP 再套一层 SOCKS5 UDP 转发，晚高峰机场 UDP 常被限速，住宅代理也不一定支持 UDP。拒绝后浏览器立刻改用 TCP，不用先卡一会再回退。国内直连的 QUIC 不受影响。

**住宅节点的 `udp: true` 不能关。** 关掉后内核认为出口不支持 UDP，UDP 流量会跳过规则直接走 DIRECT，用本机 IP 发出去。

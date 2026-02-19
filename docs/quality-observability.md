# Sail 服务质量体系一期（Console）

本页面用于描述 console 侧质量观测视图的后端数据接入方式与标准化规则。

## 数据接口

console 通过以下接口获取 24h 稳定性、关键域名 TopN、失败原因分布。

```
GET /api/quality/observability?window=24h&bucket=1h&topN=10
```

- `window`: 时间窗口，当前固定为 `24h`。
- `bucket`: 采样粒度，当前固定为 `1h`。
- `topN`: TopN 数量，当前固定为 `10`。

### 返回结构（推荐）

```
{
  "window": "24h",
  "updatedAt": "2026-02-18T06:30:00Z",
  "stability": {
    "points": [
      {
        "timestamp": "2026-02-18T00:00:00Z",
        "total": 12000,
        "successRate": 99.2,
        "errorRate": 0.8,
        "p95LatencyMs": 180
      }
    ],
    "totalRequests": 288000,
    "avgSuccessRate": 99.1
  },
  "topDomains": [
    { "domain": "example.com", "count": 12000, "category": "allowed" }
  ],
  "failureReasons": [
    { "code": "DNS_TIMEOUT", "count": 40, "ratio": 0.18 }
  ]
}
```

## 失败原因标准化

前端会对失败原因做标准化展示，统一输出如下代码：

- `DNS_TIMEOUT`: DNS 查询超时
- `DNS_REFUSED`: DNS 拒绝
- `TLS_HANDSHAKE`: TLS 握手失败
- `CONNECT_TIMEOUT`: 建连超时
- `CONNECTION_RESET`: 连接被重置
- `BLOCKED_POLICY`: 策略拦截
- `AUTH_FAILED`: 鉴权失败
- `UPSTREAM_5XX`: 上游 5xx
- `UPSTREAM_4XX`: 上游 4xx
- `RATE_LIMITED`: 限流
- `UNKNOWN`: 其他/未知

后端可直接返回标准化 `code`，前端也支持常见别名自动归一，例如：

- `dns_query_timeout` → `DNS_TIMEOUT`
- `policy_blocked` → `BLOCKED_POLICY`
- `too_many_requests` → `RATE_LIMITED`

## 兼容策略

如果后端返回包裹结构（例如 `{ data: ... }`），前端会自动解包。
字段命名差异（如 `top_domains`、`failure_reasons`）也会被兼容处理。
数值字段允许返回字符串形式（如 `"99.2"`、`"12000"`），前端会自动解析为数值。

本地开发环境支持以下变量：

- `VITE_API_BASE_URL`：后端 API 基地址（默认空，表示同源）
- `VITE_QUALITY_MOCK_FALLBACK`：是否在接口错误时回退到内置 mock（默认 `true`，设为 `false` 可关闭）

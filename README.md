# toss-st-mcp

토스증권 Open API용 MCP 서버입니다.

공식 문서 기준 API 서버는 `https://openapi.tossinvest.com`이며, 모든 API는 OAuth 2.0 Client Credentials Grant로 발급받은 access token을 사용합니다. 계좌, 자산, 주문 관련 API는 `X-Tossinvest-Account` 헤더가 추가로 필요합니다.

## 설치 및 빌드

```bash
npm install
npm run build
npm test
```

## 환경 변수

```bash
TOSS_CLIENT_ID=발급받은_ID
TOSS_CLIENT_SECRET=발급받은_SECRET

# 선택. 생략하면 get_accounts의 첫 번째 accountSeq를 자동 사용합니다.
TOSS_ACCOUNT_SEQ=1
```

## 클라이언트 설정

API 키를 발급받은 후 사용하는 클라이언트 설정 파일에 아래를 추가하세요.

### Claude Code

`.claude/settings.json`:

```json
{
  "mcpServers": {
    "toss-securities": {
      "command": "node",
      "args": ["/Users/jh/Desktop/devs/26-1/toss-st/dist/index.js"],
      "env": {
        "TOSS_CLIENT_ID": "발급받은_ID",
        "TOSS_CLIENT_SECRET": "발급받은_SECRET",
        "TOSS_ACCOUNT_SEQ": "1"
      }
    }
  }
}
```

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "toss-securities": {
      "command": "node",
      "args": ["/Users/jh/Desktop/devs/26-1/toss-st/dist/index.js"],
      "env": {
        "TOSS_CLIENT_ID": "발급받은_ID",
        "TOSS_CLIENT_SECRET": "발급받은_SECRET",
        "TOSS_ACCOUNT_SEQ": "1"
      }
    }
  }
}
```

### Cursor

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "toss-securities": {
      "command": "node",
      "args": ["/Users/jh/Desktop/devs/26-1/toss-st/dist/index.js"],
      "env": {
        "TOSS_CLIENT_ID": "발급받은_ID",
        "TOSS_CLIENT_SECRET": "발급받은_SECRET",
        "TOSS_ACCOUNT_SEQ": "1"
      }
    }
  }
}
```

### Windsurf

`~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "toss-securities": {
      "command": "node",
      "args": ["/Users/jh/Desktop/devs/26-1/toss-st/dist/index.js"],
      "env": {
        "TOSS_CLIENT_ID": "발급받은_ID",
        "TOSS_CLIENT_SECRET": "발급받은_SECRET",
        "TOSS_ACCOUNT_SEQ": "1"
      }
    }
  }
}
```

### GPT Codex CLI

`~/.codex/config.toml`:

```toml
[mcp_servers.toss-securities]
command = "node"
args    = ["/Users/jh/Desktop/devs/26-1/toss-st/dist/index.js"]

[mcp_servers.toss-securities.env]
TOSS_CLIENT_ID     = "발급받은_ID"
TOSS_CLIENT_SECRET = "발급받은_SECRET"
TOSS_ACCOUNT_SEQ   = "1"
```

## npm 배포 후

`command`/`args`를 아래로 교체하면 별도 로컬 빌드 없이 사용할 수 있습니다.

```json
"command": "npx",
"args": ["-y", "toss-st-mcp"]
```

Codex는:

```toml
command = "npx"
args    = ["-y", "toss-st-mcp"]
```

## 지원 기능

### 계좌·자산

| Tool | 설명 |
|------|------|
| `get_accounts` | 계좌 목록 조회 |
| `get_holdings` | 보유 주식 및 평가 요약 조회 |

### 시세·종목·시장 정보

| Tool | 설명 |
|------|------|
| `get_orderbook` | 호가 조회 |
| `get_price` | 단일 종목 현재가 조회 |
| `get_prices` | 여러 종목 현재가 조회 |
| `get_trades` | 최근 체결 내역 조회 |
| `get_price_limit` | 상/하한가 조회 |
| `get_candles` | 1분봉/일봉 캔들 조회 |
| `get_stock_info` | 단일 종목 기본 정보 조회 |
| `get_stocks` | 여러 종목 기본 정보 조회 |
| `get_stock_warnings` | 매수 유의사항 조회 |
| `get_exchange_rate` | KRW/USD 환율 조회 |
| `get_kr_market_calendar` | 국내 장 운영 정보 조회 |
| `get_us_market_calendar` | 미국 장 운영 정보 조회 |

### 종합 조회·진단

| Tool | 설명 |
|------|------|
| `get_server_status` | 서버 설정 상태 확인. 자격증명 없이 호출 가능 |
| `get_api_coverage` | 공식 API 엔드포인트와 MCP tool 매핑 확인. 자격증명 없이 호출 가능 |
| `get_market_snapshot` | 여러 종목의 기본 정보·현재가와 선택 항목(warning/호가/체결) 동시 조회 |
| `get_symbol_summary` | 단일 종목의 기본 정보·현재가·warning·상/하한가·선택 항목 동시 조회 |
| `get_account_overview` | 계좌 목록·보유 자산·매수 가능 금액·수수료·대기 주문 동시 조회 |
| `check_order_readiness` | 실제 주문 없이 주문 전 종목/가격/가능수량/가능금액 점검 |
| `validate_order` | 실제 API 호출 없이 주문 입력값 검증 및 공식 요청 바디 변환 |

### 주문

주문 관련 tool은 실제 계좌에 영향을 줍니다. 1억원 이상 주문에는 `confirm_high_value_order: true`가 필요할 수 있습니다.

| Tool | 설명 |
|------|------|
| `place_order` | 공식 주문 생성 API 직접 호출 |
| `buy_market` | 시장가 매수 |
| `sell_market` | 시장가 매도 |
| `buy_limit` | 지정가 매수 |
| `sell_limit` | 지정가 매도 |
| `modify_order` | 미체결 주문 정정 |
| `cancel_order` | 미체결 주문 취소 |
| `get_orders` | 주문 목록 조회 (`OPEN`/`CLOSED`) |
| `get_open_orders` | 대기 중 주문 목록 조회 |
| `get_closed_orders` | 종료된 주문 목록 조회 |
| `get_order` | 주문 상세 조회 |
| `get_buying_power` | 매수 가능 금액 조회 |
| `get_sellable_quantity` | 판매 가능 수량 조회 |
| `get_commissions` | 매매 수수료 조회 |

## 공식 문서

- [토스증권 Open API 가이드](https://developers.tossinvest.com/docs)
- [LLM용 문서 안내](https://developers.tossinvest.com/llms.txt)

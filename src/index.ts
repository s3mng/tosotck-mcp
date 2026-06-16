import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { OrderCreateRequest, OrderListParams, OrderModifyRequest, TossClient } from "./client.js";

const clientId = process.env.TOSS_CLIENT_ID ?? "";
const clientSecret = process.env.TOSS_CLIENT_SECRET ?? "";
const defaultAccountSeq = process.env.TOSS_ACCOUNT_SEQ;
const toss = new TossClient(clientId, clientSecret, defaultAccountSeq);
const toolsWithoutAuth = new Set(["get_server_status", "get_api_coverage", "validate_order"]);

const server = new Server(
  { name: "toss-securities", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

const symbolProperty = {
  type: "string",
  description: "종목 심볼. KRX 6자리 숫자(예: 005930) 또는 US 티커(예: AAPL).",
  pattern: "^[A-Za-z0-9.\\-]+$",
};

const symbolsProperty = {
  anyOf: [
    {
      type: "array",
      items: symbolProperty,
      minItems: 1,
      maxItems: 200,
    },
    {
      type: "string",
      description: "콤마로 구분한 종목 심볼. 예: 005930,000660 또는 AAPL,MSFT",
      pattern: "^[A-Za-z0-9.,\\-]+$",
    },
  ],
};

const accountSeqProperty = {
  anyOf: [{ type: "integer" }, { type: "string", pattern: "^\\d+$" }],
  description: "사용할 accountSeq. 생략 시 TOSS_ACCOUNT_SEQ 또는 첫 번째 계좌를 사용합니다.",
};

const decimalProperty = {
  anyOf: [{ type: "number" }, { type: "string", pattern: "^\\d+(\\.\\d+)?$" }],
};

const integerQuantityProperty = {
  anyOf: [{ type: "integer", minimum: 1 }, { type: "string", pattern: "^\\d+$" }],
};

const commonOrderProperties = {
  account_seq: accountSeqProperty,
  client_order_id: {
    type: "string",
    maxLength: 36,
    pattern: "^[a-zA-Z0-9\\-_]+$",
    description: "멱등성용 클라이언트 주문 ID. 생략 시 멱등성이 적용되지 않습니다.",
  },
  confirm_high_value_order: {
    type: "boolean",
    description: "1억원 이상 주문임을 확인한 경우 true.",
  },
};

const tools = [
  {
    name: "get_accounts",
    description: "토스증권 계좌 목록을 조회합니다.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_holdings",
    description: "보유 주식과 계좌 전체 평가 요약을 조회합니다.",
    inputSchema: {
      type: "object",
      properties: {
        account_seq: accountSeqProperty,
        symbol: { ...symbolProperty, description: "선택. 지정 시 해당 종목만 조회합니다." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_orderbook",
    description: "종목 호가를 조회합니다.",
    inputSchema: {
      type: "object",
      properties: { symbol: symbolProperty },
      required: ["symbol"],
      additionalProperties: false,
    },
  },
  {
    name: "get_price",
    description: "단일 종목 현재가를 조회합니다.",
    inputSchema: {
      type: "object",
      properties: { symbol: symbolProperty },
      required: ["symbol"],
      additionalProperties: false,
    },
  },
  {
    name: "get_prices",
    description: "여러 종목 현재가를 한 번에 조회합니다. 최대 200개.",
    inputSchema: {
      type: "object",
      properties: { symbols: symbolsProperty },
      required: ["symbols"],
      additionalProperties: false,
    },
  },
  {
    name: "get_trades",
    description: "당일 최근 체결 내역을 조회합니다.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: symbolProperty,
        count: { type: "integer", minimum: 1, maximum: 50, default: 50 },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
  },
  {
    name: "get_price_limit",
    description: "종목 상/하한가를 조회합니다.",
    inputSchema: {
      type: "object",
      properties: { symbol: symbolProperty },
      required: ["symbol"],
      additionalProperties: false,
    },
  },
  {
    name: "get_candles",
    description: "1분봉 또는 일봉 캔들 차트를 조회합니다.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: symbolProperty,
        interval: { type: "string", enum: ["1m", "1d"], description: "봉 단위." },
        count: { type: "integer", minimum: 1, maximum: 200, default: 100 },
        before: { type: "string", format: "date-time", description: "이 시각 이전의 봉만 조회합니다." },
        adjusted: { type: "boolean", default: true, description: "수정주가 적용 여부." },
      },
      required: ["symbol", "interval"],
      additionalProperties: false,
    },
  },
  {
    name: "get_stock_info",
    description: "단일 종목 기본 정보를 조회합니다.",
    inputSchema: {
      type: "object",
      properties: { symbol: symbolProperty },
      required: ["symbol"],
      additionalProperties: false,
    },
  },
  {
    name: "get_stocks",
    description: "여러 종목 기본 정보를 한 번에 조회합니다. 최대 200개.",
    inputSchema: {
      type: "object",
      properties: { symbols: symbolsProperty },
      required: ["symbols"],
      additionalProperties: false,
    },
  },
  {
    name: "get_stock_warnings",
    description: "종목 매수 유의사항을 조회합니다.",
    inputSchema: {
      type: "object",
      properties: { symbol: symbolProperty },
      required: ["symbol"],
      additionalProperties: false,
    },
  },
  {
    name: "get_exchange_rate",
    description: "KRW/USD 환율을 조회합니다.",
    inputSchema: {
      type: "object",
      properties: {
        base_currency: { type: "string", enum: ["KRW", "USD"], description: "기준 통화." },
        quote_currency: { type: "string", enum: ["KRW", "USD"], description: "표시 통화." },
        date_time: { type: "string", format: "date-time", description: "선택. 특정 시점 ISO 8601." },
      },
      required: ["base_currency", "quote_currency"],
      additionalProperties: false,
    },
  },
  {
    name: "get_kr_market_calendar",
    description: "국내 장 운영 정보를 조회합니다.",
    inputSchema: {
      type: "object",
      properties: { date: { type: "string", format: "date", description: "선택. YYYY-MM-DD." } },
      additionalProperties: false,
    },
  },
  {
    name: "get_us_market_calendar",
    description: "미국 장 운영 정보를 조회합니다.",
    inputSchema: {
      type: "object",
      properties: { date: { type: "string", format: "date", description: "선택. 미국 현지 날짜 YYYY-MM-DD." } },
      additionalProperties: false,
    },
  },
  {
    name: "get_server_status",
    description: "MCP 서버 설정 상태와 문서 기준 커버리지를 확인합니다. 자격증명 없이 호출할 수 있습니다.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_api_coverage",
    description: "공식 토스증권 Open API 엔드포인트와 현재 MCP tool 매핑을 확인합니다. 자격증명 없이 호출할 수 있습니다.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_market_snapshot",
    description: "여러 종목의 기본 정보와 현재가를 한 번에 조회하고, 선택적으로 warning/호가/체결도 함께 조회합니다.",
    inputSchema: {
      type: "object",
      properties: {
        symbols: symbolsProperty,
        include_warnings: { type: "boolean", default: false },
        include_orderbook: { type: "boolean", default: false },
        include_trades: { type: "boolean", default: false },
        trades_count: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      },
      required: ["symbols"],
      additionalProperties: false,
    },
  },
  {
    name: "get_symbol_summary",
    description: "단일 종목의 기본 정보, 현재가, warning, 상/하한가를 한 번에 조회합니다.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: symbolProperty,
        include_orderbook: { type: "boolean", default: true },
        include_trades: { type: "boolean", default: true },
        trades_count: { type: "integer", minimum: 1, maximum: 50, default: 20 },
        include_candles: { type: "boolean", default: false },
        candle_interval: { type: "string", enum: ["1m", "1d"], default: "1d" },
        candle_count: { type: "integer", minimum: 1, maximum: 200, default: 30 },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
  },
  {
    name: "get_account_overview",
    description: "계좌 목록, 보유 자산, 매수 가능 금액, 수수료, 대기 주문을 한 번에 조회합니다.",
    inputSchema: {
      type: "object",
      properties: {
        account_seq: accountSeqProperty,
        symbol: { ...symbolProperty, description: "선택. 보유 자산과 주문을 해당 종목으로 필터링합니다." },
        include_buying_power: { type: "boolean", default: true },
        include_commissions: { type: "boolean", default: true },
        include_open_orders: { type: "boolean", default: true },
      },
      additionalProperties: false,
    },
  },
  {
    name: "check_order_readiness",
    description: "실제 주문 없이 종목 정보, 현재가, warning, 상/하한가, 매수/매도 가능 정보로 주문 전 점검을 합니다.",
    inputSchema: {
      type: "object",
      properties: {
        account_seq: accountSeqProperty,
        symbol: symbolProperty,
        side: { type: "string", enum: ["BUY", "SELL"] },
        order_type: { type: "string", enum: ["LIMIT", "MARKET"] },
        quantity: integerQuantityProperty,
        price: decimalProperty,
        order_amount: decimalProperty,
        time_in_force: { type: "string", enum: ["DAY", "CLS"], default: "DAY" },
        currency: { type: "string", enum: ["KRW", "USD"], description: "BUY 점검 시 매수 가능 금액 조회 통화. 생략 시 종목 정보에서 추정합니다." },
        confirm_high_value_order: { type: "boolean" },
      },
      required: ["symbol", "side", "order_type"],
      additionalProperties: false,
    },
  },
  {
    name: "validate_order",
    description: "실제 API 호출 없이 주문 입력값을 MCP 서버 로컬 규칙으로 검증하고 공식 API 요청 바디 형태로 변환합니다.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: symbolProperty,
        side: { type: "string", enum: ["BUY", "SELL"] },
        order_type: { type: "string", enum: ["LIMIT", "MARKET"] },
        time_in_force: { type: "string", enum: ["DAY", "CLS"], default: "DAY" },
        quantity: integerQuantityProperty,
        price: decimalProperty,
        order_amount: decimalProperty,
        client_order_id: commonOrderProperties.client_order_id,
        confirm_high_value_order: commonOrderProperties.confirm_high_value_order,
      },
      required: ["symbol", "side", "order_type"],
      additionalProperties: false,
    },
  },
  {
    name: "place_order",
    description: "공식 주문 생성 API를 그대로 호출합니다. 실제 매매 주문이 접수됩니다.",
    inputSchema: {
      type: "object",
      properties: {
        ...commonOrderProperties,
        symbol: symbolProperty,
        side: { type: "string", enum: ["BUY", "SELL"] },
        order_type: { type: "string", enum: ["LIMIT", "MARKET"] },
        time_in_force: { type: "string", enum: ["DAY", "CLS"], default: "DAY" },
        quantity: integerQuantityProperty,
        price: decimalProperty,
        order_amount: decimalProperty,
      },
      required: ["symbol", "side", "order_type"],
      additionalProperties: false,
    },
  },
  {
    name: "buy_market",
    description: "시장가 매수 주문을 넣습니다. 실제 매매 주문이 접수됩니다.",
    inputSchema: {
      type: "object",
      properties: {
        ...commonOrderProperties,
        symbol: symbolProperty,
        quantity: integerQuantityProperty,
      },
      required: ["symbol", "quantity"],
      additionalProperties: false,
    },
  },
  {
    name: "sell_market",
    description: "시장가 매도 주문을 넣습니다. 실제 매매 주문이 접수됩니다.",
    inputSchema: {
      type: "object",
      properties: {
        ...commonOrderProperties,
        symbol: symbolProperty,
        quantity: integerQuantityProperty,
      },
      required: ["symbol", "quantity"],
      additionalProperties: false,
    },
  },
  {
    name: "buy_limit",
    description: "지정가 매수 주문을 넣습니다. 실제 매매 주문이 접수됩니다.",
    inputSchema: {
      type: "object",
      properties: {
        ...commonOrderProperties,
        symbol: symbolProperty,
        quantity: integerQuantityProperty,
        price: decimalProperty,
        time_in_force: { type: "string", enum: ["DAY", "CLS"], default: "DAY" },
      },
      required: ["symbol", "quantity", "price"],
      additionalProperties: false,
    },
  },
  {
    name: "sell_limit",
    description: "지정가 매도 주문을 넣습니다. 실제 매매 주문이 접수됩니다.",
    inputSchema: {
      type: "object",
      properties: {
        ...commonOrderProperties,
        symbol: symbolProperty,
        quantity: integerQuantityProperty,
        price: decimalProperty,
        time_in_force: { type: "string", enum: ["DAY", "CLS"], default: "DAY" },
      },
      required: ["symbol", "quantity", "price"],
      additionalProperties: false,
    },
  },
  {
    name: "modify_order",
    description: "미체결 주문을 정정합니다. 실제 주문에 영향을 줍니다.",
    inputSchema: {
      type: "object",
      properties: {
        account_seq: accountSeqProperty,
        order_id: { type: "string", description: "정정할 주문 ID." },
        order_type: { type: "string", enum: ["LIMIT", "MARKET"] },
        quantity: integerQuantityProperty,
        price: decimalProperty,
        confirm_high_value_order: { type: "boolean" },
      },
      required: ["order_id", "order_type"],
      additionalProperties: false,
    },
  },
  {
    name: "cancel_order",
    description: "미체결 주문을 취소합니다. 실제 주문에 영향을 줍니다.",
    inputSchema: {
      type: "object",
      properties: {
        account_seq: accountSeqProperty,
        order_id: { type: "string", description: "취소할 주문 ID." },
      },
      required: ["order_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_orders",
    description: "주문 목록을 조회합니다. status는 OPEN 또는 CLOSED입니다.",
    inputSchema: {
      type: "object",
      properties: {
        account_seq: accountSeqProperty,
        status: { type: "string", enum: ["OPEN", "CLOSED"], default: "OPEN" },
        symbol: symbolProperty,
        from: { type: "string", format: "date", description: "조회 시작일 YYYY-MM-DD." },
        to: { type: "string", format: "date", description: "조회 종료일 YYYY-MM-DD." },
        cursor: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_open_orders",
    description: "대기 중 주문 목록을 조회합니다. get_orders(status=OPEN)의 간편 alias입니다.",
    inputSchema: {
      type: "object",
      properties: {
        account_seq: accountSeqProperty,
        symbol: symbolProperty,
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_closed_orders",
    description: "종료된 주문 목록을 조회합니다. get_orders(status=CLOSED)의 간편 alias입니다.",
    inputSchema: {
      type: "object",
      properties: {
        account_seq: accountSeqProperty,
        symbol: symbolProperty,
        from: { type: "string", format: "date", description: "조회 시작일 YYYY-MM-DD." },
        to: { type: "string", format: "date", description: "조회 종료일 YYYY-MM-DD." },
        cursor: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_order",
    description: "주문 상세를 조회합니다.",
    inputSchema: {
      type: "object",
      properties: {
        account_seq: accountSeqProperty,
        order_id: { type: "string", description: "조회할 주문 ID." },
      },
      required: ["order_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_buying_power",
    description: "현금 기반 매수 가능 금액을 조회합니다.",
    inputSchema: {
      type: "object",
      properties: {
        account_seq: accountSeqProperty,
        currency: { type: "string", enum: ["KRW", "USD"] },
      },
      required: ["currency"],
      additionalProperties: false,
    },
  },
  {
    name: "get_sellable_quantity",
    description: "종목별 판매 가능 수량을 조회합니다.",
    inputSchema: {
      type: "object",
      properties: {
        account_seq: accountSeqProperty,
        symbol: symbolProperty,
      },
      required: ["symbol"],
      additionalProperties: false,
    },
  },
  {
    name: "get_commissions",
    description: "시장별 매매 수수료율을 조회합니다.",
    inputSchema: {
      type: "object",
      properties: { account_seq: accountSeqProperty },
      additionalProperties: false,
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if ((!clientId || !clientSecret) && !toolsWithoutAuth.has(req.params.name)) {
    return {
      content: [{
        type: "text",
        text: "TOSS_CLIENT_ID 또는 TOSS_CLIENT_SECRET이 설정되지 않았습니다.\nMCP 설정의 env 블록에 키를 추가해주세요.",
      }],
    };
  }

  const args = (req.params.arguments ?? {}) as Record<string, unknown>;

  try {
    const result = await dispatch(req.params.name, args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `오류: ${err instanceof Error ? err.message : err}` }],
      isError: true,
    };
  }
});

async function dispatch(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "get_accounts":
      return toss.getAccounts();
    case "get_holdings":
      return toss.getHoldings({ accountSeq: accountSeq(args), symbol: optionalSymbol(args, "symbol") });
    case "get_orderbook":
      return toss.getOrderbook(requiredSymbol(args, "symbol"));
    case "get_price":
      return toss.getPrice(requiredSymbol(args, "symbol"));
    case "get_prices":
      return toss.getPrices(symbols(args));
    case "get_trades":
      return toss.getTrades(requiredSymbol(args, "symbol"), optionalInt(args, "count", { min: 1, max: 50 }));
    case "get_price_limit":
      return toss.getPriceLimit(requiredSymbol(args, "symbol"));
    case "get_candles":
      return toss.getCandles({
        symbol: requiredSymbol(args, "symbol"),
        interval: requiredEnum(args, "interval", ["1m", "1d"]),
        count: optionalInt(args, "count", { min: 1, max: 200 }),
        before: optionalString(args, "before"),
        adjusted: optionalBoolean(args, "adjusted"),
      });
    case "get_stock_info":
      return toss.getStockInfo(requiredSymbol(args, "symbol"));
    case "get_stocks":
      return toss.getStocks(symbols(args));
    case "get_stock_warnings":
      return toss.getStockWarnings(requiredSymbol(args, "symbol"));
    case "get_exchange_rate":
      return toss.getExchangeRate({
        baseCurrency: requiredEnum(args, "base_currency", ["KRW", "USD"]),
        quoteCurrency: requiredEnum(args, "quote_currency", ["KRW", "USD"]),
        dateTime: optionalString(args, "date_time"),
      });
    case "get_kr_market_calendar":
      return toss.getKrMarketCalendar(optionalString(args, "date"));
    case "get_us_market_calendar":
      return toss.getUsMarketCalendar(optionalString(args, "date"));
    case "get_server_status":
      return getServerStatus();
    case "get_api_coverage":
      return getApiCoverage();
    case "get_market_snapshot":
      return getMarketSnapshot(args);
    case "get_symbol_summary":
      return getSymbolSummary(args);
    case "get_account_overview":
      return getAccountOverview(args);
    case "check_order_readiness":
      return checkOrderReadiness(args);
    case "validate_order":
      return validateOrder(args);
    case "place_order":
      return toss.placeOrder(orderCreate(args), accountSeq(args));
    case "buy_market":
      return toss.placeOrder(simpleOrder(args, "BUY", "MARKET"), accountSeq(args));
    case "sell_market":
      return toss.placeOrder(simpleOrder(args, "SELL", "MARKET"), accountSeq(args));
    case "buy_limit":
      return toss.placeOrder(simpleOrder(args, "BUY", "LIMIT"), accountSeq(args));
    case "sell_limit":
      return toss.placeOrder(simpleOrder(args, "SELL", "LIMIT"), accountSeq(args));
    case "modify_order":
      return toss.modifyOrder(requiredString(args, "order_id", ["orderId"]), orderModify(args), accountSeq(args));
    case "cancel_order":
      return toss.cancelOrder(requiredString(args, "order_id", ["orderId"]), accountSeq(args));
    case "get_orders":
      return toss.getOrders(orderListParams(args), accountSeq(args));
    case "get_open_orders":
      return toss.getOrders({ status: "OPEN", symbol: optionalSymbol(args, "symbol") }, accountSeq(args));
    case "get_closed_orders":
      return toss.getOrders({ ...orderListParams(args), status: "CLOSED" }, accountSeq(args));
    case "get_order":
      return toss.getOrder(requiredString(args, "order_id", ["orderId"]), accountSeq(args));
    case "get_buying_power":
      return toss.getBuyingPower(requiredEnum(args, "currency", ["KRW", "USD"]), accountSeq(args));
    case "get_sellable_quantity":
      return toss.getSellableQuantity(requiredSymbol(args, "symbol"), accountSeq(args));
    case "get_commissions":
      return toss.getCommissions(accountSeq(args));
    default:
      throw new Error(`알 수 없는 tool: ${name}`);
  }
}

function getServerStatus(): unknown {
  return {
    name: "toss-securities",
    version: "0.1.0",
    docs: {
      guide: "https://developers.tossinvest.com/docs",
      openapi: "https://openapi.tossinvest.com/openapi-docs/latest/openapi.json",
    },
    env: {
      TOSS_CLIENT_ID: Boolean(clientId),
      TOSS_CLIENT_SECRET: Boolean(clientSecret),
      TOSS_ACCOUNT_SEQ: Boolean(defaultAccountSeq),
    },
    tools: {
      total: tools.length,
      authRequired: tools.length - toolsWithoutAuth.size,
      authNotRequired: Array.from(toolsWithoutAuth).sort(),
    },
  };
}

function getApiCoverage(): unknown {
  const officialEndpoints = [
    "POST /oauth2/token",
    "GET /api/v1/orderbook",
    "GET /api/v1/prices",
    "GET /api/v1/trades",
    "GET /api/v1/price-limits",
    "GET /api/v1/candles",
    "GET /api/v1/stocks",
    "GET /api/v1/stocks/{symbol}/warnings",
    "GET /api/v1/exchange-rate",
    "GET /api/v1/market-calendar/KR",
    "GET /api/v1/market-calendar/US",
    "GET /api/v1/accounts",
    "GET /api/v1/holdings",
    "POST /api/v1/orders",
    "POST /api/v1/orders/{orderId}/modify",
    "POST /api/v1/orders/{orderId}/cancel",
    "GET /api/v1/orders",
    "GET /api/v1/orders/{orderId}",
    "GET /api/v1/buying-power",
    "GET /api/v1/sellable-quantity",
    "GET /api/v1/commissions",
  ];

  return {
    officialEndpoints,
    implementedEndpointCoverage: "all documented REST endpoints are covered; /oauth2/token is used internally for authentication",
    lowLevelTools: [
      "get_accounts",
      "get_holdings",
      "get_orderbook",
      "get_price",
      "get_prices",
      "get_trades",
      "get_price_limit",
      "get_candles",
      "get_stock_info",
      "get_stocks",
      "get_stock_warnings",
      "get_exchange_rate",
      "get_kr_market_calendar",
      "get_us_market_calendar",
      "place_order",
      "modify_order",
      "cancel_order",
      "get_orders",
      "get_order",
      "get_buying_power",
      "get_sellable_quantity",
      "get_commissions",
    ],
    convenienceTools: [
      "buy_market",
      "sell_market",
      "buy_limit",
      "sell_limit",
      "get_open_orders",
      "get_closed_orders",
      "get_market_snapshot",
      "get_symbol_summary",
      "get_account_overview",
      "check_order_readiness",
      "validate_order",
    ],
  };
}

async function getMarketSnapshot(args: Record<string, unknown>): Promise<unknown> {
  const list = symbols(args);
  const includeWarnings = optionalBoolean(args, "include_warnings") ?? false;
  const includeOrderbook = optionalBoolean(args, "include_orderbook") ?? false;
  const includeTrades = optionalBoolean(args, "include_trades") ?? false;
  const tradesCount = optionalInt(args, "trades_count", { min: 1, max: 50 }) ?? 20;

  if ((includeWarnings || includeOrderbook || includeTrades) && list.length > 20) {
    throw new Error("warning/호가/체결 포함 조회는 rate limit 보호를 위해 symbols 20개 이하에서만 사용할 수 있습니다.");
  }

  const [stocks, prices] = await Promise.all([
    toss.getStocks(list),
    toss.getPrices(list),
  ]);

  const details = await Promise.all(list.map(async (symbol) => ({
    symbol,
    warnings: includeWarnings ? await toss.getStockWarnings(symbol) : undefined,
    orderbook: includeOrderbook ? await toss.getOrderbook(symbol) : undefined,
    trades: includeTrades ? await toss.getTrades(symbol, tradesCount) : undefined,
  })));

  return {
    symbols: list,
    stocks,
    prices,
    details: details.map(cleanResult),
  };
}

async function getSymbolSummary(args: Record<string, unknown>): Promise<unknown> {
  const symbol = requiredSymbol(args, "symbol");
  const includeOrderbook = optionalBoolean(args, "include_orderbook") ?? true;
  const includeTrades = optionalBoolean(args, "include_trades") ?? true;
  const includeCandles = optionalBoolean(args, "include_candles") ?? false;
  const tradesCount = optionalInt(args, "trades_count", { min: 1, max: 50 }) ?? 20;
  const candleInterval = optionalEnum(args, "candle_interval", ["1m", "1d"]) ?? "1d";
  const candleCount = optionalInt(args, "candle_count", { min: 1, max: 200 }) ?? 30;

  const [stockInfo, price, warnings, priceLimit, orderbook, trades, candles] = await Promise.all([
    toss.getStockInfo(symbol),
    toss.getPrice(symbol),
    toss.getStockWarnings(symbol),
    toss.getPriceLimit(symbol),
    includeOrderbook ? toss.getOrderbook(symbol) : Promise.resolve(undefined),
    includeTrades ? toss.getTrades(symbol, tradesCount) : Promise.resolve(undefined),
    includeCandles ? toss.getCandles({ symbol, interval: candleInterval, count: candleCount }) : Promise.resolve(undefined),
  ]);

  return cleanResult({
    symbol,
    stockInfo,
    price,
    warnings,
    priceLimit,
    orderbook,
    trades,
    candles,
  });
}

async function getAccountOverview(args: Record<string, unknown>): Promise<unknown> {
  const seq = accountSeq(args);
  const symbol = optionalSymbol(args, "symbol");
  const includeBuyingPower = optionalBoolean(args, "include_buying_power") ?? true;
  const includeCommissions = optionalBoolean(args, "include_commissions") ?? true;
  const includeOpenOrders = optionalBoolean(args, "include_open_orders") ?? true;

  const [accounts, holdings, buyingPowerKrw, buyingPowerUsd, commissions, openOrders] = await Promise.all([
    toss.getAccounts(),
    toss.getHoldings({ accountSeq: seq, symbol }),
    includeBuyingPower ? toss.getBuyingPower("KRW", seq) : Promise.resolve(undefined),
    includeBuyingPower ? toss.getBuyingPower("USD", seq) : Promise.resolve(undefined),
    includeCommissions ? toss.getCommissions(seq) : Promise.resolve(undefined),
    includeOpenOrders ? toss.getOrders({ status: "OPEN", symbol }, seq) : Promise.resolve(undefined),
  ]);

  return cleanResult({
    accountSeq: seq ?? defaultAccountSeq ?? "auto-first-account",
    accounts,
    holdings,
    buyingPower: includeBuyingPower ? { KRW: buyingPowerKrw, USD: buyingPowerUsd } : undefined,
    commissions,
    openOrders,
  });
}

async function checkOrderReadiness(args: Record<string, unknown>): Promise<unknown> {
  const order = orderCreate(args);
  const seq = accountSeq(args);

  const [stockInfo, price, warnings, priceLimit, commissions] = await Promise.all([
    toss.getStockInfo(order.symbol),
    toss.getPrice(order.symbol),
    toss.getStockWarnings(order.symbol),
    toss.getPriceLimit(order.symbol),
    toss.getCommissions(seq),
  ]);

  const requestedCurrency = optionalEnum(args, "currency", ["KRW", "USD"]);
  const currency = requestedCurrency ?? extractCurrency(stockInfo) ?? "KRW";
  const [buyingPower, sellableQuantity] = await Promise.all([
    order.side === "BUY" ? toss.getBuyingPower(currency, seq) : Promise.resolve(undefined),
    order.side === "SELL" ? toss.getSellableQuantity(order.symbol, seq) : Promise.resolve(undefined),
  ]);

  return cleanResult({
    valid: true,
    accountSeq: seq ?? defaultAccountSeq ?? "auto-first-account",
    requestBody: toApiOrderBody(order),
    localNotes: orderSafetyNotes(order),
    readiness: {
      currency,
      buyingPower,
      sellableQuantity,
      commissions,
    },
    market: {
      stockInfo,
      price,
      warnings,
      priceLimit,
    },
  });
}

function validateOrder(args: Record<string, unknown>): unknown {
  const order = orderCreate(args);
  return {
    valid: true,
    requestBody: toApiOrderBody(order),
    localNotes: orderSafetyNotes(order),
  };
}

function simpleOrder(args: Record<string, unknown>, side: "BUY" | "SELL", orderType: "LIMIT" | "MARKET"): OrderCreateRequest {
  return {
    symbol: requiredSymbol(args, "symbol"),
    side,
    orderType,
    timeInForce: optionalEnum(args, "time_in_force", ["DAY", "CLS"]),
    quantity: requiredDecimal(args, "quantity"),
    price: orderType === "LIMIT" ? requiredDecimal(args, "price") : undefined,
    clientOrderId: optionalString(args, "client_order_id", ["clientOrderId"]),
    confirmHighValueOrder: optionalBoolean(args, "confirm_high_value_order", ["confirmHighValueOrder"]),
  };
}

function toApiOrderBody(order: OrderCreateRequest): Record<string, unknown> {
  return cleanResult({
    clientOrderId: order.clientOrderId,
    symbol: order.symbol,
    side: order.side,
    orderType: order.orderType,
    timeInForce: order.timeInForce,
    quantity: order.quantity,
    price: order.price,
    orderAmount: order.orderAmount,
    confirmHighValueOrder: order.confirmHighValueOrder,
  });
}

function orderSafetyNotes(order: OrderCreateRequest): string[] {
  const notes = ["validate_order와 check_order_readiness는 실제 주문을 제출하지 않습니다."];
  if (!order.clientOrderId) notes.push("client_order_id가 없으면 멱등성이 적용되지 않습니다.");
  if (order.orderType === "MARKET") notes.push("시장가 주문은 체결 가격이 요청 시점의 현재가와 다를 수 있습니다.");
  if (order.orderAmount) notes.push("order_amount 기반 주문은 공식 문서상 US MARKET 주문 전용입니다.");
  if (order.timeInForce === "CLS") notes.push("CLS는 공식 문서상 미국 주식 지정가 주문 조합에서 사용합니다.");
  if (!order.confirmHighValueOrder) notes.push("1억원 이상 주문은 confirm_high_value_order=true가 필요할 수 있습니다.");
  return notes;
}

function cleanResult(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}

function extractCurrency(value: unknown): "KRW" | "USD" | undefined {
  if (!isRecord(value)) return undefined;
  if (value.currency === "KRW" || value.currency === "USD") return value.currency;
  return undefined;
}

function orderCreate(args: Record<string, unknown>): OrderCreateRequest {
  return {
    symbol: requiredSymbol(args, "symbol"),
    side: requiredEnum(args, "side", ["BUY", "SELL"]),
    orderType: requiredEnum(args, "order_type", ["LIMIT", "MARKET"], ["orderType"]),
    timeInForce: optionalEnum(args, "time_in_force", ["DAY", "CLS"], ["timeInForce"]),
    quantity: optionalDecimal(args, "quantity"),
    price: optionalDecimal(args, "price"),
    orderAmount: optionalDecimal(args, "order_amount", ["orderAmount"]),
    clientOrderId: optionalString(args, "client_order_id", ["clientOrderId"]),
    confirmHighValueOrder: optionalBoolean(args, "confirm_high_value_order", ["confirmHighValueOrder"]),
  };
}

function orderModify(args: Record<string, unknown>): OrderModifyRequest {
  return {
    orderType: requiredEnum(args, "order_type", ["LIMIT", "MARKET"], ["orderType"]),
    quantity: optionalDecimal(args, "quantity"),
    price: optionalDecimal(args, "price"),
    confirmHighValueOrder: optionalBoolean(args, "confirm_high_value_order", ["confirmHighValueOrder"]),
  };
}

function orderListParams(args: Record<string, unknown>): OrderListParams {
  return {
    status: optionalEnum(args, "status", ["OPEN", "CLOSED"]),
    symbol: optionalSymbol(args, "symbol"),
    from: optionalString(args, "from"),
    to: optionalString(args, "to"),
    cursor: optionalString(args, "cursor"),
    limit: optionalInt(args, "limit", { min: 1, max: 100 }),
  };
}

function symbols(args: Record<string, unknown>): string[] {
  const value = args.symbols;

  if (Array.isArray(value)) {
    const list = value.map((item) => assertSymbol(String(item), "symbols"));
    if (list.length < 1 || list.length > 200) throw new Error("symbols는 1개 이상 200개 이하로 입력해주세요.");
    return list;
  }

  if (typeof value === "string") {
    const list = value.split(",").map((item) => assertSymbol(item.trim(), "symbols")).filter(Boolean);
    if (list.length < 1 || list.length > 200) throw new Error("symbols는 1개 이상 200개 이하로 입력해주세요.");
    return list;
  }

  throw new Error("symbols가 필요합니다.");
}

function accountSeq(args: Record<string, unknown>): string | undefined {
  const value = getValue(args, "account_seq", ["accountSeq"]);
  if (value === undefined) return undefined;
  const seq = String(value);
  if (!/^\d+$/.test(seq)) throw new Error("account_seq는 숫자여야 합니다.");
  return seq;
}

function requiredSymbol(args: Record<string, unknown>, key: string): string {
  return assertSymbol(requiredString(args, key), key);
}

function optionalSymbol(args: Record<string, unknown>, key: string): string | undefined {
  const value = optionalString(args, key);
  return value === undefined ? undefined : assertSymbol(value, key);
}

function assertSymbol(value: string, key: string): string {
  if (!/^[A-Za-z0-9.\-]+$/.test(value)) {
    throw new Error(`${key}는 영문, 숫자, '.', '-'만 사용할 수 있습니다.`);
  }
  return value;
}

function requiredDecimal(args: Record<string, unknown>, key: string, aliases: string[] = []): string {
  const value = getValue(args, key, aliases);
  if (value === undefined) throw new Error(`${key}가 필요합니다.`);
  const decimal = String(value);
  if (!/^\d+(\.\d+)?$/.test(decimal)) throw new Error(`${key}는 양수 숫자여야 합니다.`);
  return decimal;
}

function optionalDecimal(args: Record<string, unknown>, key: string, aliases: string[] = []): string | undefined {
  const value = getValue(args, key, aliases);
  if (value === undefined) return undefined;
  const decimal = String(value);
  if (!/^\d+(\.\d+)?$/.test(decimal)) throw new Error(`${key}는 양수 숫자여야 합니다.`);
  return decimal;
}

function requiredString(args: Record<string, unknown>, key: string, aliases: string[] = []): string {
  const value = getValue(args, key, aliases);
  if (value === undefined || value === "") throw new Error(`${key}가 필요합니다.`);
  if (typeof value !== "string" && typeof value !== "number") throw new Error(`${key}는 문자열이어야 합니다.`);
  return String(value);
}

function optionalString(args: Record<string, unknown>, key: string, aliases: string[] = []): string | undefined {
  const value = getValue(args, key, aliases);
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" && typeof value !== "number") throw new Error(`${key}는 문자열이어야 합니다.`);
  return String(value);
}

function requiredEnum<const T extends string>(
  args: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  aliases: string[] = [],
): T {
  const value = requiredString(args, key, aliases);
  if (!allowed.includes(value as T)) throw new Error(`${key}는 ${allowed.join(", ")} 중 하나여야 합니다.`);
  return value as T;
}

function optionalEnum<const T extends string>(
  args: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  aliases: string[] = [],
): T | undefined {
  const value = optionalString(args, key, aliases);
  if (value === undefined) return undefined;
  if (!allowed.includes(value as T)) throw new Error(`${key}는 ${allowed.join(", ")} 중 하나여야 합니다.`);
  return value as T;
}

function optionalBoolean(args: Record<string, unknown>, key: string, aliases: string[] = []): boolean | undefined {
  const value = getValue(args, key, aliases);
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${key}는 boolean이어야 합니다.`);
}

function optionalInt(
  args: Record<string, unknown>,
  key: string,
  opts: { min?: number; max?: number } = {},
): number | undefined {
  const value = getValue(args, key);
  if (value === undefined || value === "") return undefined;
  const num = Number(value);
  if (!Number.isInteger(num)) throw new Error(`${key}는 정수여야 합니다.`);
  if (opts.min !== undefined && num < opts.min) throw new Error(`${key}는 ${opts.min} 이상이어야 합니다.`);
  if (opts.max !== undefined && num > opts.max) throw new Error(`${key}는 ${opts.max} 이하여야 합니다.`);
  return num;
}

function getValue(args: Record<string, unknown>, key: string, aliases: string[] = []): unknown {
  for (const candidate of [key, ...aliases]) {
    if (Object.hasOwn(args, candidate)) return args[candidate];
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const transport = new StdioServerTransport();
await server.connect(transport);

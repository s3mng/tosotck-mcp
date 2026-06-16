import { BASE, getToken } from "./auth.js";

type ParamValue = string | number | boolean | undefined;

interface RequestOptions {
  account?: boolean;
  accountSeq?: string;
  body?: unknown;
  params?: Record<string, ParamValue>;
}

interface ApiResponse<T> {
  result: T;
}

export interface OrderCreateRequest {
  clientOrderId?: string;
  symbol: string;
  side: "BUY" | "SELL";
  orderType: "LIMIT" | "MARKET";
  timeInForce?: "DAY" | "CLS";
  quantity?: string;
  price?: string;
  orderAmount?: string;
  confirmHighValueOrder?: boolean;
}

export interface OrderModifyRequest {
  orderType: "LIMIT" | "MARKET";
  quantity?: string;
  price?: string;
  confirmHighValueOrder?: boolean;
}

export interface OrderListParams {
  status?: "OPEN" | "CLOSED";
  symbol?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export class TossClient {
  private accountSeq: string | null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    accountSeq?: string,
  ) {
    this.accountSeq = accountSeq ?? null;
  }

  private async authHeaders(opts: Pick<RequestOptions, "account" | "accountSeq"> = {}): Promise<Record<string, string>> {
    const token = await getToken(this.clientId, this.clientSecret);
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };

    if (opts.account) {
      headers["X-Tossinvest-Account"] = opts.accountSeq ?? await this.getAccountSeq();
    }

    return headers;
  }

  private async getAccountSeq(): Promise<string> {
    if (this.accountSeq) return this.accountSeq;

    const accounts = await this.getAccounts();
    const first = accounts[0];
    if (!first) {
      throw new Error("사용 가능한 토스증권 계좌가 없습니다. get_accounts 결과를 확인하거나 TOSS_ACCOUNT_SEQ를 지정해주세요.");
    }

    this.accountSeq = String(first.accountSeq);
    return this.accountSeq;
  }

  private async request<T>(
    method: string,
    path: string,
    opts: RequestOptions = {},
  ): Promise<T> {
    const headers = await this.authHeaders(opts);
    const url = new URL(`${BASE}${path}`);

    if (opts.params) {
      for (const [key, value] of Object.entries(opts.params)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }

    const res = await fetch(url, {
      method,
      headers: {
        ...headers,
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    const text = await res.text();
    const data = parseJson(text);

    if (!res.ok) {
      throw new Error(formatApiError(method, path, res, data, text));
    }

    return data as T;
  }

  private async result<T>(method: string, path: string, opts?: RequestOptions): Promise<T> {
    const data = await this.request<ApiResponse<T>>(method, path, opts);
    return data.result;
  }

  // 계좌/자산

  async getAccounts(): Promise<Account[]> {
    return this.result<Account[]>("GET", "/api/v1/accounts");
  }

  async getHoldings(opts: { accountSeq?: string; symbol?: string } = {}): Promise<unknown> {
    return this.result("GET", "/api/v1/holdings", {
      account: true,
      accountSeq: opts.accountSeq,
      params: { symbol: opts.symbol },
    });
  }

  // 시세

  async getOrderbook(symbol: string): Promise<unknown> {
    return this.result("GET", "/api/v1/orderbook", { params: { symbol } });
  }

  async getPrices(symbols: string[]): Promise<unknown[]> {
    return this.result<unknown[]>("GET", "/api/v1/prices", { params: { symbols: symbols.join(",") } });
  }

  async getPrice(symbol: string): Promise<unknown> {
    const prices = await this.getPrices([symbol]);
    return prices[0] ?? null;
  }

  async getTrades(symbol: string, count?: number): Promise<unknown[]> {
    return this.result<unknown[]>("GET", "/api/v1/trades", { params: { symbol, count } });
  }

  async getPriceLimit(symbol: string): Promise<unknown> {
    return this.result("GET", "/api/v1/price-limits", { params: { symbol } });
  }

  async getCandles(opts: {
    symbol: string;
    interval: "1m" | "1d";
    count?: number;
    before?: string;
    adjusted?: boolean;
  }): Promise<unknown> {
    return this.result("GET", "/api/v1/candles", {
      params: {
        symbol: opts.symbol,
        interval: opts.interval,
        count: opts.count,
        before: opts.before,
        adjusted: opts.adjusted,
      },
    });
  }

  // 종목/시장 정보

  async getStocks(symbols: string[]): Promise<unknown[]> {
    return this.result<unknown[]>("GET", "/api/v1/stocks", { params: { symbols: symbols.join(",") } });
  }

  async getStockInfo(symbol: string): Promise<unknown> {
    const stocks = await this.getStocks([symbol]);
    return stocks[0] ?? null;
  }

  async getStockWarnings(symbol: string): Promise<unknown[]> {
    return this.result<unknown[]>("GET", `/api/v1/stocks/${encodeURIComponent(symbol)}/warnings`);
  }

  async getExchangeRate(opts: {
    baseCurrency: "KRW" | "USD";
    quoteCurrency: "KRW" | "USD";
    dateTime?: string;
  }): Promise<unknown> {
    return this.result("GET", "/api/v1/exchange-rate", {
      params: {
        baseCurrency: opts.baseCurrency,
        quoteCurrency: opts.quoteCurrency,
        dateTime: opts.dateTime,
      },
    });
  }

  async getKrMarketCalendar(date?: string): Promise<unknown> {
    return this.result("GET", "/api/v1/market-calendar/KR", { params: { date } });
  }

  async getUsMarketCalendar(date?: string): Promise<unknown> {
    return this.result("GET", "/api/v1/market-calendar/US", { params: { date } });
  }

  // 주문

  async placeOrder(order: OrderCreateRequest, accountSeq?: string): Promise<unknown> {
    validateOrderCreate(order);
    return this.result("POST", "/api/v1/orders", {
      account: true,
      accountSeq,
      body: cleanObject(order),
    });
  }

  async modifyOrder(orderId: string, order: OrderModifyRequest, accountSeq?: string): Promise<unknown> {
    validateOrderModify(order);
    return this.result("POST", `/api/v1/orders/${encodeURIComponent(orderId)}/modify`, {
      account: true,
      accountSeq,
      body: cleanObject(order),
    });
  }

  async cancelOrder(orderId: string, accountSeq?: string): Promise<unknown> {
    return this.result("POST", `/api/v1/orders/${encodeURIComponent(orderId)}/cancel`, {
      account: true,
      accountSeq,
      body: {},
    });
  }

  async getOrders(params: OrderListParams = {}, accountSeq?: string): Promise<unknown> {
    return this.result("GET", "/api/v1/orders", {
      account: true,
      accountSeq,
      params: {
        status: params.status ?? "OPEN",
        symbol: params.symbol,
        from: params.from,
        to: params.to,
        cursor: params.cursor,
        limit: params.limit,
      },
    });
  }

  async getOrder(orderId: string, accountSeq?: string): Promise<unknown> {
    return this.result("GET", `/api/v1/orders/${encodeURIComponent(orderId)}`, {
      account: true,
      accountSeq,
    });
  }

  async getBuyingPower(currency: "KRW" | "USD", accountSeq?: string): Promise<unknown> {
    return this.result("GET", "/api/v1/buying-power", {
      account: true,
      accountSeq,
      params: { currency },
    });
  }

  async getSellableQuantity(symbol: string, accountSeq?: string): Promise<unknown> {
    return this.result("GET", "/api/v1/sellable-quantity", {
      account: true,
      accountSeq,
      params: { symbol },
    });
  }

  async getCommissions(accountSeq?: string): Promise<unknown[]> {
    return this.result<unknown[]>("GET", "/api/v1/commissions", {
      account: true,
      accountSeq,
    });
  }
}

function validateOrderCreate(order: OrderCreateRequest): void {
  if (order.orderType === "LIMIT" && !order.price) {
    throw new Error("LIMIT 주문에는 price가 필요합니다.");
  }
  if (order.orderType === "MARKET" && order.price !== undefined) {
    throw new Error("MARKET 주문에는 price를 전달할 수 없습니다.");
  }
  if (!order.quantity && !order.orderAmount) {
    throw new Error("주문에는 quantity 또는 orderAmount 중 하나가 필요합니다.");
  }
  if (order.quantity && order.orderAmount) {
    throw new Error("quantity와 orderAmount는 동시에 전달할 수 없습니다.");
  }
  if (order.orderAmount && order.orderType !== "MARKET") {
    throw new Error("orderAmount는 US MARKET 주문에만 사용할 수 있습니다.");
  }
}

function validateOrderModify(order: OrderModifyRequest): void {
  if (order.orderType === "LIMIT" && !order.price) {
    throw new Error("LIMIT 정정에는 price가 필요합니다.");
  }
  if (order.orderType === "MARKET" && order.price !== undefined) {
    throw new Error("MARKET 정정에는 price를 전달할 수 없습니다.");
  }
}

function cleanObject(obj: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function formatApiError(method: string, path: string, res: Response, data: unknown, text: string): string {
  const requestId = res.headers.get("x-request-id") ?? res.headers.get("cf-ray");
  const retryAfter = res.headers.get("retry-after");
  const message = extractErrorMessage(data) ?? (text || res.statusText);
  const details = [
    `${method} ${path} -> ${res.status}: ${message}`,
    requestId ? `requestId=${requestId}` : undefined,
    retryAfter ? `retryAfter=${retryAfter}s` : undefined,
  ].filter(Boolean);

  return details.join(" ");
}

function extractErrorMessage(data: unknown): string | undefined {
  if (!isRecord(data)) return undefined;
  const error = data.error;

  if (isRecord(error)) {
    const code = typeof error.code === "string" ? error.code : undefined;
    const message = typeof error.message === "string" ? error.message : undefined;
    if (code && message) return `${code}: ${message}`;
    return message ?? code;
  }

  const oauthError = typeof error === "string" ? error : undefined;
  const description = typeof data.error_description === "string" ? data.error_description : undefined;
  if (oauthError && description) return `${oauthError}: ${description}`;
  return oauthError ?? description;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

interface Account {
  accountSeq: number;
  [key: string]: unknown;
}
